// Which targets the Tunnusluvut card shows when the period has more targets than rows.

/** The `rows` targets to show: the remembered picks that are in the period, filled up in name order. */
export function pickedGoals(remembered: string[], names: string[], rows: number): string[] {
  const out: string[] = [];
  for (const n of [...remembered, ...names]) if (names.includes(n) && !out.includes(n) && out.length < rows) out.push(n);
  return out;
}

/**
 * The rows after `name` is picked in row `i` of `shown` (what the card shows now). A target
 * already shown in another row swaps places with the one it replaces, so no row repeats.
 */
export function pickGoal(shown: string[], i: number, name: string): string[] {
  const next = [...shown];
  const j = shown.indexOf(name);
  if (j !== -1 && j !== i) next[j] = shown[i]!;
  next[i] = name;
  return next;
}
