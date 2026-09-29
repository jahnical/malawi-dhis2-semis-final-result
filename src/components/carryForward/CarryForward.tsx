import { useMemo, useState } from "react";
import { format } from "date-fns";
import { useSetRecoilState } from "recoil";
import {
    Button, ButtonStrip, Center, Checkbox, CircularLoader, DataTable, DataTableBody, DataTableCell,
    DataTableColumnHeader, DataTableHead, DataTableRow, IconUserGroup16, Input, Modal, ModalActions,
    ModalContent, ModalTitle, NoticeBox, SingleSelect, SingleSelectOption, Tag,
} from "@dhis2/ui";
import { Modules, ProgramConfig, TableDataRefetch, VariablesTypes } from "dhis2-semis-types";
import { useCheckFilters, useHeader, useTableData, useUrlParams } from "dhis2-semis-functions";
import useGetSelectedKeys from "../../hooks/config/useGetSelectedKeys";
import { useAccessibleOrgUnits } from "../../hooks/common/useAccessibleOrgUnits";
import { CarryForwardRow, useCarryForward } from "../../hooks/promote/useCarryForward";

interface ReviewRow {
    row: any
    include: boolean
    orgUnit: string
    values: Record<string, string>
    exitStatus?: string
}

interface CarryForwardProps {
    selected: any[]
    i18n: any
    openStats: (open: boolean) => void
    setStats: (stats: any) => void
}

const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase()

// Column widths so selects and names don't wrap; the table scrolls sideways instead
const FIELD_WIDTH = 220
const SCHOOL_WIDTH = 260
const noWrap = { whiteSpace: "nowrap" as const }

// Staff re-enrollment: copy each person's current registration into the next academic year,
// with a per-row review to adjust configured fields, change school or leave someone out.
export default function CarryForward({ selected, i18n, openStats, setStats }: CarryForwardProps) {
    const { urlParameters } = useUrlParams()
    const { school, academicYear } = urlParameters
    const { dataStoreData, program } = useGetSelectedKeys()
    const { getBasicData } = useTableData({ module: Modules.Final_Result })
    const { getFilters } = useCheckFilters({ filters: (dataStoreData?.filters?.dataElements ?? []) as unknown as any })
    const { columns } = useHeader({ dataStoreData, programConfigData: program as unknown as ProgramConfig, programStage: "" })
    const { orgUnits } = useAccessibleOrgUnits()
    const { carryForward, getAlreadyRegistered, getStageValues, registrationStage, academicYearDataElement } = useCarryForward()
    const setRefetch = useSetRecoilState(TableDataRefetch)

    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [rows, setRows] = useState<ReviewRow[]>([])
    const [alreadyRegistered, setAlreadyRegistered] = useState<Set<string>>(new Set())
    const [enrollmentDate, setEnrollmentDate] = useState(format(new Date(), "yyyy-MM-dd"))

    const registrationDataElements = useMemo(() =>
        program?.programStages?.find((stage) => stage.id === registrationStage)?.programStageDataElements?.map((x: any) => x.dataElement) ?? [],
        [program, registrationStage])

    const academicYearOptions: { value: string, label: string }[] = useMemo(() =>
        registrationDataElements.find((de: any) => de?.id === academicYearDataElement)?.optionSet?.options ?? [],
        [registrationDataElements, academicYearDataElement])

    // Default target: the academic year after the one being viewed
    const nextYear = useMemo(() => {
        const index = academicYearOptions.findIndex((x) => x.value === academicYear)
        return academicYearOptions[index + 1]?.value ?? ""
    }, [academicYearOptions, academicYear])
    const [targetYear, setTargetYear] = useState("")
    const effectiveTargetYear = targetYear || nextYear

    const adjustableFields = useMemo(() => {
        const ids: string[] = (dataStoreData?.["final-result"] as any)?.adjustableFields ?? []
        return ids.map((id) => registrationDataElements.find((de: any) => de?.id === id)).filter(Boolean)
    }, [dataStoreData, registrationDataElements])

    const nameColumns = useMemo(() =>
        (columns ?? []).filter((c: any) => c.visible && c.type === VariablesTypes.Attribute).slice(0, 3),
        [columns])

    const finalResult = dataStoreData?.["final-result"] as any
    const exitStatusOf = (status?: string) => {
        if (!status) return undefined
        const dropout: string[] = finalResult?.dropoutStatusValues ?? []
        const valid: string[] = finalResult?.validStatusValue ?? []
        if (dropout.some((x) => normalize(x) === normalize(status))) return status
        if (valid.length > 0 && !valid.some((x) => normalize(x) === normalize(status))) return status
        return undefined
    }

    // Selected rows, or everyone matching the current filters when nothing is selected
    async function loadSourceRows(): Promise<any[]> {
        if (selected.length > 0) return selected

        const { formattedBasicTableData } = await getBasicData({
            paging: false,
            program: program?.id as string,
            orgUnit: school!,
            baseProgramStage: registrationStage,
            dataElementFilters: [
                ...(academicYear ? [`${academicYearDataElement}:in:${academicYear}`] : []),
                ...getFilters() as unknown as any,
            ],
        } as any)
        return formattedBasicTableData
    }

    // Current re-enrollment status per enrollment, to leave exits unticked
    async function loadStatuses(sourceRows: any[]): Promise<Map<string, string>> {
        const statusElement = finalResult?.status
        const statuses = new Map<string, string>()
        // Rows from the table already carry their status event; the rest are looked up
        for (const r of sourceRows) {
            const value = r?.frEvent?.dataValues?.find((dv: any) => dv.dataElement === statusElement)?.value
            if (value) statuses.set(r.enrollmentId, value)
        }
        const missing = sourceRows.filter((r) => !r?.frEvent?.dataValues).map((r) => r.trackedEntity)
        if (missing.length === 0) return statuses
        const looked = await getStageValues(missing, finalResult?.programStage, statusElement)
        looked.forEach((value, enrollment) => { if (!statuses.has(enrollment)) statuses.set(enrollment, value) })
        return statuses
    }

    async function openReview() {
        setOpen(true)
        setLoading(true)
        setTargetYear("")
        try {
            const sourceRows = await loadSourceRows()
            const [statuses, registered] = await Promise.all([
                loadStatuses(sourceRows),
                nextYear ? getAlreadyRegistered(sourceRows.map((r) => r.trackedEntity), nextYear) : Promise.resolve(new Set<string>()),
            ])
            setAlreadyRegistered(registered)
            setRows(sourceRows.map((row) => {
                const exitStatus = exitStatusOf(statuses.get(row.enrollmentId))
                return {
                    row,
                    exitStatus,
                    include: !exitStatus,
                    orgUnit: school!,
                    values: Object.fromEntries(adjustableFields.map((de: any) => [de.id, row?.[de.id] ?? ""])),
                }
            }))
        } finally {
            setLoading(false)
        }
    }

    async function changeTargetYear(year: string) {
        setTargetYear(year)
        setLoading(true)
        try {
            setAlreadyRegistered(await getAlreadyRegistered(rows.map((r) => r.row.trackedEntity), year))
        } finally {
            setLoading(false)
        }
    }

    const updateRow = (index: number, changes: Partial<ReviewRow>) =>
        setRows((prev) => prev.map((r, i) => i === index ? { ...r, ...changes } : r))

    const toCarry = rows.filter((r) => r.include && !alreadyRegistered.has(r.row.trackedEntity))

    async function onConfirm() {
        setSaving(true)
        try {
            const payload: CarryForwardRow[] = toCarry.map((r) => ({
                trackedEntity: r.row.trackedEntity,
                enrollmentId: r.row.enrollmentId,
                orgUnit: r.orgUnit,
                row: r.row,
                // Start from the current registration, then apply this row's edits
                registrationValues: {
                    ...Object.fromEntries(registrationDataElements.map((de: any) => [de.id, r.row?.[de.id]])),
                    ...r.values,
                },
            }))
            const result = await carryForward({ rows: payload, targetYear: effectiveTargetYear, enrollmentDate })
            setStats({ posted: result.posted, conflicts: result.conflicts })
            setOpen(false)
            openStats(true)
            setRefetch((prev: boolean) => !prev)
        } catch {
            // The reason is already shown; keep the review open so it can be fixed and retried
        } finally {
            setSaving(false)
        }
    }

    const yearLabel = academicYearOptions.find((x) => x.value === effectiveTargetYear)?.label ?? effectiveTargetYear

    const renderAdjustableInput = (de: any, r: ReviewRow, index: number) => {
        const value = r.values[de.id] ?? ""
        const onChange = (next: string) => updateRow(index, { values: { ...r.values, [de.id]: next } })
        const disabled = !r.include || alreadyRegistered.has(r.row.trackedEntity)

        if (de?.optionSet?.options?.length) {
            return (
                <SingleSelect dense filterable disabled={disabled} selected={value || undefined} onChange={({ selected }: any) => onChange(selected)}>
                    {de.optionSet.options.map((o: any) => <SingleSelectOption key={o.value} value={o.value} label={o.label} />)}
                </SingleSelect>
            )
        }
        return <Input dense disabled={disabled} value={value} onChange={({ value: next }: any) => onChange(next ?? "")} />
    }

    return (
        <>
            <Button icon={<IconUserGroup16 />} disabled={!school || !academicYear} onClick={() => { void openReview() }}>
                {selected.length > 0
                    ? i18n.t("Carry forward selected ({{count}})", { count: selected.length })
                    : i18n.t("Carry forward staff")}
            </Button>

            {open && (
                <Modal fluid position="middle" onClose={() => setOpen(false)}>
                    <ModalTitle>{i18n.t("Carry staff forward to {{year}}", { year: yearLabel || "…" })}</ModalTitle>
                    <ModalContent>
                        <ButtonStrip>
                            <div style={{ minWidth: 260 }}>
                                <label>{i18n.t("Target academic year")}</label>
                                <SingleSelect dense selected={effectiveTargetYear || undefined} onChange={({ selected }: any) => { void changeTargetYear(selected) }}>
                                    {academicYearOptions.map((o) => <SingleSelectOption key={o.value} value={o.value} label={o.label} />)}
                                </SingleSelect>
                            </div>
                            <div style={{ minWidth: 200 }}>
                                <label>{i18n.t("Enrollment date")}</label>
                                <Input dense type="date" value={enrollmentDate} onChange={({ value }: any) => setEnrollmentDate(value ?? "")} />
                            </div>
                        </ButtonStrip>
                        <br />

                        {!effectiveTargetYear && !loading && (
                            <NoticeBox warning title={i18n.t("No target academic year")}>
                                {i18n.t("Choose the academic year to carry staff forward to.")}
                            </NoticeBox>
                        )}

                        {loading ? <Center><CircularLoader small /></Center> : (
                            <DataTable scrollHeight="55vh" scrollWidth="calc(100vw - 160px)" layout="auto">
                                <DataTableHead>
                                    <DataTableRow>
                                        <DataTableColumnHeader fixed top="0" width="72px">{i18n.t("Include")}</DataTableColumnHeader>
                                        {nameColumns.map((c: any) => <DataTableColumnHeader fixed top="0" key={c.id}><span style={noWrap}>{c.displayName}</span></DataTableColumnHeader>)}
                                        {adjustableFields.map((de: any) => <DataTableColumnHeader fixed top="0" key={de.id} width={`${FIELD_WIDTH}px`}>{de.displayName}</DataTableColumnHeader>)}
                                        <DataTableColumnHeader fixed top="0" width={`${SCHOOL_WIDTH}px`}>{i18n.t("School")}</DataTableColumnHeader>
                                        <DataTableColumnHeader fixed top="0">{i18n.t("Note")}</DataTableColumnHeader>
                                    </DataTableRow>
                                </DataTableHead>
                                <DataTableBody>
                                    {rows.map((r, index) => {
                                        const registered = alreadyRegistered.has(r.row.trackedEntity)
                                        return (
                                            <DataTableRow key={r.row.enrollmentId ?? index}>
                                                <DataTableCell>
                                                    <Checkbox dense checked={r.include && !registered} disabled={registered}
                                                        onChange={({ checked }: any) => updateRow(index, { include: checked })} />
                                                </DataTableCell>
                                                {nameColumns.map((c: any) => <DataTableCell key={c.id}><span style={noWrap}>{r.row?.[c.id]}</span></DataTableCell>)}
                                                {adjustableFields.map((de: any) => <DataTableCell key={de.id}><div style={{ minWidth: FIELD_WIDTH }}>{renderAdjustableInput(de, r, index)}</div></DataTableCell>)}
                                                <DataTableCell>
                                                    <div style={{ minWidth: SCHOOL_WIDTH }}>
                                                    <SingleSelect dense filterable disabled={!r.include || registered}
                                                        selected={orgUnits.some((ou) => ou.id === r.orgUnit) ? r.orgUnit : undefined}
                                                        onChange={({ selected }: any) => updateRow(index, { orgUnit: selected })}>
                                                        {orgUnits.map((ou) => <SingleSelectOption key={ou.id} value={ou.id} label={ou.displayName} />)}
                                                    </SingleSelect>
                                                    </div>
                                                </DataTableCell>
                                                <DataTableCell>
                                                    <span style={noWrap}>{registered
                                                        ? <Tag neutral>{i18n.t("Already in {{year}}", { year: yearLabel })}</Tag>
                                                        : r.exitStatus ? <Tag negative>{r.exitStatus}</Tag> : null}</span>
                                                </DataTableCell>
                                            </DataTableRow>
                                        )
                                    })}
                                </DataTableBody>
                            </DataTable>
                        )}
                    </ModalContent>
                    <ModalActions>
                        <ButtonStrip end>
                            <span style={{ alignSelf: "center" }}>
                                {i18n.t("{{count}} of {{total}} will be carried forward", { count: toCarry.length, total: rows.length })}
                            </span>
                            <Button onClick={() => setOpen(false)}>{i18n.t("Cancel")}</Button>
                            <Button primary loading={saving} disabled={loading || saving || !effectiveTargetYear || toCarry.length === 0} onClick={() => { void onConfirm() }}>
                                {i18n.t("Carry forward")}
                            </Button>
                        </ButtonStrip>
                    </ModalActions>
                </Modal>
            )}
        </>
    )
}
