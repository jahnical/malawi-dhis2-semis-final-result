import { CheckCircleOutline, HighlightOff, TrendingDown, HelpOutline } from "@mui/icons-material";
import styles from "./status.module.css";

function getStatusStyle(label: string) {
    const key = (label || "").toLowerCase();
    const matched = ["promoted", "completed", "failed", "dropout"].find((statusKey) => key.includes(statusKey));

    if (matched === "promoted" || matched === "completed") {
        return {
            variantClass: styles.promoted,
            icon: <CheckCircleOutline className={styles.icon} />,
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

export function statusComponent({ option }: { option: { style: { color: string }, label: string, value: string } }) {
    const statusStyle = getStatusStyle(option?.label);

    return (
        <span className={`${styles.badge} ${statusStyle.variantClass}`}>
            {statusStyle.icon}
            {option?.label}
        </span>
    );
}