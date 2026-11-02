export type LevelTier = 'STRONG' | 'GOOD' | 'AVERAGE' | 'FAIL'

type ScoreRange = { optionCode: string, minScore: number | string }

/**
 * How good a level is, from where its score range sits among the configured ranges: the highest
 * range is STRONG and the lowest FAIL. With four levels that is level 4 to level 1; with more or
 * fewer, the ranges are spread over the same four tiers.
 */
export function levelTier(optionCode: string | undefined, ranges: ScoreRange[]): LevelTier | undefined {
    if (!optionCode) return undefined
    const ordered = ranges
        .filter((range) => Number.isFinite(Number(range.minScore)))
        .sort((a, b) => Number(a.minScore) - Number(b.minScore))
    const index = ordered.findIndex((range) => String(range.optionCode).trim().toLowerCase() === String(optionCode).trim().toLowerCase())
    if (index < 0) return undefined
    if (ordered.length === 1) return 'STRONG'

    const position = index / (ordered.length - 1)
    if (position >= 0.75) return 'STRONG'
    if (position >= 0.5) return 'GOOD'
    if (position > 0) return 'AVERAGE'
    return 'FAIL'
}

/** What the level chip shows: the level's number ("Level 4 - Strong" -> "4"), else its code, else its name. */
export function shortLevel(label: string | undefined, optionCode?: string): string {
    const number = String(label ?? '').match(/\d+/)?.[0] ?? String(optionCode ?? '').match(/\d+/)?.[0]
    return number ?? optionCode ?? label ?? '-'
}
