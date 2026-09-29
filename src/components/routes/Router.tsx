import React from 'react';
import { FinalResult, StaffReEnrollment } from '../../pages';
import { Routes, Route } from 'react-router-dom';
import WithHeaderBarLayout from '../../layout/WithHeaderBarLayout';
import { D2I18n } from 'dhis2-semis-types';

export type ModulePage = 'final-result' | 'staff-re-enrollment'

export default function Router({ i18n, baseUrl, page = 'final-result' }: { i18n: D2I18n; baseUrl: string; page?: ModulePage }) {
    return (
        <Routes>
            <Route path='/'
                element={<WithHeaderBarLayout baseUrl={baseUrl} />}
            >
                <Route key={page} path={'/'} element={page === 'staff-re-enrollment'
                    ? <StaffReEnrollment i18n={i18n} baseUrl={baseUrl} />
                    : <FinalResult i18n={i18n} baseUrl={baseUrl} />} />
            </Route>
        </Routes>
    );
}
