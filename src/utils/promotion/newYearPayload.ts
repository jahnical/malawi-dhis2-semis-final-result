import { enrollmentsForTransition, type TransitionPlan } from "dhis2-semis-functions";

type DataValue = { dataElement: string, value: any }

/**
 * Date of the new year's events: the enrollment date (default: the year start), never later than today.
 * Using the day of the promotion instead would put the events of a back-captured year in the wrong period.
 */
export function newYearEventDate(dates: { enrolledAt?: string, occurredAt?: string }, today: string = localToday()): string {
    const date = (dates.enrolledAt || dates.occurredAt || today).slice(0, 10)
    return date < today ? date : today
}

function localToday(): string {
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, "0")
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

// Events of a new academic year's enrollment: socio-economics copied from the current year (when any),
// the registration event and empty placeholders for the other stages used by the section.
export function newYearEvents({ program, orgUnit, date, registrationStage, registrationValues, socioEconomicStage, socioEconomicValues = [], placeholderStages, stageDate }: {
    program: string
    orgUnit: string
    date: string
    registrationStage: string
    registrationValues: DataValue[]
    socioEconomicStage?: string
    socioEconomicValues?: DataValue[]
    placeholderStages: string[]
    // Date of each placeholder (stageDatesForYear: term end, year end, never after today); default `date`
    stageDate?: (programStage?: string) => string
}) {
    const event = (programStage: string, dataValues: DataValue[], on: string = date) =>
        ({ occurredAt: on, notes: [], status: "ACTIVE", program, programStage, orgUnit, scheduledAt: on, dataValues })

    return [
        ...(socioEconomicStage && socioEconomicValues.length ? [event(socioEconomicStage, socioEconomicValues)] : []),
        event(registrationStage, registrationValues),
        ...placeholderStages.map((stage) => event(stage, [], stageDate?.(stage) ?? date)),
    ]
}

/**
 * Tracked entity payload that registers a person for a new academic year (promotion or carry-forward).
 * The plan decides the status (ACTIVE for the current or a later year) and closes a still-ACTIVE
 * earlier enrollment in the same payload. enrolledAt is the enrollment date entered (default: the year
 * start) and occurredAt the start of the target academic year.
 */
export function newYearTrackedEntity({ trackedEntity, trackedEntityType, orgUnit, attributes = [], program, plan, dates, events }: {
    trackedEntity: string
    trackedEntityType?: string
    orgUnit: string
    attributes?: any[]
    program: string
    plan: TransitionPlan
    dates: { enrolledAt?: string, occurredAt?: string }
    events: any[]
}) {
    return {
        trackedEntity,
        trackedEntityType,
        orgUnit,
        attributes,
        enrollments: enrollmentsForTransition({
            plan,
            trackedEntity,
            program,
            enrollment: { orgUnit, enrolledAt: dates.enrolledAt, occurredAt: dates.occurredAt, events },
        }),
    }
}
