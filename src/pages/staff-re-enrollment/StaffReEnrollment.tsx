import { useRecoilValue } from "recoil";
import { useEffect, useState } from "react";
import { InfoPage, Table, useSchoolCalendarKey } from "dhis2-semis-components";
import { D2I18n, Modules, ProgramConfig, TableDataRefetch } from "dhis2-semis-types";
import { useCheckFilters, useHeader, useTableData, useTableSort, useUrlParams, useViewPortWidth } from "dhis2-semis-functions";
import useGetSelectedKeys from "../../hooks/config/useGetSelectedKeys";
import EnrollmentActionsButtons from "../../components/enrollmentButtons/EnrollmentActionsButtons";

// Staff re-enrollment has its own page so it can evolve apart from the student Final Result page:
// no term totals, levels or final decisions, and the status stage is optional.
export default function StaffReEnrollment({ i18n, baseUrl }: { i18n: D2I18n, baseUrl: string }) {
    const { viewPortWidth } = useViewPortWidth()
    const { urlParameters } = useUrlParams()
    const { academicYear, grade, class: section, schoolName, school, sectionType } = urlParameters
    const { dataStoreData, program } = useGetSelectedKeys()
    const schoolCalendar = useSchoolCalendarKey()
    const refetch = useRecoilValue(TableDataRefetch)
    const [selected, setSelected] = useState([])
    const [filterState, setFilterState] = useState<{ dataElements: any[], attributes: any[] }>({ attributes: [], dataElements: [] })
    const [pagination, setPagination] = useState({ page: 1, pageSize: 50, totalPages: 0, totalElements: 0 })
    const { sort, order, orderBy, createSortHandler, withSortableColumns } = useTableSort({ onSortChange: () => setPagination((prev) => ({ ...prev, page: 1 })) })
    const { getData, tableData, loading, sortableKeys } = useTableData({ module: Modules.Final_Result })
    const { getFilters } = useCheckFilters({ filters: (dataStoreData?.filters?.dataElements ?? []) as unknown as any })

    // Optional: when configured, the status stage adds its columns and each row's status
    const statusStage = dataStoreData?.["final-result"]?.programStage
    const { columns } = useHeader({ dataStoreData, programConfigData: program as unknown as ProgramConfig, programStage: statusStage ?? "" })

    useEffect(() => {
        setSelected([])
        if (school && academicYear)
            void getData({
                page: pagination.page,
                pageSize: pagination.pageSize,
                program: program?.id as string,
                orgUnit: school,
                baseProgramStage: dataStoreData?.registration?.programStage as string,
                attributeFilters: filterState.attributes,
                dataElementFilters: [
                    `${schoolCalendar?.academicYear}:in:${academicYear}`,
                    ...getFilters() as unknown as any
                ],
                ...(statusStage ? { otherProgramStage: statusStage } : {}),
                order: dataStoreData?.defaults?.defaultOrder,
                sort: sort && { ...sort, program: program! },
            })
    }, [sectionType, filterState, refetch, pagination.page, pagination.pageSize, academicYear, grade, section, school, sort])

    useEffect(() => {
        setPagination((prev) => ({ ...prev, totalPages: tableData.pagination.totalPages, totalElements: tableData.pagination.totalElements }))
    }, [tableData])

    return (
        <div style={{ height: "85vh" }}>
            {!(Boolean(schoolName) && Boolean(school)) ?
                <InfoPage
                    title={i18n.t("SEMIS-Staff-Re-enrollment")}
                    sections={[{
                        sectionTitle: `${i18n.t("Follow the instructions to proceed")}:`,
                        instructions: [
                            i18n.t("Select the Organization unit you want to view data"),
                            i18n.t("Choose the academic year to carry staff forward from"),
                        ]
                    }]}
                />
                :
                <Table
                    programConfig={program!}
                    title={i18n.t("Staff Re-enrollment")}
                    viewPortWidth={viewPortWidth}
                    columns={withSortableColumns(columns ?? [], sortableKeys)}
                    tableData={tableData.data}
                    inactiveRowMessage={i18n.t("Terminated")}
                    enableInactiveRowSelection={true}
                    filterState={filterState}
                    setFilterState={setFilterState}
                    loading={loading}
                    rightElements={
                        <EnrollmentActionsButtons
                            i18n={i18n}
                            selected={selected}
                            selectedDataStoreKey={dataStoreData}
                            programData={program as unknown as ProgramConfig}
                            baseUrl={baseUrl}
                        />
                    }
                    selectable={true}
                    selected={selected}
                    setSelected={setSelected}
                    pagination={pagination}
                    setPagination={setPagination}
                    paginate={!loading}
                    sortable
                    order={order}
                    orderBy={orderBy}
                    createSortHandler={createSortHandler}
                />
            }
        </div>
    )
}
