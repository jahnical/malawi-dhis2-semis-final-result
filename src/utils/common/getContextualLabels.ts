import i18next from "@dhis2/d2-i18n";

export const getContextualLabels = (sectionType: string) => {
    const isStaff = sectionType === 'staff';

    return {
        assignButtonLabel: isStaff
            ? i18next.t('Assign re-enrollment status')
            : i18next.t('Assign final result'),
        promoteButtonLabel: isStaff
            ? i18next.t('Perform re-enrollment')
            : i18next.t('Perform promotion'),
        bulkButtonLabel: isStaff
            ? i18next.t('Bulk Staff Re-enrollment')
            : i18next.t('Bulk Final Result'),

        assignModalTitle: isStaff
            ? i18next.t('Assign Re-enrollment Status')
            : i18next.t('Assign Final Result'),
        promoteModalTitle: isStaff
            ? i18next.t('Perform Re-enrollment')
            : i18next.t('Perform Promotion'),

        formName: isStaff
            ? i18next.t('Staff re-enrollment')
            : i18next.t('Learner promotion'),
        formDescription: isStaff
            ? i18next.t('Staff re-enrollment')
            : i18next.t('Learner promotion'),
        assignFormName: isStaff
            ? i18next.t('Staff Re-enrollment Status')
            : i18next.t('Final Result'),
        assignFormDescription: isStaff
            ? i18next.t('Staff re-enrollment status')
            : i18next.t('Learner final result'),

        noResultMessage: isStaff
            ? i18next.t('Some selected staff have no re-enrollment status or were not re-enrolled.')
            : i18next.t('Some selected learners have no final result or were not promoted.'),
        selectOrgUnitTooltip: i18next.t('Please select an organisation unit before'),
        selectFiltersTooltip: isStaff
            ? i18next.t('Please select type of staff and employment type')
            : i18next.t('Please select section and grade'),

        successLabel: isStaff
            ? i18next.t('Re-enrolled staff')
            : i18next.t('Promoted learners'),
        failureLabel: isStaff
            ? i18next.t('Not re-enrolled staff')
            : i18next.t('No promoted learners'),
        summaryTitle: isStaff
            ? i18next.t('Staff Re-enrollment Summary')
            : i18next.t('Learners Promotion Summary'),
        summaryPreviewTag: isStaff
            ? i18next.t('Staff re-enrollment preview')
            : i18next.t('Learners promotion preview'),
        conflictMessage: isStaff
            ? i18next.t('The following staff were not re-enrolled. They already exist on the selected academic year')
            : i18next.t('The following learners were not promoted. They already exist on the selected academic year'),

        exportLabel: isStaff
            ? i18next.t('Export Staff Re-enrollment')
            : i18next.t('Export Final Result'),
        bulkImportTitle: isStaff
            ? i18next.t('Bulk Staff Re-enrollment')
            : i18next.t('Bulk Final Result'),

        // Entity references
        entityName: isStaff ? i18next.t('staff') : i18next.t('learner'),
        entityNamePlural: isStaff ? i18next.t('staff') : i18next.t('learners'),
    };
};
