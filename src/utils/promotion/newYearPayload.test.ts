import { planEnrollmentTransition } from "dhis2-semis-functions";
import { newYearEventDate, newYearEvents, newYearTrackedEntity } from "./newYearPayload";

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

describe("newYearEventDate", () => {
    it("uses the enrollment date of a back-captured year", () => {
        expect(newYearEventDate({ enrolledAt: "2020-09-14", occurredAt: "2020-09-14" }, "2026-10-04")).toBe("2020-09-14")
    })
    it("falls back to the year start", () => {
        expect(newYearEventDate({ occurredAt: "2021-09-13T00:00:00.000" }, "2026-10-04")).toBe("2021-09-13")
    })
    it("never uses a future date", () => {
        expect(newYearEventDate({ enrolledAt: "2027-09-13" }, "2026-10-04")).toBe("2026-10-04")
    })
})

test("placeholders take stageDate (term end, year end); registration keeps the enrollment date", () => {
    const events = newYearEvents({ program: "P", orgUnit: "S", date: "2019-09-09", registrationStage: "REG", registrationValues: [], placeholderStages: ["T1", "FINAL"],
        stageDate: (s) => (s === "T1" ? "2019-12-20" : "2020-07-17") })
    expect(events.map((e: any) => [e.programStage, e.occurredAt, e.scheduledAt])).toEqual([["REG", "2019-09-09", "2019-09-09"], ["T1", "2019-12-20", "2019-12-20"], ["FINAL", "2020-07-17", "2020-07-17"]])
})
