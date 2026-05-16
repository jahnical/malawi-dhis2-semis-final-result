import { useEffect, useMemo, useState } from "react";
import { Form } from "react-final-form";
import { useSetRecoilState } from "recoil";
import { TableDataRefetch } from "dhis2-semis-types";
import { NoticeBox, Button, IconAddCircle24 } from "@dhis2/ui";
import useGetSelectedKeys from "../../hooks/config/useGetSelectedKeys";
import { WithBorder, ModalComponent, CustomForm, WithPadding } from "dhis2-semis-components";
import { useGetDataElements, useUploadEvents, useGetEvents, useUrlParams, RulesEngine } from "dhis2-semis-functions";
import { format } from "date-fns";
import { getContextualLabels } from "../../utils/common/getContextualLabels";
import { dataStoreRecord } from "src/types/dataStore/DataStoreConfig";

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
    const { getEvents } = useGetEvents()
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
            setOpen(false)
            return
        }

        for (const tei of selected) {
            const frEvents = await getEvents({
                program: tei?.programId, fields: "*",
                trackedEntities: tei?.trackedEntity,
                programStage: finalResult?.programStage
            })
            const selectedEnrollmentFrEvent = frEvents.find((x: any) => x.enrollment === tei?.enrollmentId)

            if (selectedEnrollmentFrEvent) {
                const existingDataValues = selectedEnrollmentFrEvent?.dataValues || []
                const mergedDataValuesMap = new Map<string, any>()

                for (const dataValue of existingDataValues) {
                    if (dataValue?.dataElement) {
                        mergedDataValuesMap.set(dataValue.dataElement, dataValue.value)
                    }
                }

                for (const dataValue of submittedDataValues) {
                    mergedDataValuesMap.set(dataValue.dataElement, dataValue.value)
                }

                const mergedDataValues = Array.from(mergedDataValuesMap.entries()).map(([dataElement, value]) => ({
                    dataElement,
                    value
                }))

                teis.push({
                    orgUnit: school,
                    trackedEntityType: trackedEntityType,
                    trackedEntity: selectedEnrollmentFrEvent?.trackedEntity,
                    enrollments: [
                        {
                            trackedEntity: tei?.trackedEntity,
                            enrollment: tei?.enrollmentId,
                            status: finalResult?.dropoutStatusValues?.includes(values[frStatus]) ? "CANCELLED" : "COMPLETED",
                            orgUnit: selectedEnrollmentFrEvent?.orgUnit,
                            program: selectedEnrollmentFrEvent?.program,
                            enrolledAt: selectedEnrollmentFrEvent?.occurredAt,
                            occurredAt: selectedEnrollmentFrEvent?.occurredAt,
                            trackedEntityType: trackedEntityType,
                            events: [
                                {
                                    ...selectedEnrollmentFrEvent,
                                    dataValues: mergedDataValues
                                }
                            ]
                        }
                    ]
                })
            }
            else {
                teis.push({
                    orgUnit: school,
                    trackedEntity: tei?.trackedEntity,
                    trackedEntityType: trackedEntityType,
                    enrollments: [
                        {
                            orgUnit: school,
                            program: tei?.programId,
                            trackedEntity: tei?.trackedEntity,
                            enrollment: tei?.enrollmentId,
                            trackedEntityType: trackedEntityType,
                            enrolledAt: format(new Date(), "yyyy-MM-dd"),
                            occurredAt: format(new Date(), "yyyy-MM-dd"),
                            status: finalResult?.dropoutStatusValues?.includes(values[frStatus]) ? "CANCELLED" : "COMPLETED",
                            events: [
                                {
                                    orgUnit: school,
                                    status: "COMPLETED",
                                    program: tei?.programId,
                                    programStage: finalResult?.programStage,
                                    occurredAt: format(new Date(), "yyyy-MM-dd"),
                                    scheduledAt: format(new Date(), "yyyy-MM-dd"),
                                    dataValues: submittedDataValues
                                }
                            ]
                        }
                    ]
                })
            }
        }

        await uploadValues({ trackedEntities: teis }, 'COMMIT', 'CREATE_AND_UPDATE')
            .then(() => { setLoading(false); setRefetch((prev: any) => (!prev)); setOpen(false) })
            .catch(() => { setLoading(false); setOpen(false) })
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
                            {i18n.t("The final result will be assigned to the selected students.")}.
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