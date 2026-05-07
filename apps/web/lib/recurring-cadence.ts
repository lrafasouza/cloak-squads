export type Cadence = "weekly" | "biweekly" | "monthly" | "quarterly";

const CADENCES: ReadonlySet<Cadence> = new Set(["weekly", "biweekly", "monthly", "quarterly"]);

export function isCadence(value: string): value is Cadence {
  return CADENCES.has(value as Cadence);
}

/**
 * Advance a date by one cadence period.
 *
 * Monthly/quarterly use Date arithmetic (not 30/90-day approximations) so the
 * 15th of every month stays on the 15th, even across February.
 */
export function advanceCadence(from: Date, cadence: Cadence): Date {
  const next = new Date(from);
  switch (cadence) {
    case "weekly":
      next.setUTCDate(next.getUTCDate() + 7);
      break;
    case "biweekly":
      next.setUTCDate(next.getUTCDate() + 14);
      break;
    case "monthly":
      next.setUTCMonth(next.getUTCMonth() + 1);
      break;
    case "quarterly":
      next.setUTCMonth(next.getUTCMonth() + 3);
      break;
  }
  return next;
}

export const CADENCE_LABELS: Record<Cadence, string> = {
  weekly: "Every week",
  biweekly: "Every 2 weeks",
  monthly: "Every month",
  quarterly: "Every quarter",
};
