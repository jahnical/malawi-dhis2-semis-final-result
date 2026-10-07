import { classifyDecision, countProgression, decisionOf, nextAcademicYear, nextGrade, nextYearEnrollment, progressionState, promotionGroups, suggestedGrade } from "./progression";

const REG = "REG", FR = "FR", AY = "AY", GRADE = "GRADE", STATUS = "STATUS"
const enrollment = (id: string, year: string | undefined, { grade, status = "COMPLETED", decision, deleted }: { grade?: string, status?: string, decision?: string, deleted?: boolean } = {}) => ({
    enrollment: id, status, orgUnit: "S1", deleted,
    events: [
        ...(year ? [{ programStage: REG, dataValues: [{ dataElement: AY, value: year }, ...(grade ? [{ dataElement: GRADE, value: grade }] : [])] }] : []),
        ...(decision ? [{ programStage: FR, dataValues: [{ dataElement: STATUS, value: decision }] }] : []),
    ],
})
const config = { validStatusValues: ["Pass"], dropoutStatusValues: ["Dropout"] }
const grades = [{ value: "S1", label: "Standard 1" }, { value: "S2", label: "Standard 2" }, { value: "S3", label: "Standard 3" }]
const next = (enrollments: any[], enrollmentId = "E1") => nextYearEnrollment({
    enrollments, enrollmentId, registrationStage: REG, academicYearDataElement: AY, gradeDataElement: GRADE,
})

test("decisions are read against the promotable and dropout statuses, ignoring case", () => {
    expect(classifyDecision("pass", config)).toBe("ADVANCE")
    expect(classifyDecision("Repeat", config)).toBe("REPEAT")
    expect(classifyDecision("DROPOUT", config)).toBe("DROPOUT")
    expect(classifyDecision(" ", config)).toBe("NONE")
    expect(classifyDecision(undefined, config)).toBe("NONE")
})

test("a failed or repeat decision stays in the grade; other unlisted decisions are chosen by hand", () => {
    expect(classifyDecision("Failed", config)).toBe("REPEAT")
    expect(classifyDecision("F1", { ...config, label: "Repeated" })).toBe("REPEAT")
    expect(classifyDecision("Completed", config)).toBe("UNCLASSIFIED")
    // Configured as promotable, it is promotable whatever it is called
    expect(classifyDecision("Promoted", config)).toBe("UNCLASSIFIED")
    expect(classifyDecision("Promoted", { validStatusValues: ["Promoted"] })).toBe("ADVANCE")
})

test("without promotable statuses the code or name tells", () => {
    const noPromotable = { dropoutStatusValues: ["Dropout"] }
    expect(classifyDecision("Promoted", noPromotable)).toBe("ADVANCE")
    expect(classifyDecision("P1", { ...noPromotable, label: "Pass" })).toBe("ADVANCE")
    expect(classifyDecision("Failed", noPromotable)).toBe("REPEAT")
    expect(classifyDecision("Not promoted", noPromotable)).toBe("REPEAT")
    expect(classifyDecision("Completed", noPromotable)).toBe("UNCLASSIFIED")
    expect(classifyDecision("Dropout", noPromotable)).toBe("DROPOUT")
})

test("the decision comes from the final-result event of that enrollment", () => {
    expect(decisionOf(enrollment("E1", "2025/2026", { decision: "Pass" }), FR, STATUS)).toBe("Pass")
    expect(decisionOf(enrollment("E1", "2025/2026"), FR, STATUS)).toBeUndefined()
})

test("a later year's enrollment is found with its year and grade", () => {
    const enrollments = [enrollment("E1", "2025/2026", { grade: "S1" }), enrollment("E2", "2026/2027", { grade: "S2", status: "ACTIVE" })]
    expect(next(enrollments)).toEqual({ enrollment: "E2", academicYear: "2026/2027", grade: "S2" })
})

test("earlier, deleted, admission-only and same-year enrollments are not a next year", () => {
    expect(next([enrollment("E1", "2025/2026"), enrollment("E0", "2024/2025")])).toBeUndefined()
    expect(next([enrollment("E1", "2025/2026"), enrollment("E2", "2026/2027", { deleted: true })])).toBeUndefined()
    expect(next([enrollment("E1", "2025/2026"), enrollment("E2", undefined, { status: "ACTIVE" })])).toBeUndefined()
    expect(next([enrollment("E1", "2025/2026"), enrollment("E2", "2025/2026")])).toBeUndefined()
})

test("the nearest later year is the next year", () => {
    const enrollments = [enrollment("E3", "2027/2028"), enrollment("E1", "2025/2026"), enrollment("E2", "2026/2027")]
    expect(next(enrollments)?.enrollment).toBe("E2")
})

test("state: a next-year enrollment wins, then dropout, then whether a decision exists", () => {
    const nextYear = { enrollment: "E2" }
    expect(progressionState({ decision: "DROPOUT", nextYear })).toBe("ENROLLED")
    expect(progressionState({ decision: "DROPOUT" })).toBe("DROPOUT")
    expect(progressionState({ decision: "NONE", enrollmentStatus: "CANCELLED" })).toBe("DROPOUT")
    expect(progressionState({ decision: "NONE", enrollmentStatus: "ACTIVE" })).toBe("NO_DECISION")
    expect(progressionState({ decision: "REPEAT", enrollmentStatus: "COMPLETED" })).toBe("AWAITING")
    expect(progressionState({ decision: "UNCLASSIFIED" })).toBe("AWAITING")
})

test("counts per state", () => {
    const counts = countProgression([
        { state: "AWAITING", decision: "ADVANCE" }, { state: "AWAITING", decision: "REPEAT" }, { state: "ENROLLED", decision: "ADVANCE" },
    ])
    expect(counts).toEqual({ total: 3, NO_DECISION: 0, AWAITING: 2, ENROLLED: 1, DROPOUT: 0 })
})

test("next grade follows the option order, matching code or label; the last grade has none", () => {
    expect(nextGrade("S1", grades)).toBe("S2")
    expect(nextGrade("standard 2", grades)).toBe("S3")
    expect(nextGrade("S3", grades)).toBeUndefined()
    expect(nextGrade("unknown", grades)).toBeUndefined()
})

test("suggested grade: next when advancing, same when repeating, none otherwise", () => {
    expect(suggestedGrade("ADVANCE", "S1", grades)).toBe("S2")
    expect(suggestedGrade("REPEAT", "Standard 1", grades)).toBe("S1")
    expect(suggestedGrade("UNCLASSIFIED", "S1", grades)).toBeUndefined()
    expect(suggestedGrade("DROPOUT", "S1", grades)).toBeUndefined()
})

test("learners are grouped by decision and current grade, in grade order, each with its suggested grade", () => {
    const groups = promotionGroups([
        { learner: "A", decisionValue: "Pass", decision: "ADVANCE", currentGrade: "S2" },
        { learner: "B", decisionValue: "Repeat", decision: "REPEAT", currentGrade: "S1" },
        { learner: "C", decisionValue: "pass", decision: "ADVANCE", currentGrade: "S2" },
        { learner: "D", decisionValue: "Pass", decision: "ADVANCE", currentGrade: "S1" },
        { learner: "E", decisionValue: "Pass", decision: "ADVANCE", currentGrade: "S3" },
    ], grades)
    expect(groups.map((g) => [g.decisionValue, g.currentGrade, g.suggested, g.learners])).toEqual([
        ["Pass", "S1", "S2", ["D"]],
        ["Repeat", "S1", "S1", ["B"]],
        ["Pass", "S2", "S3", ["A", "C"]],
        ["Pass", "S3", undefined, ["E"]],
    ])
})

test("next academic year is the nearest later year among the options, whatever their order", () => {
    const years = [{ value: "2027/2028" }, { value: "2025/2026" }, { value: "2026/2027" }]
    expect(nextAcademicYear("2025/2026", years)).toBe("2026/2027")
    expect(nextAcademicYear("2024/2025", [{ value: "2026/2027" }])).toBe("2026/2027")
    expect(nextAcademicYear("2027/2028", years)).toBeUndefined()
    expect(nextAcademicYear(undefined, years)).toBeUndefined()
})
