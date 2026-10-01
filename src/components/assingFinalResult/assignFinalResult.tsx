import { useEffect, useMemo, useState } from "react";
import { Form } from "react-final-form";
import { useSetRecoilState } from "recoil";
import { TableDataRefetch } from "dhis2-semis-types";
import { NoticeBox, Button, IconAddCircle24 } from "@dhis2/ui";
import useGetSelectedKeys from "../../hooks/config/useGetSelectedKeys";
import { WithBorder, ModalComponent, CustomForm, WithPadding } from "dhis2-semis-components";
import { useGetDataElements, useUploadEvents, useGetEvents, useUrlParams, RulesEngine } from "dhis2-semis-functions";
import { useDataEngine } from "@dhis2/app-runtime";
import { format } from "date-fns";
import { finalResultTrackedEntity } from "../../utils/finalResult/finalResultPayload";
import { useShowAlerts } from 'dhis2-semis-functions';
import { getContextualLabels } from "../../utils/common/getContextualLabels";
import { dataStoreRecord } from "src/types/dataStore/DataStoreConfig";

const ENROLLMENT_QUERY: any = {
    enrollment: {
        resource: "tracker/enrollments",
        id: ({ id }: { id: string }) => id,
        params: { fields: "enrollment,trackedEntity,program,orgUnit,status,enrolledAt,occurredAt" },
    }
}

export default function AsssignFinalResult({ selected, i18n }: { selected: any[], i18n: any }) {
    const { dataStoreData, program } = useGetSelectedKeys()
    const { "final-result": finalResult, trackedEntityType } = dataStoreData as unknown as dataStoreRecord || {}
    const { dataElements } = useGetDataElements({
        programStageId: finalResult?.programStage || '',
        type: "programStage"
    })
    const { urlParameters } = useUrlParams()
    const { school, sectionType } = urlParameters
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [formValues, setFormValues] = useState<{ [key: string]: any }>({ orgUnit: school })
    const { uploadValues } = useUploadEvents()
    const { show } = useShowAlerts()
    const { getEvents } = useGetEvents()
    const engine = useDataEngine()
    const setRefetch = useSetRecoilState(TableDataRefetch);
    const labels = getContextualLabels(sectionType as string)

    const stableDataElements = useMemo(
        () => dataElements || [],
        [JSON.stringify(dataElements || [])]
    );

    const groupedFields = useMemo(() => [{
        storyBook: false,
        name: labels.assignFormName,
        description: labels.assignFormDescription,
        fields: stableDataElements
    }], [stableDataElements, labels.assignFormName, labels.assignFormDescription]);

    const { runRulesEngine, updatedVariables } = RulesEngine({
        values: formValues,
        variables: groupedFields,
        program: program!.id,
        type: "programStageSection",
    });

    useEffect(() => {
        if (!open) return;
        runRulesEngine({ overrideVariables: groupedFields, overrideValues: formValues });
    }, [open, formValues, groupedFields]);

    useEffect(() => {
        setFormValues((prev) => ({ ...prev, orgUnit: school }));
    }, [school]);

    const handleSetFormValues = (values: Record<string, any>) => {
        const nextValues = { ...values, orgUnit: school };
        setFormValues((prev) => {
            const isSame = JSON.stringify(prev) === JSON.stringify(nextValues);
            return isSame ? prev : nextValues;
        });
    };

    async function formSubmit(values: any) {
        setLoading(true)
        try {
        let teis = []
        const frStatus =
            finalResult?.status ||
            stableDataElements?.[0]?.id ||
            Object.keys(values).find((key) => key !== "orgUnit")

        const allowedDataElements = new Set((stableDataElements || []).map((field: any) => field?.id).filter(Boolean))
        const submittedDataValues = Object.entries(values || {})
            .filter(([key, value]) => {
                if (!allowedDataElements.has(key)) return false
                if (value === undefined || value === null) return false
                if (typeof value === "string" && value.trim() === "") return false
                return true
            })
            .map(([dataElement, value]) => ({ dataElement, value: value as any }))

        if (!frStatus) {
            setLoading(false)
            show({ message: i18n.t('Please configure the final result field before submitting.'), type: { critical: true } })
            return
        }

        for (const tei of selected) {
            const frEvents = await getEvents({
                program: tei?.programId, fields: "*",
                trackedEntities: tei?.trackedEntity,
                programStage: finalResult?.programStage
            })
            if (!Array.isArray(frEvents)) throw new Error(i18n.t('Could not load the existing results. Please try again.'))
            const selectedEnrollmentFrEvent = frEvents.find((x: any) => x.enrollment === tei?.enrollmentId)

            // The enrollment keeps its own org unit and dates; only its status changes
            const enrollment: any = await engine.query(ENROLLMENT_QUERY, { variables: { id: tei?.enrollmentId } })
                .then((response: any) => response?.enrollment)
                .catch(() => undefined)
            if (!enrollment?.enrollment) throw new Error(i18n.t('Could not load the enrollment. Please try again.'))

            teis.push(finalResultTrackedEntity({
                enrollment,
                trackedEntity: tei?.trackedEntity,
                trackedEntityType,
                program: tei?.programId ?? enrollment.program,
                existingEvent: selectedEnrollmentFrEvent,
                submittedDataValues,
                statusDataElement: frStatus,
                dropoutStatusValues: finalResult?.dropoutStatusValues,
                programStage: finalResult?.programStage,
                eventOrgUnit: tei?.orgUnitId ?? school,
                trackedEntityOrgUnit: school as string,
                today: format(new Date(), "yyyy-MM-dd"),
            }))
        }

        await uploadValues({ trackedEntities: teis }, 'COMMIT', 'CREATE_AND_UPDATE')
            .then(() => { setLoading(false); setRefetch((prev: any) => (!prev)); setOpen(false) })
            .catch(() => { /* The upload hook displays the error; retain the form. */ })
        } catch (error: any) {
            show({ message: error?.message ?? i18n.t('Could not save the final result.'), type: { critical: true } })
        } finally {
            setLoading(false)
        }
    }


    return (
        <>
            <Button disabled={selected?.length == 0} onClick={() => {
                setOpen(true);
            }} icon={<IconAddCircle24 />}
            >
                <span>{labels.assignButtonLabel}</span>
            </Button >

            {
                open && <ModalComponent
                    children={<WithPadding>
                        <NoticeBox title={`${i18n.t("WARNING")}! ${selected.length} ${i18n.t("rows will be affected")}`} warning>
                            {i18n.t("The final result will be assigned to the selected learners.")}.
                        </NoticeBox>
                        <WithBorder type="all" >
                            <WithPadding>
                                <CustomForm
                                    Form={Form}
                                    loading={loading}
                                    initialValues={{ orgUnit: school }}
                                    setFormValues={handleSetFormValues}
                                    formFields={updatedVariables}
                                    storyBook={false}
                                    withButtons={true}
                                    onFormSubtmit={(e: any) => formSubmit(e)}
                                    onCancel={() => setOpen(false)}
                                />
                            </WithPadding>
                        </WithBorder>
                    </WithPadding>}
                    open={open}
                    handleClose={() => setOpen(false)}
                    title={labels.assignModalTitle}
                />
            }
        </>
    );
}
