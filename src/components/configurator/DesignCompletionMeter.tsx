import { Check } from "lucide-react";

import type { DesignCompletion } from "./design-completion";
import styles from "./configurator.module.css";

export function DesignCompletionMeter({
  completion,
  placement = "preview",
}: {
  completion: DesignCompletion;
  placement?: "preview" | "editor";
}) {
  if (!completion.total) return null;

  const status = completion.isReady ? "Design ready" : "Design progress";
  const valueText = `${completion.completed} of ${completion.total} design steps complete`;

  return (
    <div
      className={`${styles.designCompletion} ${placement === "editor" ? styles.editorCompletion : styles.previewCompletion} ${completion.isReady ? styles.completionReady : ""}`}
      aria-label="Design readiness"
    >
      <div className={styles.completionScore} aria-live="polite">
        <span>{status}</span>
        <strong>{completion.percentage}%</strong>
      </div>
      <div
        className={styles.completionTrack}
        role="progressbar"
        aria-label="Design completion"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={completion.percentage}
        aria-valuetext={valueText}
      >
        <span style={{ width: `${completion.percentage}%` }} />
      </div>
      <small className={styles.completionPreflight}>
        {completion.isReady ? "You’re ready to order" : "Production preflight is separate."}
      </small>
      <ul className={styles.completionChecklist} aria-label="Design checklist">
        {completion.steps.map((step) => (
          <li key={step.id} className={step.complete ? styles.completionStepComplete : undefined}>
            <span className={styles.completionStepMarker} aria-hidden="true">
              {step.complete && <Check />}
            </span>
            {step.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
