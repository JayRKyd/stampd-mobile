const LABELS: Record<string, { singular: string; plural: string }> = {
  stamp: { singular: 'stamp', plural: 'stamps' },
  visit: { singular: 'visit', plural: 'visits' },
  purchase: { singular: 'purchase', plural: 'purchases' },
  appointment: { singular: 'appointment', plural: 'appointments' },
};

/** Human-readable visit/stamp label matching the merchant card setting. */
export function visitLabelWord(label: string | null | undefined, count: number): string {
  const key = (label ?? 'stamp').toLowerCase();
  // Sibilant endings take "es" (class → classes, wash → washes), not "s"
  const entry = LABELS[key] ?? {
    singular: key,
    plural: /(s|sh|ch|x|z)$/.test(key) ? `${key}es` : `${key}s`,
  };
  return count === 1 ? entry.singular : entry.plural;
}
