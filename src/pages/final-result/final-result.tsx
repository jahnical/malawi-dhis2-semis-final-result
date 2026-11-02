import { useRecoilValue } from 'recoil';
import { Table, useSchoolCalendarKey } from "dhis2-semis-components";
import { InfoPage } from 'dhis2-semis-components'
import { D2I18n, ProgramConfig, VariablesTypes } from 'dhis2-semis-types'
import React, { useEffect, useMemo, useState } from "react";
import { TableDataRefetch, Modules } from "dhis2-semis-types"
import { Box, FormControl, MenuItem, Select } from '@mui/material';
import useGetSelectedKeys from '../../hooks/config/useGetSelectedKeys';
import { useFinalResultConst } from '../../hooks/common/finalResultConst';
import EnrollmentActionsButtons from "../../components/enrollmentButtons/EnrollmentActionsButtons";
import { getAcademicYearOptions, getInfoInstructions, useCheckFilters, useGetEvents, useHeader, useTableData, useTableSort, useUrlParams, useViewPortWidth } from "dhis2-semis-functions";
import ProgressionBanner from "../../components/progression/ProgressionBanner";
import { decisionLabel, decisionTooltip, levelComponent, nextYearStatusComponent, statusComponent } from "../../components/status/status";
import { levelTier, shortLevel } from "../../utils/level/levelTier";
import { useProgression } from "../../hooks/progression/useProgression";
import { classifyDecision, dataElementOptions, optionLabel, type ProgressionState } from "../../utils/progression/progression";

const TERM3_TOTAL_KEY = "term3Total";
const STUDENT_LEVEL_KEY = "studentLevel";
// The level's name; STUDENT_LEVEL_KEY holds its coloured badge
const LEVEL_LABEL_KEY = "__levelLabel";
const FINAL_DECISION_RAW_KEY = "__finalDecisionRaw";
const FINAL_DECISION_LABEL_KEY = "__finalDecisionLabel";
const NEXT_YEAR_KEY = "nextYearStatus";
const PROGRESSION_STATE_KEY = "__progressionState";
// Average score behind the level, so levels sort in score order rather than by name
const LEVEL_SCORE_KEY = "__levelScore";
// Computed for the rows of the page only, so these columns are sorted on the page instead of across the list
const PAGE_SORT_KEYS = [TERM3_TOTAL_KEY, STUDENT_LEVEL_KEY];

const toNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalize = (value: unknown): string => String(value ?? "").trim().toLowerCase();

const resolveFinalDecisionValue = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string" || typeof value === "number") return String(value);

  if (typeof value === "object") {
    const candidate = value as any;
    if (candidate?.value !== undefined) return String(candidate.value);
    if (candidate?.code !== undefined) return String(candidate.code);

    const optionValue = candidate?.props?.option?.value;
    const optionLabel = candidate?.props?.option?.label;
    if (optionValue !== undefined) return String(optionValue);
    if (optionLabel !== undefined) return String(optionLabel);
  }

  return undefined;
};

export default function FinalResult({ i18n, baseUrl }: { i18n: D2I18n, baseUrl: string }) {
  const { viewPortWidth } = useViewPortWidth();
  const { urlParameters } = useUrlParams();
  const [selected, setSelected] = useState([])
  const { dataStoreData, program: programData } = useGetSelectedKeys()
  const [updatedData, updateData] = useState<any[]>([])
  const [studentLevelFilter, setStudentLevelFilter] = useState("ALL")
  const [finalDecisionFilter, setFinalDecisionFilter] = useState("ALL")
  const [nextYearFilter, setNextYearFilter] = useState<"ALL" | ProgressionState>("ALL")
  // Decisions just recorded, so the next step can be offered; afterLoad is the load count at that moment
  const [justSaved, setJustSaved] = useState<{ enrollmentIds: string[], afterLoad: number } | undefined>()
  const [promotionRequest, setPromotionRequest] = useState(0)
  const [pagination, setPagination] = useState({ page: 1, pageSize: 50, totalPages: 0, totalElements: 0 })
  const { sort, order, orderBy, createSortHandler, withSortableColumns } = useTableSort({ onSortChange: () => setPagination((prev) => ({ ...prev, page: 1 })) })
  const { academicYear, grade, class: section, schoolName, school, sectionType } = urlParameters;
  const { getData, tableData, loading, sortableKeys } = useTableData({ module: Modules.Final_Result });
  const sortsOnPage = Boolean(sort?.orderBy && PAGE_SORT_KEYS.includes(sort.orderBy))
  const listSort = sortsOnPage ? undefined : sort
  const columnsSortable = useMemo(() => new Set([...sortableKeys, ...PAGE_SORT_KEYS]), [sortableKeys])
  const { columns } = useHeader({ dataStoreData, programConfigData: programData as unknown as ProgramConfig, programStage: dataStoreData?.['final-result']?.programStage as unknown as string });
  const { getEvents } = useGetEvents();
  const [filetrState, setFilterState] = useState<{ dataElements: any[], attributes: any[] }>({ attributes: [], dataElements: [] });
  const refetch = useRecoilValue(TableDataRefetch);
  const { finalResultConst } = useFinalResultConst({ updateData, data: tableData.data })
  const schoolCalendar = useSchoolCalendarKey()
  const { getFilters } = useCheckFilters({ filters: (dataStoreData?.filters?.dataElements ?? []) as unknown as any })
  const isStudent = sectionType !== 'staff'
  const listFilters: string[] = [
    ...(academicYear ? [`${schoolCalendar?.academicYear}:in:${academicYear}`] : []),
    ...getFilters() as unknown as any
  ]
  const progression = useProgression({
    enabled: isStudent && Boolean(school && academicYear),
    program: programData?.id,
    orgUnit: school,
    dataElementFilters: listFilters,
    attributeFilters: filetrState.attributes,
    reloadKey: refetch,
  })
  const academicYearDataElement = (dataStoreData?.registration?.academicYear || schoolCalendar?.academicYear) as string
  const academicYearOptions = useMemo(() => getAcademicYearOptions(programData, academicYearDataElement)
    .map((option) => ({ value: String(option.value ?? option.code), label: option.label })), [programData, academicYearDataElement])
  const gradeOptions = useMemo(() => dataElementOptions(programData, dataStoreData?.registration?.grade), [programData, dataStoreData?.registration?.grade])

  const performanceConfig = (dataStoreData as any)?.performance || {};
  const performanceProgramStages: string[] = (performanceConfig?.programStages || [])
    .map((stage: any) => stage?.programStage)
    .filter(Boolean);
  const subjectMappings: Array<{ scoreDataElement: string }> = (performanceConfig?.subjects || [])
    .filter((subject: any) => subject?.scoreDataElement)
    .map((subject: any) => ({ scoreDataElement: subject.scoreDataElement }));
  const gradeRanges: Array<{ optionCode: string, minScore: number, maxScore: number }> = (performanceConfig?.gradeMapping?.ranges || [])
    .filter((range: any) => range?.optionCode !== undefined && range?.minScore !== undefined && range?.maxScore !== undefined);

  const term3StageId = useMemo(() => {
    if (!performanceProgramStages.length) return undefined;

    const stageFromDisplayName = (programData?.programStages || [])
      .find((stage: any) => performanceProgramStages.includes(stage?.id) && /term\s*3/i.test(stage?.displayName || ""));

    return stageFromDisplayName?.id || performanceProgramStages[performanceProgramStages.length - 1];
  }, [programData?.programStages, JSON.stringify(performanceProgramStages)]);

  const gradeLabelByCode = useMemo(() => {
    const labels = new Map<string, string>();
    const relevantStages = (programData?.programStages || []).filter((stage: any) => performanceProgramStages.includes(stage?.id));

    for (const stage of relevantStages) {
      for (const stageDataElement of stage?.programStageDataElements || []) {
        const options = stageDataElement?.dataElement?.optionSet?.options || [];
        for (const option of options) {
          const optionValue = option?.value;
          const optionLabel = option?.label;
          if (optionValue) labels.set(normalize(optionValue), optionLabel || optionValue);
        }
      }
    }

    return labels;
  }, [programData?.programStages, JSON.stringify(performanceProgramStages)]);

  const finalDecisionId = dataStoreData?.["final-result"]?.status;

  const finalDecisionLabelByValue = useMemo(() => {
    const labels = new Map<string, string>();
    const finalResultStageId = dataStoreData?.["final-result"]?.programStage;
    const finalResultStage = (programData?.programStages || []).find((stage: any) => stage?.id === finalResultStageId);
    const finalDecisionDataElement = (finalResultStage?.programStageDataElements || [])
      .find((stageDataElement: any) => stageDataElement?.dataElement?.id === finalDecisionId)
      ?.dataElement;

    for (const option of finalDecisionDataElement?.optionSet?.options || []) {
      if (option?.value) {
        labels.set(normalize(option.value), option.label || option.value)
      }
    }

    return labels;
  }, [programData?.programStages, dataStoreData, finalDecisionId]);

  const scoreColumns = useMemo(() => {
    const baseColumns = columns ? [...columns] : [];

    const term3Column = {
      id: TERM3_TOTAL_KEY,
      key: TERM3_TOTAL_KEY,
      displayName: i18n.t("Term 3 Total"),
      header: i18n.t("Term 3 Total"),
      required: false,
      name: i18n.t("Term 3 Total"),
      labelName: i18n.t("Term 3 Total"),
      valueType: "NUMBER" as any,
      disabled: false,
      visible: true,
      pattern: "",
      searchable: false,
      error: false,
      content: "",
      type: VariablesTypes.Custom
    } as any;

    const levelColumn = {
      id: STUDENT_LEVEL_KEY,
      key: STUDENT_LEVEL_KEY,
      displayName: i18n.t("Learner Level"),
      header: i18n.t("Learner Level"),
      required: false,
      name: i18n.t("Learner Level"),
      labelName: i18n.t("Learner Level"),
      valueType: "TEXT" as any,
      disabled: false,
      visible: true,
      pattern: "",
      searchable: false,
      error: false,
      content: "",
      type: VariablesTypes.Custom
    } as any;

    const withoutComputed = baseColumns.filter((column: any) =>
      column?.id !== TERM3_TOTAL_KEY && column?.id !== STUDENT_LEVEL_KEY
    );

    const streamId = dataStoreData?.registration?.section;
    const streamIndex = withoutComputed.findIndex((column: any) => {
      const labels = [column?.id, column?.displayName, column?.header, column?.labelName, column?.name]
        .filter(Boolean)
        .map((value: any) => normalize(value));

      if (streamId && column?.id === streamId) return true;
      return labels.some((label: string) => label === "stream");
    });

    if (streamIndex >= 0) {
      withoutComputed.splice(streamIndex + 1, 0, term3Column, levelColumn);
      return withoutComputed;
    }

    const finalDecisionIndex = withoutComputed.findIndex((column: any) => {
      if (finalDecisionId && column?.id === finalDecisionId) return true;
      const labels = [column?.displayName, column?.header, column?.labelName, column?.name]
        .filter(Boolean)
        .map((value: any) => normalize(value));
      return labels.some((label: string) => label.includes("final decision"));
    });

    if (finalDecisionIndex >= 0) {
      withoutComputed.splice(finalDecisionIndex, 0, term3Column, levelColumn);
      return withoutComputed;
    }

    return withoutComputed.concat([term3Column, levelColumn]);
  }, [columns, i18n, dataStoreData]);

  // Students get a "Next year" column right after the final decision: a decision is not an enrollment
  const computedColumns = useMemo(() => {
    if (!isStudent) return scoreColumns
    const nextYearColumn = {
      id: NEXT_YEAR_KEY,
      key: NEXT_YEAR_KEY,
      displayName: i18n.t("Next year"),
      header: i18n.t("Next year"),
      required: false,
      name: i18n.t("Next year"),
      labelName: i18n.t("Next year"),
      valueType: "TEXT" as any,
      disabled: false,
      visible: true,
      pattern: "",
      searchable: false,
      error: false,
      content: "",
      type: VariablesTypes.Custom
    } as any;
    const decisionIndex = scoreColumns.findIndex((column: any) => finalDecisionId && column?.id === finalDecisionId)
    const copy = [...scoreColumns]
    copy.splice(decisionIndex >= 0 ? decisionIndex + 1 : copy.length, 0, nextYearColumn)
    return copy
  }, [scoreColumns, isStudent, finalDecisionId, i18n]);

  const studentLevelOptions = useMemo(() => {
    return Array.from(new Set(
      updatedData
        .map((row) => String(row?.[LEVEL_LABEL_KEY] ?? "").trim())
        .filter((value) => value.length > 0 && value !== "-")
    ))
  }, [updatedData]);

  // Each row's next-year status ("…" until it has loaded), and a promotion decision worded as still to
  // happen until the learner is enrolled in the next year
  const finalResultConfig = dataStoreData?.["final-result"] as any
  const rowsWithProgression = useMemo(() => {
    if (!isStudent) return updatedData
    return updatedData.map((row) => {
      const known = progression.byEnrollment.get(row?.enrollmentId)
      const rawDecision = row?.[FINAL_DECISION_RAW_KEY]
      const metadataLabel = row?.[FINAL_DECISION_LABEL_KEY] || undefined
      const decision = known?.decision ?? classifyDecision(rawDecision, {
        validStatusValues: finalResultConfig?.validStatusValue, dropoutStatusValues: finalResultConfig?.dropoutStatusValues, label: metadataLabel,
      })
      const reworded = decision === 'ADVANCE' || decision === 'REPEAT'
      const enrolled = known?.state === 'ENROLLED'
      const shownLabel = decisionLabel({ label: metadataLabel, decision, enrolled })
      return {
        ...row,
        ...(reworded && finalDecisionId ? {
          [finalDecisionId]: statusComponent({ option: { label: shownLabel as string, value: rawDecision, style: { color: "" } }, tooltip: decisionTooltip({ decision, enrolled }) }),
          [FINAL_DECISION_LABEL_KEY]: shownLabel,
        } : {}),
        [PROGRESSION_STATE_KEY]: known?.state,
        [NEXT_YEAR_KEY]: nextYearStatusComponent({
          state: known?.state,
          nextYear: known?.nextYear,
          labels: {
            year: optionLabel(academicYearOptions, known?.nextYear?.academicYear),
            grade: optionLabel(gradeOptions, known?.nextYear?.grade),
          },
        }),
      }
    })
  }, [updatedData, progression.byEnrollment, isStudent, academicYearOptions, gradeOptions, finalDecisionId, finalResultConfig]);

  const finalDecisionOptions = useMemo(() => {
    return Array.from(new Set(
      rowsWithProgression
        .map((row) => String(row?.[FINAL_DECISION_LABEL_KEY] ?? "").trim())
        .filter((value) => value.length > 0 && value !== "[object Object]")
    ))
  }, [rowsWithProgression]);

  const displayedRows = useMemo(() => {
    let rows = [...rowsWithProgression]

    if (nextYearFilter !== "ALL") {
      rows = rows.filter((row) => row?.[PROGRESSION_STATE_KEY] === nextYearFilter)
    }

    if (studentLevelFilter !== "ALL") {
      rows = rows.filter((row) => String(row?.[LEVEL_LABEL_KEY] ?? "") === studentLevelFilter)
    }

    if (finalDecisionFilter !== "ALL") {
      rows = rows.filter((row) => String(row?.[FINAL_DECISION_LABEL_KEY] ?? "") === finalDecisionFilter)
    }

    if (sortsOnPage && sort) {
      const valueOf = (row: any) => toNumber(sort.orderBy === TERM3_TOTAL_KEY ? row?.[TERM3_TOTAL_KEY] : row?.[LEVEL_SCORE_KEY])
      rows.sort((a, b) => {
        const aValue = valueOf(a)
        const bValue = valueOf(b)
        // Rows without marks stay at the bottom either way
        if (aValue === null || bValue === null) return aValue === bValue ? 0 : aValue === null ? 1 : -1
        return sort.order === "asc" ? aValue - bValue : bValue - aValue
      })
    }

    return rows
  }, [rowsWithProgression, studentLevelFilter, finalDecisionFilter, nextYearFilter, sortsOnPage, sort]);

  // The table matches selected rows by deep comparison, and the next-year badge is rebuilt whenever the
  // status loads, so selected rows are swapped for the current row objects (one per enrollment)
  const currentSelected = useMemo(() => {
    const byEnrollment = new Map(rowsWithProgression.map((row) => [row?.enrollmentId, row]))
    return (selected as any[]).map((row) => byEnrollment.get(row?.enrollmentId) ?? row)
  }, [selected, rowsWithProgression])

  const awaitingOnPage = displayedRows.filter((row) => row?.[PROGRESSION_STATE_KEY] === 'AWAITING')
  const justSavedReady = Boolean(justSaved) && progression.loads > (justSaved?.afterLoad ?? 0)
  const justSavedRows = justSavedReady
    ? rowsWithProgression.filter((row) => justSaved!.enrollmentIds.includes(row?.enrollmentId) && row?.[PROGRESSION_STATE_KEY] === 'AWAITING')
    : []

  const enrollRows = (rows: any[]) => {
    setSelected(rows as any)
    setPromotionRequest((n) => n + 1)
  }

  const getInfoPageContent = () => {
    if (sectionType === 'staff') {
      return {
        title: i18n.t("SEMIS-Staff-Re-enrollment"),
        sectionTitle: `${i18n.t("Follow the instructions to proceed")}:`,
        instructions: getInfoInstructions({ i18n, filters: (dataStoreData?.filters?.dataElements ?? []) as any, program: programData as any, academicYear: "required", sectionFilters: "optional" })
      }
    }
    return {
      title: i18n.t("SEMIS-Learner-Final-Result"),
      sectionTitle: `${i18n.t("Follow the instructions to proceed")}:`,
      instructions: getInfoInstructions({ i18n, filters: (dataStoreData?.filters?.dataElements ?? []) as any, program: programData as any, academicYear: "required", sectionFilters: "optional" })
    }
  }

  const infoPageContent = getInfoPageContent()
  const nextYearFilterLabels: Record<ProgressionState, string> = {
    AWAITING: i18n.t("Awaiting enrollment"),
    ENROLLED: i18n.t("Enrolled"),
    NO_DECISION: i18n.t("No decision yet"),
    DROPOUT: i18n.t("Not continuing"),
  }
  const tableTitle = sectionType === 'staff' ? i18n.t('Staff Re-enrollment') : i18n.t('Final Results')
  const inactiveRowMessage = sectionType === 'staff' ? i18n.t('Terminated') : i18n.t('Dropout')

  useEffect(() => {
    setSelected([])
    if (school && academicYear)
      void getData({
        page: pagination.page,
        pageSize: pagination.pageSize,
        program: programData?.id as string,
        orgUnit: school!,
        baseProgramStage: dataStoreData?.registration?.programStage as string,
        attributeFilters: filetrState.attributes,
        dataElementFilters: listFilters,
        otherProgramStage: dataStoreData?.['final-result']?.programStage,
        order: dataStoreData.defaults.defaultOrder,
        sort: listSort && { ...listSort, program: programData! },
      })
  }, [sectionType, filetrState, refetch, pagination.page, pagination.pageSize, academicYear, grade, section, school, JSON.stringify(listSort)])

  useEffect(() => {
    setPagination((prev) => ({ ...prev, totalPages: tableData.pagination.totalPages, totalElements: tableData.pagination.totalElements }))

    const enrichRows = async () => {
      if (tableData.data.length === 0) {
        updateData([])
        return
      }

      const baseRows = (((finalResultConst as any)(tableData.data, false)) || []) as any[]
      const trackedEntities = Array.from(new Set(baseRows.map((row: any) => row?.trackedEntity).filter(Boolean)))

      if (!term3StageId || trackedEntities.length === 0) {
        updateData(baseRows.map((row: any, index: number) => {
          const resolvedFinalDecisionValue = finalDecisionId ? resolveFinalDecisionValue(tableData.data?.[index]?.[finalDecisionId]) : undefined
          const finalDecisionLabel = resolvedFinalDecisionValue
            ? (finalDecisionLabelByValue.get(normalize(resolvedFinalDecisionValue)) || resolvedFinalDecisionValue)
            : ""

          return {
            ...row,
            [TERM3_TOTAL_KEY]: "-",
            [STUDENT_LEVEL_KEY]: "-",
            [FINAL_DECISION_RAW_KEY]: resolvedFinalDecisionValue,
            [FINAL_DECISION_LABEL_KEY]: finalDecisionLabel
          }
        }))
        return
      }

      const performanceEventsResponses = await Promise.all(
        trackedEntities.map(async (trackedEntity) => {
          const events = await getEvents({
            program: programData?.id as string,
            orgUnit: school as string,
            orgUnitMode: school ? "SELECTED" : "ACCESSIBLE",
            programStage: term3StageId,
            trackedEntities: trackedEntity,
            paging: false,
            fields: "event,trackedEntity,enrollment,occurredAt,dataValues[dataElement,value]"
          }) as any[]

          return events || []
        })
      )

      const performanceEvents = performanceEventsResponses.flat()

      const eventsByTei = new Map<string, any[]>()
      for (const event of performanceEvents || []) {
        const key = event?.trackedEntity
        if (!key) continue
        if (!eventsByTei.has(key)) eventsByTei.set(key, [])
        eventsByTei.get(key)?.push(event)
      }

      const enrichedRows = baseRows.map((row: any, index: number) => {
        const teiEvents = eventsByTei.get(row?.trackedEntity) || []
        const enrollmentEvent = teiEvents.find((event: any) => event?.enrollment && event.enrollment === row?.enrollmentId)
        const latestEvent = [...teiEvents].sort((a: any, b: any) => new Date(b?.occurredAt || 0).getTime() - new Date(a?.occurredAt || 0).getTime())[0]
        const event = enrollmentEvent || latestEvent
        const resolvedFinalDecisionValue = finalDecisionId ? resolveFinalDecisionValue(tableData.data?.[index]?.[finalDecisionId]) : undefined
        const finalDecisionLabel = resolvedFinalDecisionValue
          ? (finalDecisionLabelByValue.get(normalize(resolvedFinalDecisionValue)) || resolvedFinalDecisionValue)
          : ""

        const valueByDataElement = new Map<string, any>()
        for (const dataValue of event?.dataValues || []) {
          if (dataValue?.dataElement) {
            valueByDataElement.set(dataValue.dataElement, dataValue.value)
          }
        }

        const scoreValues = subjectMappings.length > 0
          ? subjectMappings
            .map((subject) => toNumber(valueByDataElement.get(subject.scoreDataElement)))
            .filter((value): value is number => value !== null)
          : (event?.dataValues || [])
            .map((dataValue: any) => toNumber(dataValue?.value))
            .filter((value: number | null): value is number => value !== null)

        if (scoreValues.length === 0) {
          return {
            ...row,
            [TERM3_TOTAL_KEY]: "-",
            [STUDENT_LEVEL_KEY]: "-",
            [FINAL_DECISION_RAW_KEY]: resolvedFinalDecisionValue,
            [FINAL_DECISION_LABEL_KEY]: finalDecisionLabel
          }
        }

        const totalMarks = scoreValues.reduce((sum: number, value: number) => sum + value, 0)
        const averagePercentage = totalMarks / scoreValues.length
        const totalLabel = Number.isInteger(totalMarks) ? String(totalMarks) : totalMarks.toFixed(2)

        const matchedRange = gradeRanges.find((range) => {
          const min = Number(range.minScore)
          const max = Number(range.maxScore)
          return Number.isFinite(min) && Number.isFinite(max) && averagePercentage >= min && averagePercentage <= max
        })

        const matchedCode = matchedRange?.optionCode
        const levelLabel = matchedCode ? (gradeLabelByCode.get(normalize(matchedCode)) || matchedCode) : "-"

        return {
          ...row,
          [TERM3_TOTAL_KEY]: totalLabel,
          [STUDENT_LEVEL_KEY]: matchedCode ? levelComponent({ label: levelLabel, short: shortLevel(levelLabel, matchedCode), tier: levelTier(matchedCode, gradeRanges) }) : levelLabel,
          [LEVEL_LABEL_KEY]: levelLabel,
          [LEVEL_SCORE_KEY]: matchedCode ? averagePercentage : undefined,
          [FINAL_DECISION_RAW_KEY]: resolvedFinalDecisionValue,
          [FINAL_DECISION_LABEL_KEY]: finalDecisionLabel
        }
      })

      updateData(enrichedRows)
    }

    void enrichRows()
  }, [tableData, term3StageId, JSON.stringify(subjectMappings), JSON.stringify(gradeRanges), school, programData?.id, gradeLabelByCode, finalDecisionId, finalDecisionLabelByValue])

  return (
    <div style={{ height: "85vh" }}>
      {
        !(Boolean(schoolName) && Boolean(school)) ?
          <InfoPage
            title={infoPageContent.title}
            sections={[
              {
                sectionTitle: infoPageContent.sectionTitle,
                instructions: infoPageContent.instructions
              }
            ]}
          />
          :
          <>
            {isStudent && (
              <ProgressionBanner
                counts={progression.counts}
                loading={progression.loading}
                error={progression.error}
                onRetry={() => void progression.reload()}
                awaitingOnPage={awaitingOnPage.length}
                onSelectAwaiting={() => setSelected(awaitingOnPage as any)}
                justSaved={justSaved && { count: justSaved.enrollmentIds.length, awaiting: justSavedReady ? justSavedRows.length : undefined }}
                onEnrollJustSaved={() => { enrollRows(justSavedRows); setJustSaved(undefined) }}
                onDismissJustSaved={() => setJustSaved(undefined)}
                busy={loading || progression.loading}
              />
            )}
            <Table
              programConfig={programData!}
              title={tableTitle}
              viewPortWidth={viewPortWidth}
              columns={withSortableColumns(computedColumns, columnsSortable)}
              tableData={displayedRows}
              inactiveRowMessage={inactiveRowMessage}
              enableInactiveRowSelection={true}
              filterState={filetrState}
              loading={loading}
              rightElements={
                <EnrollmentActionsButtons
                  i18n={i18n}
                  selected={currentSelected}
                  selectedDataStoreKey={dataStoreData}
                  programData={programData as unknown as ProgramConfig}
                  baseUrl={baseUrl}
                  progression={isStudent ? progression.byEnrollment : undefined}
                  onDecisionsSaved={isStudent ? (enrollmentIds) => setJustSaved({ enrollmentIds, afterLoad: progression.loads }) : undefined}
                  promotionRequest={promotionRequest}
                />
              }
              setFilterState={setFilterState}
              selectable={true}
              selected={currentSelected}
              setSelected={setSelected}
              pagination={pagination}
              setPagination={setPagination}
              paginate={!loading}
              sortable
              order={order}
              orderBy={orderBy}
              createSortHandler={createSortHandler}
              beforeSettings={
                <Box
                  sx={{
                    display: "flex",
                    gap: 1,
                    flexWrap: "wrap",
                    alignItems: "center",
                    width: "100%",
                    mr: 1
                  }}
                >
                  <FormControl
                    size="small"
                    sx={{
                      flex: { xs: "1 1 100%", sm: "1 1 170px" },
                      minWidth: { xs: "100%", sm: 170 },
                      "& .MuiInputBase-root": { height: 36 },
                      "& .MuiSelect-select": { py: 0.75 }
                    }}
                  >
                    <Select
                      displayEmpty
                      value={studentLevelFilter}
                      onChange={(event) => setStudentLevelFilter(event.target.value)}
                      renderValue={(selectedValue) => selectedValue === "ALL" ? i18n.t("Learner Level") : String(selectedValue)}
                    >
                      <MenuItem value="ALL">{i18n.t("All")}</MenuItem>
                      {studentLevelOptions.map((level) => (
                        <MenuItem key={level} value={level}>{level}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <FormControl
                    size="small"
                    sx={{
                      flex: { xs: "1 1 100%", sm: "1 1 190px" },
                      minWidth: { xs: "100%", sm: 190 },
                      "& .MuiInputBase-root": { height: 36 },
                      "& .MuiSelect-select": { py: 0.75 }
                    }}
                  >
                    <Select
                      displayEmpty
                      value={finalDecisionFilter}
                      onChange={(event) => setFinalDecisionFilter(event.target.value)}
                      renderValue={(selectedValue) => selectedValue === "ALL" ? i18n.t("Final Decision") : String(selectedValue)}
                    >
                      <MenuItem value="ALL">{i18n.t("All")}</MenuItem>
                      {finalDecisionOptions.map((decision) => (
                        <MenuItem key={decision} value={decision}>{decision}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  {isStudent && <FormControl
                    size="small"
                    sx={{
                      flex: { xs: "1 1 100%", sm: "1 1 190px" },
                      minWidth: { xs: "100%", sm: 190 },
                      "& .MuiInputBase-root": { height: 36 },
                      "& .MuiSelect-select": { py: 0.75 }
                    }}
                  >
                    <Select
                      displayEmpty
                      value={nextYearFilter}
                      onChange={(event) => setNextYearFilter(event.target.value as "ALL" | ProgressionState)}
                      renderValue={(selectedValue) => selectedValue === "ALL" ? i18n.t("Next year") : nextYearFilterLabels[selectedValue as ProgressionState]}
                    >
                      <MenuItem value="ALL">{i18n.t("All")}</MenuItem>
                      {(Object.keys(nextYearFilterLabels) as ProgressionState[]).map((state) => (
                        <MenuItem key={state} value={state}>{nextYearFilterLabels[state]}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>}
                </Box>
              }
            />
          </>
      }
    </div>
  )
}
