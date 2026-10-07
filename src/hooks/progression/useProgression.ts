import { useEffect, useRef, useState } from "react";
import { getAcademicYearOptions, useGetCompleteEvents, useGetLearnerEnrollments } from "dhis2-semis-functions";
import { useSchoolCalendarKey } from "dhis2-semis-components";
import useGetSelectedKeys from "../config/useGetSelectedKeys";
import { classifyDecision, countProgression, dataElementOptions, decisionOf, nextYearEnrollment, optionLabel, progressionState, type Progression, type ProgressionCounts } from "../../utils/progression/progression";

const REGISTRATION_FIELDS = "enrollment,trackedEntity"

/**
 * Next-year status of every learner in the filtered list (all pages), keyed by enrollment.
 * The list is the same registration-stage query the table uses; each learner's enrollments then
 * tell whether a later year exists. Loads in the background, so the table never waits for it.
 */
export function useProgression({ enabled, program, orgUnit, dataElementFilters, attributeFilters, reloadKey }: {
    enabled: boolean
    program?: string
    orgUnit?: string | null
    dataElementFilters: string[]
    attributeFilters: string[]
    // Changes whenever the table reloads
    reloadKey: unknown
}) {
    const { dataStoreData, program: programData } = useGetSelectedKeys()
    const schoolCalendar = useSchoolCalendarKey()
    const { getCompleteEvents } = useGetCompleteEvents()
    const { getLearnerEnrollments } = useGetLearnerEnrollments()
    const [byEnrollment, setByEnrollment] = useState<Map<string, Progression>>(new Map())
    const [counts, setCounts] = useState<ProgressionCounts | undefined>()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(false)
    // Completed loads so far, so callers can wait for a load that started after something they saved
    const [loads, setLoads] = useState(0)
    // Only the latest load may set state; filters can change while an older one is still running
    const run = useRef(0)

    const finalResult = dataStoreData?.["final-result"] as any
    const registrationStage = dataStoreData?.registration?.programStage as string
    const academicYearDataElement = (dataStoreData?.registration?.academicYear || schoolCalendar?.academicYear) as string
    const gradeDataElement = dataStoreData?.registration?.grade as string

    async function load() {
        const current = ++run.current
        setLoading(true)
        setError(false)
        try {
            const response: any = await getCompleteEvents({
                program, programStage: registrationStage, orgUnit, orgUnitMode: orgUnit ? "SELECTED" : "ACCESSIBLE",
                filter: dataElementFilters, filterAttributes: attributeFilters, paging: false, fields: REGISTRATION_FIELDS,
            } as any)
            const rows: { enrollment: string, trackedEntity: string }[] = (response?.results?.instances ?? response?.results?.events ?? [])
                .filter((event: any) => event?.enrollment && event?.trackedEntity)

            const enrollments = await getLearnerEnrollments(rows.map((row) => row.trackedEntity), program as string,
                { stages: [registrationStage, finalResult?.programStage] })
            const decisionOptions = dataElementOptions(programData, finalResult?.status)
            const years = { calendars: schoolCalendar?.schoolCalendar ?? [], options: getAcademicYearOptions(programData, academicYearDataElement) }

            const result = new Map<string, Progression>()
            for (const row of rows) {
                const learnerEnrollments = enrollments.get(row.trackedEntity) ?? []
                const own = learnerEnrollments.find((e) => e.enrollment === row.enrollment)
                const decisionValue = decisionOf(own, finalResult?.programStage, finalResult?.status)
                const decision = classifyDecision(decisionValue, {
                    validStatusValues: finalResult?.validStatusValue, dropoutStatusValues: finalResult?.dropoutStatusValues,
                    label: optionLabel(decisionOptions, decisionValue),
                })
                const nextYear = nextYearEnrollment({
                    enrollments: learnerEnrollments, enrollmentId: row.enrollment, registrationStage, academicYearDataElement, gradeDataElement, years,
                })
                result.set(row.enrollment, { decision, decisionValue, nextYear, state: progressionState({ decision, enrollmentStatus: own?.status, nextYear }) })
            }

            if (current !== run.current) return
            setByEnrollment(result)
            setCounts(countProgression(result.values()))
            setLoads((n) => n + 1)
        } catch {
            if (current !== run.current) return
            setError(true)
        } finally {
            if (current === run.current) setLoading(false)
        }
    }

    useEffect(() => {
        if (!enabled || !program || !registrationStage || !finalResult?.programStage || !finalResult?.status) {
            run.current++
            setByEnrollment(new Map())
            setCounts(undefined)
            return
        }
        void load()
    }, [enabled, program, orgUnit, JSON.stringify(dataElementFilters), JSON.stringify(attributeFilters), reloadKey, registrationStage, finalResult?.programStage, finalResult?.status])

    return { byEnrollment, counts, loading, error, loads, reload: load }
}
