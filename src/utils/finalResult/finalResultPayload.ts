import { closeEnrollmentPayload, statusForFinalResult, type ExistingEnrollment } from "dhis2-semis-functions";

type DataValue = { dataElement: string, value: any }

/**
 * Tracked entity payload that records a final result for one enrollment.
 * The enrollment is COMPLETED (or CANCELLED for a dropout) and keeps its own org unit and dates;
 * only the final-result event is dated today.
 */
export function finalResultTrackedEntity({ enrollment, trackedEntity, trackedEntityType, program, existingEvent, submittedDataValues,
    statusDataElement, dropoutStatusValues, programStage, eventOrgUnit, trackedEntityOrgUnit, today }: {
    enrollment: ExistingEnrollment
    trackedEntity: string
    trackedEntityType?: string
    program: string
    // The final-result event already saved for this enrollment, if any
    existingEvent?: any
    submittedDataValues: DataValue[]
    statusDataElement: string
    dropoutStatusValues?: string[]
    programStage: string
    // Where a new final-result event is created: the learner's registration school
    eventOrgUnit: string
    trackedEntityOrgUnit: string
    today: string
}) {
    const merged = new Map<string, any>()
    for (const dataValue of existingEvent?.dataValues ?? []) {
        if (dataValue?.dataElement) merged.set(dataValue.dataElement, dataValue.value)
    }
    for (const dataValue of submittedDataValues) merged.set(dataValue.dataElement, dataValue.value)

    const event = existingEvent
        ? { ...existingEvent, dataValues: Array.from(merged.entries()).map(([dataElement, value]) => ({ dataElement, value })) }
        : {
            orgUnit: eventOrgUnit,
            status: "COMPLETED",
            program,
            programStage,
            occurredAt: today,
            scheduledAt: today,
            dataValues: submittedDataValues,
        }

    return {
        orgUnit: trackedEntityOrgUnit,
        trackedEntity,
        trackedEntityType,
        enrollments: [{
            ...closeEnrollmentPayload(enrollment, trackedEntity, program, statusForFinalResult(merged.get(statusDataElement), dropoutStatusValues)),
            events: [event],
        }],
    }
}
