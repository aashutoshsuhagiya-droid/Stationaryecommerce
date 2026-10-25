export type DesignCompletionStepId = "name" | "theme" | "size" | "preview";

export type DesignCompletionInput = Partial<Record<DesignCompletionStepId, boolean>>;

export interface DesignCompletionStep {
  id: DesignCompletionStepId;
  label: "Name" | "Theme" | "Size" | "Preview";
  complete: boolean;
}

export interface DesignCompletion {
  steps: DesignCompletionStep[];
  completed: number;
  total: number;
  percentage: number;
  isReady: boolean;
}

const STEP_DEFINITIONS: ReadonlyArray<Pick<DesignCompletionStep, "id" | "label">> = [
  { id: "name", label: "Name" },
  { id: "theme", label: "Theme" },
  { id: "size", label: "Size" },
  { id: "preview", label: "Preview" },
];

export function calculateDesignCompletion(input: DesignCompletionInput): DesignCompletion {
  const steps: DesignCompletionStep[] = [];

  for (const definition of STEP_DEFINITIONS) {
    const complete = input[definition.id];
    if (typeof complete === "boolean") {
      steps.push({ ...definition, complete });
    }
  }

  const completed = steps.filter((step) => step.complete).length;
  const total = steps.length;

  return {
    steps,
    completed,
    total,
    percentage: total ? Math.round((completed / total) * 100) : 0,
    isReady: total > 0 && completed === total,
  };
}
