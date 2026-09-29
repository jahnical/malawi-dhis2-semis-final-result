import React, { useState, useEffect } from 'react'
import { ButtonStrip, Center, CircularLoader, IconUserGroup16 } from "@dhis2/ui";
import styles from './enrollmentActionsButtons.module.css'
import { useBuildForm, useCheckFilters, useGetSectionTypeLabel, useSectionProfile, useShowAlerts, useUrlParams } from 'dhis2-semis-functions';
import { Form } from "react-final-form";
import { Modules, ProgramConfig, selectedDataStoreKey, TableDataRefetch } from 'dhis2-semis-types'
import { DataExporter, DataImporter, CustomDropdown as DropdownButton, useSchoolCalendarKey } from 'dhis2-semis-components';
import AsssignFinalResult from '../assingFinalResult/assignFinalResult';
import PerformPromotion from '../performPromotion/performPromotion';
import CarryForward from '../carryForward/CarryForward';
import ShowStats from '../stats/showStats';
import { Tooltip } from '@mui/material';
import useGetSelectedKeys from '../../hooks/config/useGetSelectedKeys';
import { staticForm } from "../../constants/searchEnrollmentForm";
import { getContextualLabels } from '../../utils/common/getContextualLabels';
import { useSetRecoilState } from 'recoil';

function EnrollmentActionsButtons({ programData, selectedDataStoreKey, selected, i18n, baseUrl }: { selected: any, programData: ProgramConfig, selectedDataStoreKey: selectedDataStoreKey, i18n: any, baseUrl: string }) {
    const { urlParameters } = useUrlParams();
    const schoolCalendar = useSchoolCalendarKey()
    const { school: orgUnit, class: section, grade, academicYear, sectionType } = urlParameters;
    const { sectionName } = useGetSectionTypeLabel();
    const { dataStoreData } = useGetSelectedKeys()
    const { formData } = useBuildForm({ dataStoreData, programData, module: Modules.Enrollment, schoolCalendar: schoolCalendar });
    const [enrollmentDetails = []] = formData
    const [stats, setStats] = useState<{ posted: number, conflicts: any[] }>({ posted: 0, conflicts: [] })
    const [open, setOpen] = useState<boolean>(false)
    const [loading, setLoading] = useState(true)
    const { hide, show } = useShowAlerts()
    const { areAllSelected, getFilters } = useCheckFilters({ filters: (dataStoreData.filters.dataElements ?? []) as unknown as any })
    const labels = getContextualLabels(sectionType as string)
    const { reEnrollByCarryForward } = useSectionProfile()
    // Staff can run re-enrollment without a status stage; status actions need one
    const hasStatusStage = Boolean(dataStoreData?.['final-result']?.programStage)
    const setRefetch = useSetRecoilState(TableDataRefetch);

    const showAlert = (error: any) => {
        show({ message: `Unknown error: ${error}`, type: { critical: true } })
        setTimeout(hide, 5000);
    }

    useEffect(() => {
        if (formData.length > 0) {
            setLoading(false);
        }
    }, [formData])

    if (loading) {
        return (
            <Center>
                <CircularLoader small />
            </Center>
        )
    }

    const enrollmentOptions: any = [
        {
            label: <DataImporter
                baseURL={baseUrl}
                label={labels.bulkButtonLabel}
                module='final-result'
                onError={(e: any) => { showAlert(e) }}
                programConfig={programData}
                sectionType={sectionName}
                selectedSectionDataStore={selectedDataStoreKey}
                updating={false}
                title={labels.bulkImportTitle}
                onClose={() => setRefetch(prev => !prev)}
            />,
            divider: true,
            disabled: false,
        },
        {
            label: <DataExporter
                Form={Form}
                baseURL={baseUrl}
                eventFilters={[
                    ...(academicYear ? [`${schoolCalendar?.academicYear}:in:${academicYear}`] : []),
                    ...getFilters() as unknown as any
                ]}
                label={labels.exportLabel}
                module='final-result'
                onError={(e: any) => { showAlert(e) }}
                programConfig={programData}
                sectionType={sectionName}
                selectedSectionDataStore={selectedDataStoreKey}
                empty={false}
                stagesToExport={[selectedDataStoreKey?.['final-result']?.programStage as unknown as string]}
            />,
            divider: false,
            disabled: false,
        }
    ];

    return (
        <div className={styles.container}>
            <ShowStats open={open} setOpen={setOpen} stats={stats} />
            <ButtonStrip className={styles.work_buttons}>
                {hasStatusStage && <Tooltip title={orgUnit === null ? "Please select an organisation unit before" : ""}>
                    <AsssignFinalResult i18n={i18n} selected={selected} />
                </Tooltip>}

                <Tooltip title={orgUnit === null ? "Please select an organisation unit before" : ""} >
                    {reEnrollByCarryForward
                        ? <span><CarryForward i18n={i18n} selected={selected} openStats={setOpen} setStats={setStats} /></span>
                        : <PerformPromotion i18n={i18n} formData={[staticForm({ i18n }).registeringSchool, ...enrollmentDetails, staticForm({ i18n }).enrollmentDate]} openStats={setOpen} setStats={setStats} selected={selected} />}
                </Tooltip>

                {hasStatusStage && <Tooltip title={(section === null || grade === null || academicYear == undefined) ? labels.selectFiltersTooltip : ""} >
                    <span>
                        <DropdownButton
                            name={<span className={styles.work_buttons_text}>{labels.bulkButtonLabel}</span> as unknown as string}
                            disabled={!!(orgUnit == undefined || !areAllSelected() || academicYear == undefined)}
                            icon={<IconUserGroup16 />}
                            options={enrollmentOptions}
                        />
                    </span>
                </Tooltip>}

            </ButtonStrip>
        </div>
    )
}

export default EnrollmentActionsButtons
