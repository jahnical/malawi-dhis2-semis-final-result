import { academicYearOf, academicYearOrder, type ExistingEnrollment, type YearContext } from "dhis2-semis-functions";

/**
 * Where a learner stands between recording a final decision and being enrolled in the next year.
 * Recording a decision closes the year; only "Enroll in next year" creates the next enrollment,
 * so the two are tracked apart.
 */

// What the decision asks for: the next grade, the same grade, leaving school, or not configured enough to tell
export type DecisionKind = 'NONE' | 'ADVANCE' | 'REPEAT' | 'DROPOUT' | 'UNCLASSIFIED'

export type ProgressionState = 'NO_DECISION' | 'AWAITING' | 'ENROLLED' | 'DROPOUT'

export interface NextYearEnrollment {
    enrollment: string
    academicYear?: string
    grade?: string
}

export interface Progression {
    state: ProgressionState
    decision: DecisionKind
    decisionValue?: string
    nextYear?: NextYearEnrollment
}

const normalize = (value: unknown) => String(value ?? '').trim().toLowerCase()
const includes = (list: string[] = [], value: unknown) => list.some((item) => normalize(item) === normalize(value))

// Names that mean the learner stays in the grade ("Failed", "Repeat", "Not promoted") or moves up ("Promoted", "Pass")
const REPEAT_NAME = /fail|repeat|not\s+promot/i
const ADVANCE_NAME = /promot|pass/i

/**
 * Dropout statuses leave school and promotable statuses (validStatusValue) go to the next grade.
 * Without promotable statuses configured, the code or name tells ("Promoted", "Pass"). A decision
 * named like "Failed" or "Repeat" stays in the grade. Anything else (e.g. "Completed" after the last
 * grade) is UNCLASSIFIED: the grade is chosen by hand.
 */
export function classifyDecision(value: unknown, { validStatusValues = [], dropoutStatusValues = [], label }: { validStatusValues?: string[], dropoutStatusValues?: string[], label?: string }): DecisionKind {
    if (normalize(value) === '') return 'NONE'
    if (includes(dropoutStatusValues, value)) return 'DROPOUT'
    if (includes(validStatusValues, value)) return 'ADVANCE'
    const names = `${value ?? ''} ${label ?? ''}`
    if (REPEAT_NAME.test(names)) return 'REPEAT'
    if (validStatusValues.length === 0 && ADVANCE_NAME.test(names)) return 'ADVANCE'
    return 'UNCLASSIFIED'
}

/** The decision recorded on an enrollment's final-result event. */
export function decisionOf(enrollment: ExistingEnrollment | undefined, finalResultStage: string, statusDataElement: string) {
    const event = (enrollment?.events ?? []).find((e) => e.programStage === finalResultStage && !e.deleted)
    return event?.dataValues?.find((dv) => dv.dataElement === statusDataElement)?.value ?? undefined
}

/** The learner's enrollment in a later academic year than `enrollmentId`'s, if any (the earliest such). */
export function nextYearEnrollment({ enrollments, enrollmentId, registrationStage, academicYearDataElement, gradeDataElement, years }: {
    enrollments: ExistingEnrollment[]
    enrollmentId: string
    registrationStage: string
    academicYearDataElement: string
    gradeDataElement?: string
    years?: YearContext
}): NextYearEnrollment | undefined {
    const live = enrollments.filter((e) => !e.deleted)
    const current = live.find((e) => e.enrollment === enrollmentId)
    const currentYear = current ? academicYearOrder(academicYearOf(current, registrationStage, academicYearDataElement), years) : undefined
    if (currentYear === undefined) return undefined

    const later = live
        .filter((e) => e.enrollment !== enrollmentId)
        .map((e) => ({ e, code: academicYearOf(e, registrationStage, academicYearDataElement) }))
        .map(({ e, code }) => ({ e, code, order: academicYearOrder(code, years) }))
        .filter(({ order }) => order !== undefined && order > currentYear)
        .sort((a, b) => (a.order as number) - (b.order as number))[0]
    if (!later) return undefined

    const registration = (later.e.events ?? []).find((ev) => ev.programStage === registrationStage && !ev.deleted)
    const grade = gradeDataElement ? registration?.dataValues?.find((dv) => dv.dataElement === gradeDataElement)?.value ?? undefined : undefined
    return { enrollment: later.e.enrollment, academicYear: later.code ?? undefined, grade }
}

/**
 * A later enrollment wins over everything else: whatever the decision says, the learner has moved on.
 * A cancelled enrollment is a dropout even when the decision was recorded some other way (e.g. bulk import).
 */
export function progressionState({ decision, enrollmentStatus, nextYear }: { decision: DecisionKind, enrollmentStatus?: string, nextYear?: NextYearEnrollment }): ProgressionState {
    if (nextYear) return 'ENROLLED'
    if (decision === 'DROPOUT' || enrollmentStatus === 'CANCELLED') return 'DROPOUT'
    if (decision === 'NONE') return 'NO_DECISION'
    return 'AWAITING'
}

export type ProgressionCounts = Record<ProgressionState, number> & { total: number }

export function countProgression(progressions: Iterable<Progression>): ProgressionCounts {
    const counts: ProgressionCounts = { total: 0, NO_DECISION: 0, AWAITING: 0, ENROLLED: 0, DROPOUT: 0 }
    for (const { state } of progressions) {
        counts.total++
        counts[state]++
    }
    return counts
}

export interface GradeOption { value: string, label?: string }

/** The option after `current` in the grade option set (options come in their sort order); undefined for the last grade. */
export function nextGrade(current: unknown, options: GradeOption[]): string | undefined {
    const index = options.findIndex((option) => normalize(option.value) === normalize(current) || normalize(option.label) === normalize(current))
    if (index < 0) return undefined
    return options[index + 1]?.value
}

/** Grade for the new year: the next one when advancing, the same one when repeating, otherwise unknown. */
export function suggestedGrade(decision: DecisionKind, current: unknown, options: GradeOption[]): string | undefined {
    if (decision === 'ADVANCE') return nextGrade(current, options)
    if (decision === 'REPEAT') {
        const option = options.find((o) => normalize(o.value) === normalize(current) || normalize(o.label) === normalize(current))
        return option?.value
    }
    return undefined
}

/** Options of a program stage data element, in their sort order, from the program configuration. */
export function dataElementOptions(programConfig: any, dataElement: string | undefined): GradeOption[] {
    if (!dataElement) return []
    return ((programConfig?.programStages ?? [])
        .flatMap((stage: any) => stage?.programStageDataElements ?? [])
        .find((item: any) => item?.dataElement?.id === dataElement)
        ?.dataElement?.optionSet?.options ?? [])
        .filter((option: any) => option?.value !== undefined && option?.value !== null)
        .map((option: any) => ({ value: String(option.value), label: option?.label ?? String(option.value) }))
}

/** Label of an option value, or the value itself when the option set doesn't have it. */
export function optionLabel(options: GradeOption[], value: unknown): string | undefined {
    if (value === undefined || value === null || value === '') return undefined
    return options.find((option) => normalize(option.value) === normalize(value))?.label ?? String(value)
}

export interface PromotionGroup<T> {
    key: string
    decisionValue?: string
    decision: DecisionKind
    currentGrade?: string
    // The grade the decision leads to; undefined when it can't be worked out (last grade, unclassified)
    suggested?: string
    learners: T[]
}

/** Learners with the same decision and current grade go to the same grade, so they are set together. */
export function promotionGroups<T>(learners: { learner: T, decisionValue?: string, decision: DecisionKind, currentGrade?: string }[], options: GradeOption[]): PromotionGroup<T>[] {
    const groups = new Map<string, PromotionGroup<T>>()
    for (const { learner, decisionValue, decision, currentGrade } of learners) {
        const key = `${normalize(decisionValue)}|${normalize(currentGrade)}`
        if (!groups.has(key)) {
            groups.set(key, { key, decisionValue, decision, currentGrade, suggested: suggestedGrade(decision, currentGrade, options), learners: [] })
        }
        groups.get(key)!.learners.push(learner)
    }
    const gradeIndex = (grade: unknown) => {
        const index = options.findIndex((o) => normalize(o.value) === normalize(grade) || normalize(o.label) === normalize(grade))
        return index < 0 ? options.length : index
    }
    return Array.from(groups.values())
        .sort((a, b) => gradeIndex(a.currentGrade) - gradeIndex(b.currentGrade) || normalize(a.decisionValue).localeCompare(normalize(b.decisionValue)))
}

/**
 * The academic year after `current` among `options` (e.g. the years in the school calendar): the
 * nearest later one, so a gap in the calendar still finds the next year on record.
 */
export function nextAcademicYear(current: unknown, options: GradeOption[], years?: YearContext): string | undefined {
    const currentOrder = academicYearOrder(current, years)
    if (currentOrder === undefined) return undefined
    return options
        .map((option) => ({ value: option.value, order: academicYearOrder(option.value, years) ?? academicYearOrder(option.label, years) }))
        .filter(({ order }) => order !== undefined && order > currentOrder)
        .sort((a, b) => (a.order as number) - (b.order as number))[0]?.value
}
