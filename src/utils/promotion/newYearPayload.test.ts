import { planEnrollmentTransition } from "dhis2-semis-functions";
import { newYearEvents, newYearTrackedEntity } from "./newYearPayload";

const REG = "REG", AY = "AY"
const previous = (status: string) => ({ enrollment: "E1", status, orgUnit: "S1", enrolledAt: "2025-09-10", occurredAt: "2025-09-08", events: [{ programStage: REG, dataValues: [{ dataElement: AY, value: "2025/2026" }] }] })
const plan = (existing: any[]) => planEnrollmentTransition({
    existing, targetAcademicYear: "2026/2027", currentAcademicYear: "2025/2026", registrationStage: REG, academicYearDataElement: AY,
})
const events = newYearEvents({
    program: "P1", orgUnit: "S1", date: "2026-07-25", registrationStage: REG, registrationValues: [{ dataElement: AY, value: "2026/2027" }],
    socioEconomicStage: "SOCIO", socioEconomicValues: [{ dataElement: "income", value: "low" }], placeholderStages: ["TERM1"],
})

test("promotion before the year starts: new ACTIVE enrollment dated to next year's start", () => {
    const payload = newYearTrackedEntity({
        trackedEntity: "T1", trackedEntityType: "TT", orgUnit: "S1", program: "P1",
        plan: plan([previous("COMPLETED")]), dates: { enrolledAt: "2026-09-07", occurredAt: "2026-09-07" }, events,
    })
    expect(payload.enrollments).toHaveLength(1)
    expect(payload.enrollments[0]).toMatchObject({ status: "ACTIVE", enrolledAt: "2026-09-07", occurredAt: "2026-09-07", orgUnit: "S1" })
    expect((payload.enrollments[0] as any).events.map((e: any) => [e.programStage, e.dataValues.length])).toEqual([["SOCIO", 1], [REG, 1], ["TERM1", 0]])
})

test("a previous year still ACTIVE (no final result) is completed in the same payload", () => {
    const payload = newYearTrackedEntity({
        trackedEntity: "T1", orgUnit: "S1", program: "P1", plan: plan([previous("ACTIVE")]), dates: { enrolledAt: "2026-09-10", occurredAt: "2026-09-07" }, events,
    })
    expect(payload.enrollments.map((e: any) => [e.enrollment, e.status])).toEqual([["E1", "COMPLETED"], [undefined, "ACTIVE"]])
    expect(payload.enrollments[0]).toMatchObject({ enrolledAt: "2025-09-10", occurredAt: "2025-09-08" })
})
