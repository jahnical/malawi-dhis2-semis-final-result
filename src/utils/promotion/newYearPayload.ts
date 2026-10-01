import { enrollmentsForTransition, type TransitionPlan } from "dhis2-semis-functions";

type DataValue = { dataElement: string, value: any }

// Events of a new academic year's enrollment: socio-economics copied from the current year (when any),
// the registration event and empty placeholders for the other stages used by the section.
export function newYearEvents({ program, orgUnit, date, registrationStage, registrationValues, socioEconomicStage, socioEconomicValues = [], placeholderStages }: {
    program: string
    orgUnit: string
    date: string
    registrationStage: string
    registrationValues: DataValue[]
    socioEconomicStage?: string
    socioEconomicValues?: DataValue[]
    placeholderStages: string[]
}) {
    const event = (programStage: string, dataValues: DataValue[]) =>
        ({ occurredAt: date, notes: [], status: "ACTIVE", program, programStage, orgUnit, scheduledAt: date, dataValues })

    return [
        ...(socioEconomicStage && socioEconomicValues.length ? [event(socioEconomicStage, socioEconomicValues)] : []),
        event(registrationStage, registrationValues),
        ...placeholderStages.map((stage) => event(stage, [])),
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
