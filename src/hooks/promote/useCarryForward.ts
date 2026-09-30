import { format } from "date-fns";
import useGetSelectedKeys from "../config/useGetSelectedKeys";
import { enrollmentDates, getAcademicYearOptions, getProgramNames, useGetLearnerEnrollments, useShowAlerts, useUploadEvents, useUrlParams } from "dhis2-semis-functions";
import { useGetUsedProgramStages, useSchoolCalendarKey } from "dhis2-semis-components";
import { newYearEvents, newYearTrackedEntity } from "../../utils/promotion/newYearPayload";

export interface CarryForwardRow {
    trackedEntity: string
    enrollmentId: string
    // Destination school for the new academic year
    orgUnit: string
    // Registration data element values for the new record (already includes any per-row edits)
    registrationValues: Record<string, string>
    row: any
}

// Re-enrollment for sections that carry each person's own record forward (staff):
// the new registration starts from their current one, only the academic year and any
// adjusted fields change, and anyone already registered in the target year (or enrolled in
// a later one) is skipped.
export function useCarryForward() {
    const { getLearnerEnrollments, planEnrollments } = useGetLearnerEnrollments()
    const { uploadValues } = useUploadEvents()
    const { show } = useShowAlerts()
    const { urlParameters } = useUrlParams()
    const { sectionType } = urlParameters
    const schoolCalendar = useSchoolCalendarKey()
    const { dataStoreData, program } = useGetSelectedKeys()
    const programStagesToUse = useGetUsedProgramStages({ sectionType: sectionType as any })
    const registrationStage = dataStoreData?.registration?.programStage
    const socioEconomicStage = dataStoreData?.["socio-economics"]?.programStage
    const academicYearDataElement = schoolCalendar?.academicYear as unknown as string

    const years = () => ({ calendars: schoolCalendar?.schoolCalendar ?? [], options: getAcademicYearOptions(program, academicYearDataElement) })

    // Events of every enrollment in the program, per tracked entity (loaded 50 people per request)
    function eventsOf(enrollments: Map<string, any[]>): Map<string, any[]> {
        const byTrackedEntity = new Map<string, any[]>()
        for (const [trackedEntity, teiEnrollments] of enrollments) {
            byTrackedEntity.set(trackedEntity, teiEnrollments.flatMap((enrollment: any) =>
                (enrollment?.events ?? []).map((event: any) => ({ ...event, enrollment: event?.enrollment ?? enrollment?.enrollment }))))
        }
        return byTrackedEntity
    }

    async function getEventsByTrackedEntity(trackedEntities: string[]): Promise<Map<string, any[]>> {
        return eventsOf(await getLearnerEnrollments(trackedEntities, program?.id as string))
    }

    function planTargetYear(trackedEntities: string[], targetYear: string) {
        return planEnrollments({
            trackedEntities,
            program: program?.id as string,
            targetAcademicYear: targetYear,
            currentAcademicYear: schoolCalendar?.defaults?.academicYear ?? targetYear,
            registrationStage,
            academicYearDataElement,
            years: years(),
        })
    }

    const valueOf = (event: any, dataElement?: string) =>
        event?.dataValues?.find((dv: any) => dv.dataElement === dataElement)?.value

    // Tracked entities that cannot be registered in the target academic year: already registered
    // there, or enrolled in a later year
    async function getAlreadyRegistered(trackedEntities: string[], targetYear: string): Promise<Set<string>> {
        const { plans } = await planTargetYear(Array.from(new Set(trackedEntities)), targetYear)
        return new Set(Array.from(plans.entries()).filter(([, plan]) => plan.conflict).map(([trackedEntity]) => trackedEntity))
    }

    // Latest value of one data element in one stage, per enrollment (e.g. the re-enrollment status)
    async function getStageValues(trackedEntities: string[], stage?: string, dataElement?: string): Promise<Map<string, string>> {
        const values = new Map<string, string>()
        if (!stage || !dataElement) return values
        const events = await getEventsByTrackedEntity(trackedEntities)
        for (const teiEvents of events.values()) {
            for (const e of teiEvents) {
                const value = e.programStage === stage ? valueOf(e, dataElement) : undefined
                if (value) values.set(e.enrollment, value)
            }
        }
        return values
    }

    // Socio-economic values per current enrollment
    function socioEconomicByEnrollment(events: Map<string, any[]>): Map<string, any[]> {
        const byEnrollment = new Map<string, any[]>()
        if (!socioEconomicStage) return byEnrollment
        for (const teiEvents of events.values()) {
            for (const e of teiEvents) {
                if (e.programStage === socioEconomicStage && !byEnrollment.has(e.enrollment)) {
                    byEnrollment.set(e.enrollment, (e.dataValues ?? []).map((dv: any) => ({ dataElement: dv.dataElement, value: dv.value })))
                }
            }
        }
        return byEnrollment
    }

    async function carryForward({ rows, targetYear, enrollmentDate }: { rows: CarryForwardRow[], targetYear: string, enrollmentDate: string }) {
        const date = format(new Date(), "yyyy-MM-dd")
        const trackedEntityIds = rows.map((x) => x.trackedEntity)

        // Checked again at save time, in case someone was carried forward since the review opened
        const { plans, enrollments } = await planTargetYear(trackedEntityIds, targetYear)
        const events = eventsOf(enrollments)
        const toCreate = rows.filter((x) => !plans.get(x.trackedEntity)?.conflict)
        const skipped = rows.filter((x) => plans.get(x.trackedEntity)?.conflict).map((x) => x.row)
        const socioEconomic = socioEconomicByEnrollment(events)

        // occurredAt is the target year's start; enrolledAt the date entered (default: that start)
        const { calendarFound, ...dates } = enrollmentDates({ calendar: schoolCalendar?.schoolCalendar ?? [], academicYear: targetYear, enrollmentDate, options: years().options })
        if (!calendarFound && toCreate.length) {
            show({ message: "The academic year is not in the school calendar. The enrollment date is used as its start date.", type: { warning: true } })
        }

        const trackedEntities = toCreate.map((item) => {
            const registrationDataValues = Object.entries({ ...item.registrationValues, [academicYearDataElement]: targetYear })
                .filter(([, value]) => value !== undefined && value !== null && value !== "")
                .map(([dataElement, value]) => ({ dataElement, value }))

            // Same enrollment shape as the promotion flow
            return newYearTrackedEntity({
                trackedEntity: item.trackedEntity,
                trackedEntityType: dataStoreData?.trackedEntityType,
                orgUnit: item.orgUnit,
                program: program?.id as string,
                plan: plans.get(item.trackedEntity)!,
                dates,
                events: newYearEvents({
                    program: program?.id as string,
                    orgUnit: item.orgUnit,
                    date,
                    registrationStage,
                    registrationValues: registrationDataValues,
                    socioEconomicStage,
                    socioEconomicValues: socioEconomic.get(item.enrollmentId),
                    placeholderStages: programStagesToUse as string[],
                }),
            })
        })

        if (trackedEntities.length === 0) return { posted: 0, conflicts: skipped }

        // Errors (e.g. a duplicate unique attribute) are shown by uploadValues with the server's reason
        const response: any = await uploadValues({ trackedEntities }, "COMMIT", "CREATE_AND_UPDATE", {
            errorMessage: "Could not carry staff forward",
            names: getProgramNames(program),
        })
        // Some records can be rejected while the rest save; count the enrollments actually created
        const created = response?.bundleReport?.typeReportMap?.ENROLLMENT?.stats?.created

        return { posted: typeof created === "number" ? created : trackedEntities.length, conflicts: skipped }
    }

    return { carryForward, getAlreadyRegistered, getStageValues, registrationStage, academicYearDataElement }
}
