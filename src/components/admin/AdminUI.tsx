import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import styles from "./admin.module.css";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className={styles.pageHeader}>
      <div>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h1 className={styles.pageTitle}>{title}</h1>
        <p className={styles.pageSubtitle}>{description}</p>
      </div>
      {actions && <div className={styles.headerActions}>{actions}</div>}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  change,
  context,
  trend = "up",
  icon: Icon,
}: {
  label: string;
  value: string;
  change: string;
  context: string;
  trend?: "up" | "down" | "neutral";
  icon: LucideIcon;
}) {
  const TrendIcon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus;
  return (
    <article className={styles.metricCard}>
      <div className={styles.metricTop}>
        <span className={styles.metricLabel}>{label}</span>
        <span className={styles.metricIcon}><Icon size={16} /></span>
      </div>
      <p className={styles.metricValue}>{value}</p>
      <div className={styles.metricFoot}>
        <span className={trend === "up" ? styles.trendUp : trend === "down" ? styles.trendDown : styles.trendNeutral}>
          <TrendIcon size={11} /> {change}
        </span>
        <span>{context}</span>
      </div>
    </article>
  );
}

export function StatusBadge({ children, tone = "muted" }: { children: ReactNode; tone?: "success" | "info" | "warning" | "violet" | "danger" | "muted" }) {
  const toneClass = {
    success: styles.badgeSuccess,
    info: styles.badgeInfo,
    warning: styles.badgeWarning,
    violet: styles.badgeViolet,
    danger: styles.badgeDanger,
    muted: styles.badgeMuted,
  }[tone];
  return <span className={`${styles.badge} ${toneClass}`}>{children}</span>;
}

export function statusTone(value: string): "success" | "info" | "warning" | "violet" | "danger" | "muted" {
  if (["Paid", "Active", "Live", "Published", "Ready to ship", "Shipped"].includes(value)) return "success";
  if (["Artwork review", "New"].includes(value)) return "info";
  if (["Pending", "Low stock", "Quality check"].includes(value)) return "warning";
  if (["In production", "Scheduled", "Repeat"].includes(value)) return "violet";
  if (["Refunded", "At risk"].includes(value)) return "danger";
  return "muted";
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`${styles.card} ${className}`}>{children}</section>;
}

export function CardHeader({ title, caption, action }: { title: string; caption?: string; action?: ReactNode }) {
  return (
    <div className={styles.cardHeader}>
      <div>
        <h2 className={styles.cardTitle}>{title}</h2>
        {caption && <p className={styles.cardCaption}>{caption}</p>}
      </div>
      {action}
    </div>
  );
}
