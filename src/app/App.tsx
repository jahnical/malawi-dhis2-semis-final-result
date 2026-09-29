import React from 'react'
import './App.module.css'
import { Router } from '../components/routes'
import type { ModulePage } from '../components/routes/Router'
import { AppWrapper } from 'dhis2-semis-components'
import { useConfig } from '@dhis2/app-runtime'
import { HashRouter } from 'react-router-dom'
import { D2I18n } from 'dhis2-semis-types'
import translator from '../locales/index';

const MyApp = ({ i18n, baseUrl, page }: { i18n: D2I18n; baseUrl?: string; page?: ModulePage }) => {
    const { baseUrl: localBaseUrl } = useConfig()
    const translation: any = i18n ? i18n : translator
    const useBaseUrl = baseUrl || localBaseUrl

    return (
        // <AppWrapper
        //     baseUrl={useBaseUrl}
        //     i18n={translation}
        //     dataStoreKey="dataStore/semis/values"
        //     schoolCalendarKey='dataStore/semis/schoolCalendar'
        // >
        //     <HashRouter>
                <Router i18n={translation as unknown as any} baseUrl={useBaseUrl} page={page} />
        //     </HashRouter >
        // </AppWrapper>
    )
}

// Staff re-enrollment is a separate page from the student Final Result page
export const StaffReEnrollmentApp = (props: { i18n: D2I18n; baseUrl?: string }) => <MyApp {...props} page="staff-re-enrollment" />

export default MyApp
