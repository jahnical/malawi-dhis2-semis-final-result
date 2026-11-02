import { CheckCircleOutline, HighlightOff, TrendingDown, TrendingUp, HelpOutline, Replay, HourglassEmpty, RemoveCircleOutline } from "@mui/icons-material";
import i18next from "@dhis2/d2-i18n";
import { Tooltip } from "@mui/material";
import styles from "./status.module.css";
import type { DecisionKind, NextYearEnrollment, ProgressionState } from "../../utils/progression/progression";
import type { LevelTier } from "../../utils/level/levelTier";

// The decision badge never shows a check mark: a decision is not an enrollment. The check belongs
// to the next-year badge, once the learner is enrolled in the next year.
function getStatusStyle(label: string) {
    const key = (label || "").toLowerCase();
    if (/not\s+promot/.test(key)) return { variantClass: styles.repeat, icon: <Replay className={styles.icon} /> };
    const matched = ["promot", "pass", "completed", "repeat", "failed", "dropout"].find((statusKey) => key.includes(statusKey));

    if (matched === "promot" || matched === "pass" || matched === "completed") {
        return {
            variantClass: styles.promoted,
            icon: <TrendingUp className={styles.icon} />,
        };
    }

    if (matched === "repeat") {
        return {
            variantClass: styles.repeat,
            icon: <Replay className={styles.icon} />,
        };
    }

    if (matched === "failed") {
        return {
            variantClass: styles.failed,
            icon: <HighlightOff className={styles.icon} />,
        };
    }

    if (matched === "dropout") {
        return {
            variantClass: styles.dropout,
            icon: <TrendingDown className={styles.icon} />,
        };
    }

    return {
        variantClass: styles.unknown,
        icon: <HelpOutline className={styles.icon} />,
    };
}

export function statusComponent({ option, tooltip }: { option: { style: { color: string }, label: string, value: string }, tooltip?: string }) {
    const statusStyle = getStatusStyle(option?.label);
    const badge = (
        <span className={`${styles.badge} ${statusStyle.variantClass}`}>
            {statusStyle.icon}
            {option?.label}
        </span>
    );

    return tooltip ? <Tooltip title={tooltip} arrow>{badge}</Tooltip> : badge;
}

// A decision to promote or repeat reads as still to happen until the learner is enrolled in the next
// year: the option set says "Promoted" or "Failed", but recording it moves nobody. Short words keep the
// column narrow; the tooltip says it in full.
export function decisionLabel({ label, decision, enrolled }: { label?: string, decision: DecisionKind, enrolled: boolean }) {
    if (decision === 'ADVANCE') return enrolled ? i18next.t("Promoted") : i18next.t("Promote")
    if (decision === 'REPEAT') return enrolled ? i18next.t("Repeated") : i18next.t("Repeat")
    return label
}

export function decisionTooltip({ decision, enrolled }: { decision: DecisionKind, enrolled: boolean }) {
    if (decision !== 'ADVANCE' && decision !== 'REPEAT') return undefined
    if (enrolled) return i18next.t("Enrolled in next year")
    return decision === 'ADVANCE'
        ? i18next.t("To be promoted: not enrolled in next year yet")
        : i18next.t("To repeat the grade: not enrolled in next year yet")
}

export function nextYearStatusLabel(state: ProgressionState | undefined, nextYear?: NextYearEnrollment, labels: { year?: string, grade?: string } = {}) {
    switch (state) {
        case 'ENROLLED': {
            const details = [labels.year ?? nextYear?.academicYear, labels.grade ?? nextYear?.grade].filter(Boolean).join(", ")
            return details ? `${i18next.t("Enrolled")}: ${details}` : i18next.t("Enrolled")
        }
        case 'AWAITING': return i18next.t("Awaiting enrollment")
        case 'DROPOUT': return i18next.t("Not continuing")
        case 'NO_DECISION': return i18next.t("No decision yet")
        default: return i18next.t("Loading…")
    }
}

// Mostly icons: a check with the new grade once enrolled, an hourglass while waiting. The full status is in the tooltip.
export function nextYearStatusComponent({ state, nextYear, labels }: { state?: ProgressionState, nextYear?: NextYearEnrollment, labels?: { year?: string, grade?: string } }) {
    const title = nextYearStatusLabel(state, nextYear, labels)
    const content = {
        ENROLLED: <span className={`${styles.badge} ${styles.plain} ${styles.promoted}`}><CheckCircleOutline className={styles.icon} />{labels?.grade ?? nextYear?.grade ?? i18next.t("Enrolled")}</span>,
        AWAITING: <span className={`${styles.badge} ${styles.iconOnly} ${styles.awaiting}`} aria-label={title}><HourglassEmpty className={styles.icon} /></span>,
        DROPOUT: <span className={`${styles.badge} ${styles.iconOnly} ${styles.dropout}`} aria-label={title}><RemoveCircleOutline className={styles.icon} /></span>,
        NO_DECISION: <span className={styles.muted} aria-label={title}>–</span>,
    }[state as ProgressionState] ?? <span className={styles.muted}>…</span>

    return <Tooltip title={title} arrow><span>{content}</span></Tooltip>
}

// Learner level as a coloured chip with its number, from strong (top level) to fail (lowest), so the
// spread of a class shows at a glance; the level's full name is in the tooltip
export function levelComponent({ label, short, tier }: { label: string, short: string, tier?: LevelTier }) {
    const variantClass = {
        STRONG: styles.levelStrong,
        GOOD: styles.levelGood,
        AVERAGE: styles.levelAverage,
        FAIL: styles.levelFail,
    }[tier as LevelTier] ?? styles.unknown

    return (
        <Tooltip title={label} arrow>
            <span className={`${styles.badge} ${styles.plain} ${styles.level} ${variantClass}`} aria-label={label}>
                {short}
            </span>
        </Tooltip>
    );
}
