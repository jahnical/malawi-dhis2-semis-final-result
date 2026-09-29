import { format } from "date-fns";
import useGetSelectedKeys from "../config/useGetSelectedKeys";
import { useGetCompleteTeis, useUploadEvents, useUrlParams } from "dhis2-semis-functions";
import { useGetUsedProgramStages, useSchoolCalendarKey } from "dhis2-semis-components";

export interface CarryForwardRow {
    trackedEntity: string
    enrollmentId: string
    // Destination school for the new academic year
    orgUnit: string
    // Registration data element values for the new record (already includes any per-row edits)
    registrationValues: Record<string, string>
    row: any
}

const BATCH_SIZE = 50

const toBatches = <T,>(items: T[]) => {
    const batches: T[][] = []
    for (let i = 0; i < items.length; i += BATCH_SIZE) batches.push(items.slice(i, i + BATCH_SIZE))
    return batches
}

// Re-enrollment for sections that carry each person's own record forward (staff):
// the new registration starts from their current one, only the academic year and any
// adjusted fields change, and anyone already registered in the target year is skipped.
export function useCarryForward() {
    const { getCompleteTeis } = useGetCompleteTeis()
    const { uploadValues } = useUploadEvents()
    const { urlParameters } = useUrlParams()
    const { sectionType } = urlParameters
    const schoolCalendar = useSchoolCalendarKey()
    const { dataStoreData, program } = useGetSelectedKeys()
    const programStagesToUse = useGetUsedProgramStages({ sectionType: sectionType as any })
    const registrationStage = dataStoreData?.registration?.programStage
    const socioEconomicStage = dataStoreData?.["socio-economics"]?.programStage
    const academicYearDataElement = schoolCalendar?.academicYear as unknown as string

    // The events API (2.40) takes only one tracked entity per request, but tracked entities can be
    // fetched as a ';' list, so load each batch's events through them: one request per 50 people.
    async function getEventsByTrackedEntity(trackedEntities: string[]): Promise<Map<string, any[]>> {
        const byTrackedEntity = new Map<string, any[]>()
        for (const batch of toBatches(Array.from(new Set(trackedEntities)))) {
            const response: any = await getCompleteTeis({
                program: program?.id as string,
                trackedEntities: batch.join(";"),
                orgUnitMode: "ACCESSIBLE",
                pageSize: BATCH_SIZE,
                fields: "trackedEntity,enrollments[enrollment,program,events[event,enrollment,programStage,dataValues[dataElement,value]]]",
            } as any)
            const teis = response?.results?.instances ?? response?.results?.trackedEntities ?? []
            for (const tei of teis) {
                const events = (tei?.enrollments ?? [])
                    .filter((enrollment: any) => !enrollment?.program || enrollment.program === program?.id)
                    .flatMap((enrollment: any) => (enrollment?.events ?? []).map((event: any) => ({ ...event, enrollment: event?.enrollment ?? enrollment?.enrollment })))
                byTrackedEntity.set(tei.trackedEntity, events)
            }
        }
        return byTrackedEntity
    }

    const valueOf = (event: any, dataElement?: string) =>
        event?.dataValues?.find((dv: any) => dv.dataElement === dataElement)?.value

    // Tracked entities that already have a registration in the target academic year
    async function getAlreadyRegistered(trackedEntities: string[], targetYear: string): Promise<Set<string>> {
        const registered = new Set<string>()
        const events = await getEventsByTrackedEntity(trackedEntities)
        for (const [trackedEntity, teiEvents] of events) {
            if (teiEvents.some((e) => e.programStage === registrationStage && valueOf(e, academicYearDataElement) === targetYear)) {
                registered.add(trackedEntity)
            }
        }
        return registered
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
        const events = await getEventsByTrackedEntity(trackedEntityIds)
        const alreadyRegistered = new Set(Array.from(events.entries())
            .filter(([, teiEvents]) => teiEvents.some((e) => e.programStage === registrationStage && valueOf(e, academicYearDataElement) === targetYear))
            .map(([trackedEntity]) => trackedEntity))
        const toCreate = rows.filter((x) => !alreadyRegistered.has(x.trackedEntity))
        const skipped = rows.filter((x) => alreadyRegistered.has(x.trackedEntity)).map((x) => x.row)
        const socioEconomic = socioEconomicByEnrollment(events)

        const event = (stage: string, orgUnit: string, dataValues: any[]) => ({
            occurredAt: date, notes: [], status: "ACTIVE", program: program?.id, programStage: stage, orgUnit, scheduledAt: date, dataValues
        })

        const trackedEntities = toCreate.map((item) => {
            const registrationDataValues = Object.entries({ ...item.registrationValues, [academicYearDataElement]: targetYear })
                .filter(([, value]) => value !== undefined && value !== null && value !== "")
                .map(([dataElement, value]) => ({ dataElement, value }))

            const socioValues = socioEconomic.get(item.enrollmentId)
            const events = [
                ...(socioValues?.length ? [event(socioEconomicStage!, item.orgUnit, socioValues)] : []),
                event(registrationStage, item.orgUnit, registrationDataValues),
                ...programStagesToUse.map((stage) => event(stage as string, item.orgUnit, [])),
            ]

            // Same enrollment shape as the existing promotion flow
            return {
                trackedEntity: item.trackedEntity,
                trackedEntityType: dataStoreData?.trackedEntityType,
                orgUnit: item.orgUnit,
                attributes: [],
                enrollments: [{
                    occurredAt: date,
                    enrolledAt: enrollmentDate,
                    program: program?.id,
                    orgUnit: item.orgUnit,
                    status: "COMPLETED",
                    events,
                }],
            }
        })

        if (trackedEntities.length) await uploadValues({ trackedEntities }, "COMMIT", "CREATE_AND_UPDATE")

        return { posted: trackedEntities.length, conflicts: skipped }
    }

    return { carryForward, getAlreadyRegistered, getStageValues, registrationStage, academicYearDataElement }
}
