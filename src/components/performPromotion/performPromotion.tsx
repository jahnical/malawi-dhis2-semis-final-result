import { useEffect, useMemo, useState } from "react";
import { Form } from "react-final-form";
import { NoticeBox, Button, ButtonStrip, IconAddCircle24, CircularLoader, Center } from "@dhis2/ui";
import useGetSelectedKeys from "../../hooks/config/useGetSelectedKeys";
import { getAcademicYearOptions, RulesEngine, useSectionProfile, useShowAlerts, useUrlParams } from "dhis2-semis-functions";
import { usePromoteStudents } from "../../hooks/promote/usePromoteStudents";
import { WithBorder, CustomForm, ModalComponent, WithPadding, useSchoolCalendarKey } from "dhis2-semis-components";
import { TextField, Tooltip } from "@mui/material";
import { getContextualLabels } from "../../utils/common/getContextualLabels";
import { useAccessibleOrgUnits } from "../../hooks/common/useAccessibleOrgUnits";
import { classifyDecision, dataElementOptions, nextAcademicYear, optionLabel, progressionState, promotionGroups, type PromotionGroup, type Progression, type ProgressionState } from "../../utils/progression/progression";
import styles from "./performPromotion.module.css";

// Chosen for a group to leave its learners out of this run (e.g. the last grade)
const SKIP = "__skip__"

export default function PerformPromotion({ selected, setStats, openStats, formData = [], i18n, progression, openRequest }: {
    openStats: (args: boolean) => void, setStats: any, selected: any[], formData: any[], i18n: any
    // Next-year status by enrollment, to leave out learners already enrolled in a later year
    progression?: Map<string, Progression>
    // Opens the modal when it changes (the page's "Enroll in next year" shortcuts)
    openRequest?: number
}) {
    const { urlParameters } = useUrlParams()
    const { schoolName, school, sectionType, academicYear: currentAcademicYear } = urlParameters
    const schoolCalendar = useSchoolCalendarKey()
    const { program: programData, dataStoreData } = useGetSelectedKeys()
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const { promote } = usePromoteStudents({ selected, setOpen: openStats, setStats, setOpenPerform: setOpen, setLoading })
    const labels = getContextualLabels(sectionType as string)
    const { promotionChoosesOrgUnit, promotionSkipsExistingYear } = useSectionProfile()
    const { orgUnits, loading: orgUnitsLoading, error: orgUnitsError, retry, hasOrgUnits } = useAccessibleOrgUnits()
    const { show } = useShowAlerts()

    const getInitialOrgUnit = () => {
        if (!promotionChoosesOrgUnit || !orgUnits.length) return school;
        const currentSchoolExists = orgUnits.some(ou => ou.id === school);
        return currentSchoolExists ? school : orgUnits[0]?.id;
    };

    const [selectedOrgUnit, setSelectedOrgUnit] = useState<string | undefined>(getInitialOrgUnit() || undefined);
    const [values, setValues] = useState<{ [key: string]: any }>({ orgUnit: school || undefined });
    // Grade chosen for a group instead of the suggested one, by group key
    const [gradeOverrides, setGradeOverrides] = useState<Record<string, string>>({})
    // Prefilled with the year after the list's year; can be changed (e.g. a gap year)
    const [targetYear, setTargetYear] = useState("")

    const finalResultConfig = dataStoreData?.["final-result"] as any;
    const statusDataElementId = finalResultConfig?.status;
    const dropoutStatusValues: string[] = finalResultConfig?.dropoutStatusValues || [];
    const hasValidConfiguration = dropoutStatusValues.length > 0;
    const gradeDataElement = dataStoreData?.registration?.grade as string | undefined
    const gradeOptions = useMemo(() => dataElementOptions(programData, gradeDataElement), [programData, gradeDataElement])
    const decisionOptions = useMemo(() => dataElementOptions(programData, statusDataElementId), [programData, statusDataElementId])
    // With grades in an option set, each group gets its own grade; otherwise the form's grade applies to all
    const gradePerGroup = Boolean(gradeDataElement) && gradeOptions.length > 0

    // The academic year field's own options (the years in the school calendar)
    const academicYearDataElement = (dataStoreData?.registration?.academicYear || schoolCalendar?.academicYear) as string | undefined
    const yearOptions = useMemo(() => {
        const field = formData.find((item: any) => item?.id === academicYearDataElement)
        return (field?.options?.optionSet?.options ?? [])
            .filter((option: any) => option?.value !== undefined && option?.value !== null)
            .map((option: any) => ({ value: String(option.value), label: option?.label ?? String(option.value) }))
    }, [formData, academicYearDataElement])
    const suggestedYear = useMemo(() => nextAcademicYear(currentAcademicYear, yearOptions, {
        calendars: schoolCalendar?.schoolCalendar ?? [], options: getAcademicYearOptions(programData, academicYearDataElement),
    }), [currentAcademicYear, yearOptions, schoolCalendar, programData, academicYearDataElement])
    // With year options the year is chosen above the form, prefilled; otherwise the form asks for it
    const yearAboveForm = Boolean(academicYearDataElement) && yearOptions.length > 0

    // Every selected learner, with whether they can be enrolled now.
    // The loaded next-year status is preferred: it is read from the server after the last save, while
    // the row may still be the one shown before a decision was recorded
    const candidates = useMemo(() => selected.map((tei) => {
        const known = progression?.get(tei?.enrollmentId)
        const currentGrade = gradeDataElement ? tei?.[gradeDataElement] : undefined
        if (known) return { tei, decisionValue: known.decisionValue, decision: known.decision, state: known.state, currentGrade }
        const decisionValue = (tei?.frEvent?.dataValues ?? []).find((dv: any) => dv.dataElement === statusDataElementId)?.value
        const decision = classifyDecision(decisionValue, { validStatusValues: finalResultConfig?.validStatusValue, dropoutStatusValues, label: optionLabel(decisionOptions, decisionValue) })
        const state: ProgressionState = progressionState({ decision, enrollmentStatus: tei?.status })
        return { tei, decisionValue, decision, state, currentGrade }
    }), [selected, progression, statusDataElementId, JSON.stringify(finalResultConfig?.validStatusValue), JSON.stringify(dropoutStatusValues), gradeDataElement])

    const eligible = candidates.filter((c) => c.state === 'AWAITING')
    const skipped = {
        NO_DECISION: candidates.filter((c) => c.state === 'NO_DECISION').length,
        DROPOUT: candidates.filter((c) => c.state === 'DROPOUT').length,
        ENROLLED: candidates.filter((c) => c.state === 'ENROLLED').length,
    }
    const groups = useMemo(() => promotionGroups(eligible.map((c) => ({ ...c, learner: c.tei })), gradeOptions),
        [JSON.stringify(eligible.map((c) => [c.tei?.enrollmentId, c.decisionValue, c.currentGrade])), gradeOptions])
    const targetOf = (group: PromotionGroup<any>) => gradeOverrides[group.key] ?? group.suggested
    const groupsWithoutGrade = gradePerGroup ? groups.filter((group) => !targetOf(group)).length : 0
    const learnersToEnroll = gradePerGroup
        ? groups.filter((group) => targetOf(group) && targetOf(group) !== SKIP).reduce((sum, group) => sum + group.learners.length, 0)
        : eligible.length

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

    // A new run starts from the suggested year and grades
    useEffect(() => {
        if (!open) return
        setGradeOverrides({})
        setTargetYear(suggestedYear ?? "")
    }, [open])

    useEffect(() => {
        if (openRequest && eligible.length > 0 && hasValidConfiguration) setOpen(true)
    }, [openRequest])

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

    // The year and the grade are set above the form, so the form leaves them out
    const leftOut = (field: any, dataElement?: string) => Boolean(dataElement) && (field?.id === dataElement || field?.name === dataElement)
    const formFields = (fields: any[]) => fields.filter((field) =>
        !(yearAboveForm && leftOut(field, academicYearDataElement)) && !(gradePerGroup && leftOut(field, gradeDataElement)))
    const shownFields = formFields(modifyRegisteringSchoolField(updatedVariables || []))
    const isEmpty = (value: unknown) => value === undefined || value === null || String(value).trim() === ""


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

    // The modal has its own Submit: with the year prefilled, the form may have nothing left to change,
    // and the shared form only enables its button once something changed
    const submit = async () => {
        const missing = shownFields
            .filter((field: any) => field?.visible !== false && field?.required && !field?.disabled && isEmpty(values[field?.name]))
            .map((field: any) => field?.labelName ?? field?.displayName ?? field?.name)
        if (yearAboveForm && !targetYear) missing.unshift(i18n.t("Academic year"))
        if (missing.length > 0) {
            show({ message: `${i18n.t("Please fill in")}: ${missing.join(", ")}`, type: { warning: true } })
            return
        }
        // Only what the form shows (the state also carries orgUnit, which is not a data element)
        const submitted: Record<string, any> = {}
        for (const field of shownFields) {
            if (field?.name && values[field.name] !== undefined) submitted[field.name] = values[field.name]
        }
        if (yearAboveForm) submitted[academicYearDataElement as string] = targetYear
        await onClick(submitted)
    }

    const onClick = async (values: any) => {
        if (!gradePerGroup) {
            await promote(values, { learners: eligible.map((c) => c.tei) });
            return
        }
        if (groupsWithoutGrade > 0) {
            show({ message: i18n.t("Choose the grade next year for every group, or “Don't enroll now”."), type: { warning: true } })
            return
        }
        const gradeByEnrollment = new Map<string, string>()
        const learners: any[] = []
        for (const group of groups) {
            const grade = targetOf(group)
            if (!grade || grade === SKIP) continue
            for (const learner of group.learners) {
                learners.push(learner)
                gradeByEnrollment.set(learner?.enrollmentId, grade)
            }
        }
        if (learners.length === 0) {
            show({ message: i18n.t("No learners to enroll: every group is set to “Don't enroll now”."), type: { warning: true } })
            return
        }
        await promote(values, { learners, gradeFor: (tei) => gradeByEnrollment.get(tei?.enrollmentId) });
    }


    const getTooltipMessage = () => {
        if (!hasValidConfiguration) {
            return i18n.t(`Configuration error. Dropout statuses are not set in the {{sectionType}} final result configuration`,
                {
                    sectionType: sectionType
                }
            );
        }
        if (selected.length > 0 && eligible.length === 0) {
            return labels.noResultMessage;
        }
        return "";
    };

    const groupHint = (group: PromotionGroup<any>) => {
        if (group.suggested) return ""
        if (group.decision === 'ADVANCE') return i18n.t("Last grade: choose a grade or “Don't enroll now”.")
        if (group.decision === 'UNCLASSIFIED') return i18n.t("Promotable statuses are not configured, so choose the grade.")
        return i18n.t("Current grade unknown: choose the grade.")
    }

    const skippedNotes = [
        skipped.NO_DECISION > 0 ? i18n.t("{{count}} without a final decision", { count: skipped.NO_DECISION }) : "",
        skipped.DROPOUT > 0 ? i18n.t("{{count}} not continuing (dropout)", { count: skipped.DROPOUT }) : "",
        skipped.ENROLLED > 0 ? i18n.t("{{count}} already enrolled in a later year", { count: skipped.ENROLLED }) : "",
    ].filter(Boolean)

    return (
        <>
            <Tooltip
                title={getTooltipMessage()}
            >
                <span>
                    <Button disabled={!hasValidConfiguration || eligible.length === 0} onClick={() => {
                        setOpen(true);
                    }} icon={<IconAddCircle24 />}
                    >
                        <span>{labels.promoteButtonLabel}</span>
                    </Button >
                </span>
            </Tooltip>
            {
                open && <ModalComponent
                    children={<WithPadding>
                        <NoticeBox warning title={learnersToEnroll === 1
                            ? i18n.t("1 {{entity}} will be enrolled in next year", { entity: labels.entityName })
                            : i18n.t("{{count}} {{entities}} will be enrolled in next year", { count: learnersToEnroll, entities: labels.entityNamePlural })}>
                            {i18n.t("Each {{entity}} gets a new enrollment in the academic year chosen below.", { entity: labels.entityName })}
                            {promotionSkipsExistingYear ? ` ${i18n.t("Anyone already enrolled in that year is skipped.")}` : ""}
                            {skippedNotes.length > 0 && <div className={styles.skipped}>{i18n.t("Left out")}: {skippedNotes.join(", ")}.</div>}
                        </NoticeBox>
                        <WithPadding />

                        {yearAboveForm && (
                            <WithBorder type="all">
                                <WithPadding>
                                    <div className={styles.groupsTitle}>{i18n.t("Academic year")}</div>
                                    <div className={styles.groupsDescription}>
                                        {suggestedYear
                                            ? i18n.t("The year after the one shown in the list. Change it only if needed.")
                                            : i18n.t("The year after the one shown in the list is not in the school calendar, so choose the year.")}
                                    </div>
                                    <TextField
                                        select
                                        size="small"
                                        SelectProps={{ native: true }}
                                        className={styles.yearSelect}
                                        value={targetYear}
                                        error={!targetYear}
                                        onChange={(event) => setTargetYear(event.target.value)}
                                    >
                                        {!targetYear && <option value="">{i18n.t("Choose the academic year")}</option>}
                                        {yearOptions.map((option: { value: string, label: string }) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                    </TextField>
                                </WithPadding>
                            </WithBorder>
                        )}
                        <WithPadding />

                        {gradePerGroup && groups.length > 0 && (
                            <WithBorder type="all">
                                <WithPadding>
                                    <div className={styles.groupsTitle}>{i18n.t("Grade next year")}</div>
                                    <div className={styles.groupsDescription}>{i18n.t("Suggested from each final decision: the next grade for a pass, the same grade for a repeat. Change it if needed.")}</div>
                                    <table className={styles.groups}>
                                        <thead>
                                            <tr>
                                                <th>{i18n.t("Final decision")}</th>
                                                <th>{i18n.t("Current grade")}</th>
                                                <th>{i18n.t("Learners")}</th>
                                                <th>{i18n.t("Grade next year")}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {groups.map((group) => (
                                                <tr key={group.key}>
                                                    <td>{group.decision === 'ADVANCE' ? i18n.t("To be promoted") : group.decision === 'REPEAT' ? i18n.t("To repeat") : optionLabel(decisionOptions, group.decisionValue) ?? "-"}</td>
                                                    <td>{optionLabel(gradeOptions, group.currentGrade) ?? "-"}</td>
                                                    <td>{group.learners.length}</td>
                                                    <td>
                                                        <TextField
                                                            select
                                                            size="small"
                                                            fullWidth
                                                            SelectProps={{ native: true }}
                                                            value={targetOf(group) ?? ""}
                                                            error={!targetOf(group)}
                                                            helperText={groupHint(group)}
                                                            onChange={(event) => setGradeOverrides((prev) => ({ ...prev, [group.key]: event.target.value }))}
                                                        >
                                                            {!targetOf(group) && <option value="">{i18n.t("Choose a grade")}</option>}
                                                            {gradeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                                            <option value={SKIP}>{i18n.t("Don't enroll now")}</option>
                                                        </TextField>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </WithPadding>
                            </WithBorder>
                        )}
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
                                        }}
                                        formFields={[
                                            {
                                                storyBook: false,
                                                name: labels.formName,
                                                description: labels.formDescription,
                                                fields: shownFields,
                                            }
                                        ]}
                                        storyBook={false}
                                        withButtons={false}
                                        onFormSubtmit={() => submit()}
                                        onCancel={() => setOpen(false)}
                                        setFormValues={setValues}
                                        onInputChange={handleChange}
                                    />
                                    <ButtonStrip end>
                                        <Button secondary disabled={loading} onClick={() => setOpen(false)}>{i18n.t("Cancel")}</Button>
                                        <Button primary disabled={loading} icon={loading ? <CircularLoader small /> : undefined} onClick={() => void submit()}>
                                            {i18n.t("Enroll {{count}} in next year", { count: learnersToEnroll })}
                                        </Button>
                                    </ButtonStrip>
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
