import { Button, ButtonStrip, CircularLoader, NoticeBox } from "@dhis2/ui";
import i18next from "@dhis2/d2-i18n";
import { Tooltip } from "@mui/material";
import { CheckCircleOutline, HourglassEmpty, InfoOutlined, RemoveCircleOutline, HelpOutline } from "@mui/icons-material";
import styles from "./progressionBanner.module.css";
import type { ProgressionCounts, ProgressionState } from "../../utils/progression/progression";

// Bar segments, in the order a class moves through them
const SEGMENTS: { state: ProgressionState, className: string, icon: JSX.Element, label: () => string }[] = [
    { state: 'ENROLLED', className: styles.enrolled, icon: <CheckCircleOutline />, label: () => i18next.t("Enrolled in next year") },
    { state: 'AWAITING', className: styles.awaiting, icon: <HourglassEmpty />, label: () => i18next.t("Awaiting enrollment") },
    { state: 'DROPOUT', className: styles.dropout, icon: <RemoveCircleOutline />, label: () => i18next.t("Not continuing") },
    { state: 'NO_DECISION', className: styles.noDecision, icon: <HelpOutline />, label: () => i18next.t("No decision yet") },
]

/**
 * Where the list stands, across all pages, as one bar: enrolled in next year, awaiting enrollment,
 * not continuing and no decision yet. Recording a decision does not enroll anyone, so the waiting
 * part stays visible until they are enrolled. Words are in the tooltips.
 */
export default function ProgressionBanner({ counts, loading, error, onRetry, awaitingOnPage, onSelectAwaiting, justSaved, onEnrollJustSaved, onDismissJustSaved, busy }: {
    counts?: ProgressionCounts
    loading: boolean
    error: boolean
    onRetry: () => void
    // Learners awaiting enrollment among the rows shown now (selection is per page)
    awaitingOnPage: number
    onSelectAwaiting: () => void
    // Learners whose decision was just saved; awaiting is unknown until their status has reloaded
    justSaved?: { count: number, awaiting?: number }
    onEnrollJustSaved: () => void
    onDismissJustSaved: () => void
    // The table or the counts are reloading; acting now would use stale rows
    busy: boolean
}) {
    return (
        <div className={styles.container}>
            {justSaved && (
                <NoticeBox warning title={justSaved.awaiting === 0
                    ? i18next.t("Decisions saved for {{count}} learners. None needs a next-year enrollment.", { count: justSaved.count })
                    : i18next.t("Decisions saved for {{count}} learners. They are not enrolled in next year yet.", { count: justSaved.count })}>
                    <ButtonStrip>
                        {justSaved.awaiting === undefined
                            ? <Button small primary disabled icon={<CircularLoader extrasmall />}>{i18next.t("Enroll in next year")}</Button>
                            : justSaved.awaiting > 0 && (
                                <Button small primary disabled={busy} onClick={onEnrollJustSaved}>
                                    {i18next.t("Enroll {{count}} in next year", { count: justSaved.awaiting })}
                                </Button>
                            )}
                        <Button small secondary onClick={onDismissJustSaved}>{i18next.t("Dismiss")}</Button>
                    </ButtonStrip>
                </NoticeBox>
            )}

            <div className={styles.summary}>
                {error ? (
                    <>
                        <span>{i18next.t("Could not count next-year enrollments.")}</span>
                        <Button small secondary onClick={onRetry}>{i18next.t("Retry")}</Button>
                    </>
                ) : !counts ? (
                    loading && <><CircularLoader extrasmall /><span>{i18next.t("Counting next-year enrollments…")}</span></>
                ) : (
                    <>
                        <Tooltip arrow title={i18next.t("Next year: {{enrolled}} of {{total}} learners enrolled", { enrolled: counts.ENROLLED, total: counts.total })}>
                            <div className={styles.bar} role="img" aria-label={i18next.t("Next year: {{enrolled}} of {{total}} learners enrolled", { enrolled: counts.ENROLLED, total: counts.total })}>
                                {counts.total > 0 && SEGMENTS.map(({ state, className }) => counts[state] > 0 && (
                                    <span key={state} className={`${styles.segment} ${className}`} style={{ flexGrow: counts[state] }} />
                                ))}
                            </div>
                        </Tooltip>
                        <div className={styles.legend}>
                            {SEGMENTS.map(({ state, className, icon, label }) => (counts[state] > 0 || state === 'AWAITING' || state === 'ENROLLED') && (
                                <Tooltip key={state} arrow title={label()}>
                                    <span className={`${styles.count} ${className}`} aria-label={`${label()}: ${counts[state]}`}>
                                        {icon}<strong>{counts[state]}</strong>
                                    </span>
                                </Tooltip>
                            ))}
                            <span className={styles.total}>/ {counts.total}</span>
                            {loading && <CircularLoader extrasmall />}
                            {counts.AWAITING > 0 && (
                                <Tooltip arrow title={i18next.t("A final decision does not enroll a learner in next year. Select the learners and use “Enroll in next year”.")}>
                                    <InfoOutlined className={styles.info} />
                                </Tooltip>
                            )}
                        </div>
                        {awaitingOnPage > 0 && (
                            <Button small disabled={busy} onClick={onSelectAwaiting} icon={<HourglassEmpty fontSize="small" />}>
                                {i18next.t("Select {{count}} on this page", { count: awaitingOnPage })}
                            </Button>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}
