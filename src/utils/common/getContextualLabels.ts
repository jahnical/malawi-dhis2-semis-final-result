import i18next from "@dhis2/d2-i18n";

export const getContextualLabels = (sectionType: string) => {
    const isStaff = sectionType === 'staff';

    return {
        assignButtonLabel: isStaff
            ? i18next.t('Assign re-enrollment status')
            : i18next.t('Record final decision'),
        promoteButtonLabel: isStaff
            ? i18next.t('Perform re-enrollment')
            : i18next.t('Enroll in next year'),
        bulkButtonLabel: isStaff
            ? i18next.t('Bulk Staff Re-enrollment')
            : i18next.t('Bulk Final Result'),

        assignModalTitle: isStaff
            ? i18next.t('Assign Re-enrollment Status')
            : i18next.t('Record Final Decision'),
        promoteModalTitle: isStaff
            ? i18next.t('Perform Re-enrollment')
            : i18next.t('Enroll in Next Year'),

        formName: isStaff
            ? i18next.t('Staff re-enrollment')
            : i18next.t('Next year enrollment'),
        formDescription: isStaff
            ? i18next.t('Staff re-enrollment')
            : i18next.t('Applies to every selected learner'),
        assignFormName: isStaff
            ? i18next.t('Staff Re-enrollment Status')
            : i18next.t('Final decision'),
        assignFormDescription: isStaff
            ? i18next.t('Staff re-enrollment status')
            : i18next.t('Recording a decision does not enroll the learner in next year'),

        noResultMessage: isStaff
            ? i18next.t('Some selected staff have no re-enrollment status or were not re-enrolled.')
            : i18next.t('None of the selected learners can be enrolled in next year: they have no final decision, are not continuing or are already enrolled.'),
        selectOrgUnitTooltip: i18next.t('Please select an organisation unit before'),
        selectFiltersTooltip: isStaff
            ? i18next.t('Please select type of staff and employment type')
            : i18next.t('Please select section and grade'),

        successLabel: isStaff
            ? i18next.t('Re-enrolled staff')
            : i18next.t('Enrolled in next year'),
        failureLabel: isStaff
            ? i18next.t('Not re-enrolled staff')
            : i18next.t('Not enrolled'),
        summaryTitle: isStaff
            ? i18next.t('Staff Re-enrollment Summary')
            : i18next.t('Next Year Enrollment Summary'),
        summaryPreviewTag: isStaff
            ? i18next.t('Staff re-enrollment preview')
            : i18next.t('Next year enrollment'),
        conflictMessage: isStaff
            ? i18next.t('The following staff were not re-enrolled. They already exist on the selected academic year')
            : i18next.t('The following learners were not enrolled. They are already registered in the selected academic year'),

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
