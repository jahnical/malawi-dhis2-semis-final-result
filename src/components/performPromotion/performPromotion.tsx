import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Form } from "react-final-form";
import { NoticeBox, Button, IconAddCircle24, CircularLoader, Center } from "@dhis2/ui";
import useGetSelectedKeys from "../../hooks/config/useGetSelectedKeys";
import { RulesEngine, useSectionProfile, useUrlParams } from "dhis2-semis-functions";
import { usePromoteStudents } from "../../hooks/promote/usePromoteStudents";
import { WithBorder, CustomForm, ModalComponent, WithPadding } from "dhis2-semis-components";
import { Tooltip } from "@mui/material";
import { getContextualLabels } from "../../utils/common/getContextualLabels";
import { useAccessibleOrgUnits } from "../../hooks/common/useAccessibleOrgUnits";

export default function PerformPromotion({ selected, setStats, openStats, formData = [], i18n }: { openStats: (args: boolean) => void, setStats: any, selected: any[], formData: any[], i18n: any }) {
    const { urlParameters } = useUrlParams()
    const { schoolName, school, sectionType } = urlParameters
    const { program: programData, dataStoreData } = useGetSelectedKeys()
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const { promote } = usePromoteStudents({ selected, setOpen: openStats, setStats, setOpenPerform: setOpen, setLoading })
    const labels = getContextualLabels(sectionType as string)
    const { promotionChoosesOrgUnit, promotionSkipsExistingYear } = useSectionProfile()
    const { orgUnits, loading: orgUnitsLoading, error: orgUnitsError, retry, hasOrgUnits } = useAccessibleOrgUnits()

    const getInitialOrgUnit = () => {
        if (!promotionChoosesOrgUnit || !orgUnits.length) return school;
        const currentSchoolExists = orgUnits.some(ou => ou.id === school);
        return currentSchoolExists ? school : orgUnits[0]?.id;
    };

    const [selectedOrgUnit, setSelectedOrgUnit] = useState<string | undefined>(getInitialOrgUnit() || undefined);
    const [values, setValues] = useState<{ [key: string]: any }>({ orgUnit: school || undefined });

    const finalResultConfig = dataStoreData?.["final-result"];
    const statusDataElementId = finalResultConfig?.status;
    const validStatusValues = (finalResultConfig as any)?.dropoutStatusValues || [];
    const hasValidConfiguration = validStatusValues.length > 0;

    const nonPromotableEntities = selected.filter(entity => {
        const dvs = entity.frEvent?.dataValues ?? [];

        if (dvs.length === 0) return true;

        const hasValidStatus = dvs.some((dv: any) =>
            dv.dataElement === statusDataElementId &&
            !validStatusValues.map((v: string) => v.toLowerCase()).includes(dv.value?.toLowerCase())
        );

        return !hasValidStatus;
    });


    const { runRulesEngine, updatedVariables } = RulesEngine({
        program: programData?.id!,
        type: "programStage",
        values: values,
        variables: formData
    })

    useEffect(() => {
        setValues({
            ...values,
            orgUnit: school
        });
    }, [school])

    useEffect(() => {
        if (promotionChoosesOrgUnit && orgUnits.length > 0) {
            const initialOrgUnit = getInitialOrgUnit();
            setSelectedOrgUnit(initialOrgUnit || undefined);
        }
    }, [orgUnits, promotionChoosesOrgUnit])


    useEffect(() => {
        runRulesEngine()
    }, [values])

    const modifyRegisteringSchoolField = (fields: any[]) => {
        if (!promotionChoosesOrgUnit) return fields;

        return fields.map(field => {
            if (field.name === 'registeringSchool') {
                return {
                    ...field,
                    disabled: false,
                    valueType: "ORGANISATION_UNIT",
                    options: orgUnits.map(ou => ({
                        code: ou.id,
                        label: ou.displayName,
                        value: ou.id,
                        name: ou.displayName
                    })),
                    searchable: true,
                    required: true,
                    assignedValue: selectedOrgUnit || school
                };
            }
            return field;
        });
    }


    const handleChange = (e: { field: any; value: string; name: string }) => {
        const { name, value } = e;

        if (name === 'registeringSchool' && promotionChoosesOrgUnit) {
            setSelectedOrgUnit(value);
        }

        setValues(prev => ({
            ...prev,
            [name]: value,
        }));
    };

    const onClick = async (values: any) => {
        await promote(values);
    }


    const getTooltipMessage = () => {
        if (!hasValidConfiguration) {
            return i18n.t(`Configuration error. ValidStatusValue not set in DataStore for {{sectionType}}`,
                {
                    sectionType: sectionType
                }
            );
        }
        if (nonPromotableEntities?.length > 0) {
            return labels.noResultMessage;
        }
        return "";
    };

    return (
        <>
            <Tooltip
                title={getTooltipMessage()}
            >
                <Button disabled={!hasValidConfiguration || nonPromotableEntities?.length > 0 || selected.length == 0} onClick={() => {
                    setOpen(true);
                }} icon={<IconAddCircle24 />}
                >
                    <span>{labels.promoteButtonLabel}</span>
                </Button >
            </Tooltip>
            {
                open && <ModalComponent
                    children={<WithPadding>
                        <NoticeBox warning title={selected.length === 1
                            ? i18n.t("1 {{entity}} selected", { entity: labels.entityName })
                            : i18n.t("{{count}} {{entities}} selected", { count: selected.length, entities: labels.entityNamePlural })}>
                            {i18n.t("Each selected {{entity}} gets a new enrollment in the academic year chosen below.", { entity: labels.entityName })}
                            {promotionSkipsExistingYear ? ` ${i18n.t("Anyone already enrolled in that year is skipped.")}` : ""}
                        </NoticeBox>
                        <WithPadding />

                        {promotionChoosesOrgUnit && orgUnitsLoading && (
                            <Center>
                                <CircularLoader small />
                                <p>Loading organization units...</p>
                            </Center>
                        )}

                        {promotionChoosesOrgUnit && orgUnitsError && (
                            <NoticeBox error title={i18n.t("Error loading organization units")}>
                                {i18n.t("Failed to load accessible organization units")}. {orgUnitsError.message}
                                <WithPadding />
                                <Button onClick={retry}>Retry</Button>
                            </NoticeBox>
                        )}

                        {promotionChoosesOrgUnit && !orgUnitsLoading && !orgUnitsError && !hasOrgUnits && (
                            <NoticeBox error title={i18n.t("No accessible organization units")}>
                                {i18n.t("You do not have data-entry access to any organization units. Contact your administrator to grant you the necessary permissions")}.
                            </NoticeBox>
                        )}

                        {((promotionChoosesOrgUnit && hasOrgUnits && !orgUnitsLoading && !orgUnitsError) || !promotionChoosesOrgUnit) && (
                            <WithBorder type="all" >
                                <WithPadding>
                                    <CustomForm
                                        Form={Form}
                                        loading={loading}
                                        initialValues={{
                                            registeringSchool: promotionChoosesOrgUnit ? (selectedOrgUnit || school) : schoolName,
                                            enrollment_date: format(new Date(), 'yyyy-MM-dd')
                                        }}
                                        formFields={[
                                            {
                                                storyBook: false,
                                                name: labels.formName,
                                                description: labels.formDescription,
                                                fields: modifyRegisteringSchoolField(updatedVariables || []),
                                            }
                                        ]}
                                        storyBook={false}
                                        withButtons={true}
                                        onFormSubtmit={(values) => onClick(values)}
                                        onCancel={() => setOpen(false)}
                                        setFormValues={setValues}
                                        onInputChange={handleChange}
                                    />
                                </WithPadding>
                            </WithBorder>
                        )}
                    </WithPadding>}
                    open={open}
                    handleClose={() => setOpen(false)}
                    title={labels.promoteModalTitle}
                />
            }
        </>
    );
}