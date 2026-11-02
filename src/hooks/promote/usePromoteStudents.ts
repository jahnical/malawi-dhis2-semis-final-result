import { useShowAlerts } from 'dhis2-semis-functions';
import useGetSelectedKeys from "../config/useGetSelectedKeys";
import { enrollmentDates, getAcademicYearOptions, getProgramNames, TRANSITION_CONFLICT_MESSAGES, useGetLearnerEnrollments, useSectionProfile, useUploadEach, useUrlParams, stageDatesForYear } from "dhis2-semis-functions"
import { useGetUsedProgramStages, useSchoolCalendarKey } from "dhis2-semis-components";
import { newYearEventDate, newYearEvents, newYearTrackedEntity } from "../../utils/promotion/newYearPayload";

// The learner's own grade replaces the one from the form, if any
function withGrade(values: { dataElement: string, value: any }[], gradeDataElement: string | undefined, grade: string | undefined) {
    if (!gradeDataElement || !grade) return values
    return [...values.filter((dv) => dv.dataElement !== gradeDataElement), { dataElement: gradeDataElement, value: grade }]
}

export function usePromoteStudents({ selected, setOpen, setStats, setOpenPerform, setLoading }: { setLoading: (args: boolean) => void, setOpenPerform: any, setStats: (args: any) => void, selected: any[], setOpen: (args: boolean) => void }) {
    const { urlParameters } = useUrlParams();
    const { school, sectionType } = urlParameters;
    const { uploadEach } = useUploadEach()
    const { show } = useShowAlerts()
    const { promotionChoosesOrgUnit } = useSectionProfile()
    const schoolCalendar = useSchoolCalendarKey()
    const { dataStoreData, program: programData } = useGetSelectedKeys()
    const programStagesToUse = useGetUsedProgramStages({ sectionType: sectionType as any })
    const { planEnrollments } = useGetLearnerEnrollments()

    // learners: who to enroll (default: everyone selected). gradeFor: each learner's grade in the new
    // year, when it differs per learner (next grade for a pass, same grade for a repeat)
    async function promote(values: any, { learners = selected, gradeFor }: { learners?: any[], gradeFor?: (tei: any) => string | undefined } = {}) {
        setLoading(true)
        // A retry starts a fresh summary instead of adding to the last one
        setStats({ posted: 0, conflicts: [], failed: [] })
        try {
        // One entry per learner: their new-year enrollment plus the closing of last year's
        let toSave: { tei: any, payload: any }[] = []
        let registrationEvent: any = []
        const socioEconomicPStage = dataStoreData["socio-economics"]?.programStage
        const registrationStage = dataStoreData.registration.programStage
        const academicYearDataElement = (dataStoreData.registration.academicYear || schoolCalendar?.academicYear) as string
        const gradeDataElement = dataStoreData.registration.grade
        const calendars = schoolCalendar?.schoolCalendar ?? []
        const options = getAcademicYearOptions(programData, academicYearDataElement)
        const targetYear = values?.[academicYearDataElement]

        const orgUnit = promotionChoosesOrgUnit ? values.registeringSchool : school;

        const { registeringSchool, enrollment_date, ...registrationValues } = values
        for (const key in registrationValues) {
            registrationEvent.push({
                dataElement: key,
                value: registrationValues[key]
            })
        }

        // occurredAt is the target year's start; enrolledAt the date entered (default: that start)
        const { calendarFound, ...dates } = enrollmentDates({ calendar: calendars, academicYear: targetYear, enrollmentDate: enrollment_date, options })
        if (!calendarFound) {
            show({ message: 'The academic year is not in the school calendar. The enrollment date is used as its start date.', type: { warning: true } })
        }

        // Anyone already registered in the target year (or enrolled in a later one) is skipped. A previous
        // year still ACTIVE (no final result yet) is completed in the same payload.
        const { plans, enrollments: existing } = await planEnrollments({
            trackedEntities: learners.map((tei) => tei.trackedEntity),
            program: programData?.id as string,
            targetAcademicYear: targetYear,
            currentAcademicYear: schoolCalendar?.defaults?.academicYear ?? targetYear,
            registrationStage,
            academicYearDataElement,
            years: { calendars, options },
            // Copied into the new year
            extraStages: [socioEconomicPStage],
        }).catch(() => { throw new Error('Could not check existing enrollments. Please try again.') })
        const unrecognised: any[] = []

        for (const tei of learners) {
            const plan = plans.get(tei.trackedEntity)!
            if (plan.conflict === 'UNKNOWN_ACADEMIC_YEAR') {
                unrecognised.push({ ...tei, reason: TRANSITION_CONFLICT_MESSAGES.UNKNOWN_ACADEMIC_YEAR })
                continue
            }
            if (plan.conflict) {
                setStats((prev: any) => ({ ...prev, conflicts: [...prev.conflicts, tei] }))
                continue
            }

            const socioEconomicEvent = (existing.get(tei.trackedEntity) ?? [])
                .find((enrollment) => enrollment.enrollment === tei.enrollmentId)
                ?.events?.find((event) => event.programStage === socioEconomicPStage && !event.deleted)

            toSave.push({ tei, payload: newYearTrackedEntity({
                trackedEntity: tei.trackedEntity,
                trackedEntityType: dataStoreData.trackedEntityType,
                orgUnit,
                attributes: tei.attributes || [],
                program: programData?.id as string,
                plan,
                dates,
                events: newYearEvents({
                    program: programData?.id as string,
                    orgUnit,
                    date: newYearEventDate(dates),
                    registrationStage,
                    registrationValues: withGrade(registrationEvent, gradeDataElement, gradeFor?.(tei)),
                    socioEconomicStage: socioEconomicEvent ? socioEconomicPStage : undefined,
                    socioEconomicValues: (socioEconomicEvent?.dataValues ?? []).map((dataValue) => ({ dataElement: dataValue?.dataElement, value: dataValue?.value })),
                    placeholderStages: programStagesToUse as string[],
                    // Term and final-result placeholders dated by the target year's calendar
                    stageDate: stageDatesForYear(calendars, targetYear, ((dataStoreData as any)?.performance?.programStages ?? []).map((x: any) => x.programStage)),
                }),
            }) })
        }

        // Each learner saves on its own, all or nothing, so a rejected new enrollment never leaves
        // last year's closed with nothing active (or the reverse), and one learner can't block the rest
        const { saved, failed } = await uploadEach(toSave, {
            toPayload: (item) => ({ trackedEntities: [item.payload] }),
            names: getProgramNames(programData),
        })

        setStats((prev: any) => ({ ...prev, posted: saved.length, failed: [...unrecognised, ...failed.map(({ item, reason }) => ({ ...item.tei, reason }))] }))
        setOpenPerform(false)
        setLoading(false)
        setOpen(true)
        } catch (error: any) {
            show({ message: error?.message ?? 'Could not complete promotion. Please try again.', type: { critical: true } })
        } finally {
            setLoading(false)
        }
    }

    return { promote }
}
