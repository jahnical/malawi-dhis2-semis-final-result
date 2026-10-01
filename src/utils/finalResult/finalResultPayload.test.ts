import { finalResultTrackedEntity } from "./finalResultPayload";

const enrollment = { enrollment: "E1", status: "ACTIVE", orgUnit: "S1", program: "P1", enrolledAt: "2025-09-10", occurredAt: "2025-09-08" }
const common = {
    enrollment, trackedEntity: "T1", trackedEntityType: "TT", program: "P1", statusDataElement: "FS", dropoutStatusValues: ["Dropout"],
    programStage: "FINAL", eventOrgUnit: "S2", trackedEntityOrgUnit: "S2", today: "2026-07-20",
}

test("a final result completes the enrollment and keeps its org unit and dates", () => {
    const payload = finalResultTrackedEntity({ ...common, submittedDataValues: [{ dataElement: "FS", value: "Promoted" }] })
    const [saved] = payload.enrollments
    expect(saved).toMatchObject({ enrollment: "E1", status: "COMPLETED", orgUnit: "S1", enrolledAt: "2025-09-10", occurredAt: "2025-09-08" })
    // The new final-result event is at the registration school and dated today
    expect(saved.events[0]).toMatchObject({ orgUnit: "S2", programStage: "FINAL", occurredAt: "2026-07-20" })
})

test("a dropout cancels the enrollment; an existing event is updated in place", () => {
    const existingEvent = { event: "F1", orgUnit: "S1", occurredAt: "2026-06-01", dataValues: [{ dataElement: "remark", value: "x" }, { dataElement: "FS", value: "Promoted" }] }
    const [saved] = finalResultTrackedEntity({ ...common, existingEvent, submittedDataValues: [{ dataElement: "FS", value: "dropout" }] }).enrollments
    expect(saved).toMatchObject({ status: "CANCELLED", enrolledAt: "2025-09-10", occurredAt: "2025-09-08" })
    expect(saved.events[0]).toEqual({ ...existingEvent, dataValues: [{ dataElement: "remark", value: "x" }, { dataElement: "FS", value: "dropout" }] })
})
