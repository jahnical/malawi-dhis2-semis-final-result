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
import { useCheckFilters, useGetEvents, useHeader, useTableData, useUrlParams, useViewPortWidth } from "dhis2-semis-functions";

const TERM3_TOTAL_KEY = "term3Total";
const STUDENT_LEVEL_KEY = "studentLevel";
const FINAL_DECISION_RAW_KEY = "__finalDecisionRaw";
const FINAL_DECISION_LABEL_KEY = "__finalDecisionLabel";

const toNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toNumberOrZero = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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
  const [term3Sort, setTerm3Sort] = useState<"none" | "asc" | "desc">("none")
  const [pagination, setPagination] = useState({ page: 1, pageSize: 50, totalPages: 0, totalElements: 0 })
  const { academicYear, grade, class: section, schoolName, school, sectionType } = urlParameters;
  const { getData, tableData, loading } = useTableData({ module: Modules.Final_Result });
  const { columns } = useHeader({ dataStoreData, programConfigData: programData as unknown as ProgramConfig, programStage: dataStoreData?.['final-result']?.programStage as unknown as string });
  const { getEvents } = useGetEvents();
  const [filetrState, setFilterState] = useState<{ dataElements: any[], attributes: any[] }>({ attributes: [], dataElements: [] });
  const refetch = useRecoilValue(TableDataRefetch);
  const { finalResultConst } = useFinalResultConst({ updateData, data: tableData.data })
  const schoolCalendar = useSchoolCalendarKey()
  const { getFilters } = useCheckFilters({ filters: (dataStoreData?.filters?.dataElements ?? []) as unknown as any })

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

  const computedColumns = useMemo(() => {
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
      displayName: i18n.t("Student Level"),
      header: i18n.t("Student Level"),
      required: false,
      name: i18n.t("Student Level"),
      labelName: i18n.t("Student Level"),
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

  const studentLevelOptions = useMemo(() => {
    return Array.from(new Set(
      updatedData
        .map((row) => String(row?.[STUDENT_LEVEL_KEY] ?? "").trim())
        .filter((value) => value.length > 0 && value !== "-")
    ))
  }, [updatedData]);

  const finalDecisionOptions = useMemo(() => {
    return Array.from(new Set(
      updatedData
        .map((row) => String(row?.[FINAL_DECISION_LABEL_KEY] ?? "").trim())
        .filter((value) => value.length > 0 && value !== "[object Object]")
    ))
  }, [updatedData]);

  const displayedRows = useMemo(() => {
    let rows = [...updatedData]

    if (studentLevelFilter !== "ALL") {
      rows = rows.filter((row) => String(row?.[STUDENT_LEVEL_KEY] ?? "") === studentLevelFilter)
    }

    if (finalDecisionFilter !== "ALL") {
      rows = rows.filter((row) => String(row?.[FINAL_DECISION_LABEL_KEY] ?? "") === finalDecisionFilter)
    }

    if (term3Sort !== "none") {
      rows.sort((a, b) => {
        const aValue = toNumberOrZero(a?.[TERM3_TOTAL_KEY])
        const bValue = toNumberOrZero(b?.[TERM3_TOTAL_KEY])

        return term3Sort === "asc" ? aValue - bValue : bValue - aValue
      })
    }

    return rows
  }, [updatedData, studentLevelFilter, finalDecisionFilter, term3Sort]);

  const getInfoPageContent = () => {
    if (sectionType === 'staff') {
      return {
        title: i18n.t("SEMIS-Staff-Re-enrollment"),
        sectionTitle: `${i18n.t("Follow the instructions to proceed")}:`,
        instructions: [
          i18n.t("Select the Organization unit you want to view data"),
          i18n.t("Use global filters(Type of Staff, Employment Type and Academic Year)")
        ]
      }
    }
    return {
      title: i18n.t("SEMIS-Final-Result"),
      sectionTitle: `${i18n.t("Follow the instructions to proceed")}:`,
      instructions: [
        i18n.t("Select the Organization unit you want to view data"),
        i18n.t("Use global filters(Class, Grade and Academic Year)")
      ]
    }
  }

  const infoPageContent = getInfoPageContent()
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
        dataElementFilters: [
          ...(academicYear ? [`${schoolCalendar?.academicYear}:in:${academicYear}`] : []),
          ...getFilters() as unknown as any
        ],
        otherProgramStage: dataStoreData?.['final-result']?.programStage,
        order: dataStoreData.defaults.defaultOrder
      })
  }, [sectionType, filetrState, refetch, pagination.page, pagination.pageSize, academicYear, grade, section, school])

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
          [STUDENT_LEVEL_KEY]: levelLabel,
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
            <Table
              programConfig={programData!}
              title={tableTitle}
              viewPortWidth={viewPortWidth}
              columns={computedColumns}
              tableData={displayedRows}
              inactiveRowMessage={inactiveRowMessage}
              enableInactiveRowSelection={true}
              filterState={filetrState}
              loading={loading}
              rightElements={
                <EnrollmentActionsButtons
                  i18n={i18n}
                  selected={selected}
                  selectedDataStoreKey={dataStoreData}
                  programData={programData as unknown as ProgramConfig}
                  baseUrl={baseUrl}
                />
              }
              setFilterState={setFilterState}
              selectable={true}
              selected={selected}
              setSelected={setSelected}
              pagination={pagination}
              setPagination={setPagination}
              paginate={!loading}
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
                      renderValue={(selectedValue) => selectedValue === "ALL" ? i18n.t("Student Level") : String(selectedValue)}
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

                  <FormControl
                    size="small"
                    sx={{
                      flex: { xs: "1 1 100%", sm: "1 1 210px" },
                      minWidth: { xs: "100%", sm: 210 },
                      "& .MuiInputBase-root": { height: 36 },
                      "& .MuiSelect-select": { py: 0.75 }
                    }}
                  >
                    <Select
                      displayEmpty
                      value={term3Sort}
                      onChange={(event) => setTerm3Sort(event.target.value as "none" | "asc" | "desc")}
                      renderValue={(selectedValue) => {
                        if (selectedValue === "asc") return `${i18n.t("Sort Term 3 Total")} (${i18n.t("Ascending")})`
                        if (selectedValue === "desc") return `${i18n.t("Sort Term 3 Total")} (${i18n.t("Descending")})`
                        return i18n.t("Sort Term 3 Total")
                      }}
                    >
                      <MenuItem value="none">{i18n.t("Default order")}</MenuItem>
                      <MenuItem value="asc">{i18n.t("Ascending")}</MenuItem>
                      <MenuItem value="desc">{i18n.t("Descending")}</MenuItem>
                    </Select>
                  </FormControl>
                </Box>
              }
            />
          </>
      }
    </div>
  )
}
