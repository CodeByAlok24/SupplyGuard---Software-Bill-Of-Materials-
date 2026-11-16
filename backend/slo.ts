import { z } from "zod";

// Manual SLO registration and error-budget computation.
//
// All values are entered by humans ("Manual"). Nothing here is telemetry:
// no query is ever made to OTel/Prometheus/CloudWatch — those adapters do
// not exist yet, and `getSloProvider` returns null for them.
//
// Error budget formula (documented in docs/API.md):
//   budgetPercent      = 100 - target                (how much "bad" is allowed)
//   observedBadPercent = 100 - observedValue          (only when observedValue is set)
//   consumedPercent    = observedBadPercent / budgetPercent * 100
//   remainingPercent   = max(0, 100 - consumedPercent)
//   status             = "exhausted" when observedBadPercent >= budgetPercent, else "within"
//
// The observed value is assumed to be on the SAME scale as the target
// (e.g. availability as a percentage 0..100). Anything else is not supported.
// Missing or invalid observations produce status "not_calculable" — never a
// fabricated number. errorBudget is computed at read time, never stored.

export type SloErrorBudget = {
  budgetPercent: number;
  observedBadPercent: number | null;
  consumedPercent: number | null;
  remainingPercent: number | null;
  status: "within" | "exhausted" | "not_calculable";
  formula: string;
};

export const SLO_FORMULA = "budget = 100 − target; consumed = (100 − observed) / budget × 100; remaining = max(0, 100 − consumed)";

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function computeErrorBudget(target: number, observedValue: number | null | undefined): SloErrorBudget {
  const budgetPercent = round4(100 - target);
  if (observedValue === null || observedValue === undefined || !Number.isFinite(observedValue)) {
    return { budgetPercent, observedBadPercent: null, consumedPercent: null, remainingPercent: null, status: "not_calculable", formula: SLO_FORMULA };
  }
  const observedBadPercent = round4(100 - observedValue);
  if (budgetPercent <= 0) {
    // target = 100: zero budget. Any bad fraction exhausts it; zero bad leaves it intact.
    const consumedPercent = observedBadPercent > 0 ? Number.POSITIVE_INFINITY : 0;
    const remainingPercent = observedBadPercent > 0 ? 0 : 100;
    return { budgetPercent, observedBadPercent, consumedPercent: Number.isFinite(consumedPercent) ? consumedPercent : null, remainingPercent, status: observedBadPercent > 0 ? "exhausted" : "within", formula: SLO_FORMULA };
  }
  const consumedPercent = round4((observedBadPercent / budgetPercent) * 100);
  const remainingPercent = round4(Math.max(0, 100 - consumedPercent));
  return { budgetPercent, observedBadPercent, consumedPercent, remainingPercent, status: observedBadPercent >= budgetPercent ? "exhausted" : "within", formula: SLO_FORMULA };
}

const optionalTrimmed = (max: number, label: string) =>
  z.string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer.`)
    .nullable()
    .optional()
    .transform((value) => (value && value.trim() ? value.trim() : null));

const normalizeToken = (value: string) => value.trim().toLowerCase();

export const sloCreateSchema = z.object({
  service: z.string().trim().min(1, "Service is required.").max(100, "Service must be 100 characters or fewer.").transform(normalizeToken),
  environment: z.string().trim().min(1, "Environment is required.").max(50, "Environment must be 50 characters or fewer.").transform(normalizeToken),
  name: z.string().trim().min(1, "SLO name is required.").max(200, "SLO name must be 200 characters or fewer."),
  target: z.number().finite("Target must be finite.").gt(0, "Target must be greater than 0.").lte(100, "Target must be 100 or less (percentage scale)."),
  indicatorName: z.string().trim().min(1, "Indicator name is required.").max(200, "Indicator name must be 200 characters or fewer."),
  observedValue: z.number().finite("Observed value must be finite.").min(0, "Observed value must be between 0 and 100.").max(100, "Observed value must be between 0 and 100.").nullable().optional().transform((value) => value ?? null),
  windowDays: z.number().int("Measurement window must be whole days.").min(1, "Measurement window must be at least 1 day.").max(365, "Measurement window must be 365 days or fewer.").nullable().optional().transform((value) => value ?? null),
  observedAt: z.string().trim().nullable().optional()
    .transform((value, ctx) => {
      if (!value || !value.trim()) return null;
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        ctx.addIssue({ code: "custom", message: "Observation timestamp must be a valid date/time (ISO 8601)." });
        return z.NEVER;
      }
      return parsed;
    }),
  source: z.literal("MANUAL").optional().transform(() => "MANUAL" as const),
  note: optionalTrimmed(2000, "Note"),
}).strict().superRefine((value, ctx) => {
  if (value.observedValue !== null && value.windowDays === null) {
    ctx.addIssue({ code: "custom", message: "Set the measurement window (in days) when an observed value is recorded.", path: ["windowDays"] });
  }
  if (value.observedValue !== null && !value.observedAt) {
    ctx.addIssue({ code: "custom", message: "Set the observation timestamp when an observed value is recorded.", path: ["observedAt"] });
  }
  if (value.windowDays !== null && value.observedValue === null) {
    ctx.addIssue({ code: "custom", message: "A window is only meaningful with an observed value. Set the observed value or clear the window.", path: ["observedValue"] });
  }
});
export type SloCreateInput = z.infer<typeof sloCreateSchema>;

export const sloUpdateSchema = z.object({
  service: z.string().trim().min(1).max(100).transform(normalizeToken).optional(),
  environment: z.string().trim().min(1).max(50).transform(normalizeToken).optional(),
  name: z.string().trim().min(1).max(200).optional(),
  target: z.number().finite().gt(0, "Target must be greater than 0.").lte(100, "Target must be 100 or less.").optional(),
  indicatorName: z.string().trim().min(1).max(200).optional(),
  observedValue: z.number().finite().min(0).max(100).nullable().optional(),
  windowDays: z.number().int().min(1).max(365).nullable().optional(),
  observedAt: z.string().trim().nullable().optional()
    .transform((value, ctx) => {
      if (value === undefined) return undefined;
      if (!value || !value.trim()) return null;
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        ctx.addIssue({ code: "custom", message: "Observation timestamp must be a valid date/time (ISO 8601)." });
        return z.NEVER;
      }
      return parsed;
    }),
  source: z.literal("MANUAL").optional(),
  note: optionalTrimmed(2000, "Note").optional(),
}).strict();
export type SloUpdateInput = z.infer<typeof sloUpdateSchema>;

// Validate a merged (stored + update) record with the full rules. Used by PATCH
// so partial updates can't produce an inconsistent pair (e.g. observedValue
// without a window).
export function validateSloMerged(merged: unknown) {
  return sloCreateSchema.safeParse(merged);
}
