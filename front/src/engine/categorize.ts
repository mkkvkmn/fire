// Categorisation (port of s_04_categorizer.py): rules apply in order, case-insensitive regex search
// on account, description and info, an amount sign check, and the last matching rule wins.
import type { AmountMatch, Rule, SourceRow } from "./types";

export interface Categorizable {
  account: string;
  description: string;
  info: string;
  amount: number;
}

export interface Category {
  ruleId: string;
  class: string;
  category: string;
  subCategory: string;
}

export class RuleError extends Error {
  constructor(
    readonly ruleId: string,
    message: string,
  ) {
    super(message);
  }
}

export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A rule draft that matches a row: its description as literal text and the sign of its amount. */
export function ruleFromRow(row: Categorizable, id: string): Rule {
  return {
    id,
    account: escapeRegex(row.account.trim()),
    description: escapeRegex(row.description.trim()),
    info: "",
    amount: row.amount > 0 ? "pos" : row.amount < 0 ? "neg" : "zero",
    class: "",
    category: "",
    subCategory: "",
  };
}

/** Next free numeric rule id. */
export function nextRuleId(rules: Rule[]): string {
  const max = rules.reduce((m, r) => (/^\d+$/.test(r.id) ? Math.max(m, Number(r.id)) : m), -1);
  return String(max + 1);
}

/** Empty, "*" and ".*" all mean "match everything", as validate_categories does. */
export function isMatchAll(pattern: string): boolean {
  const p = pattern.trim();
  return p === "" || p === "*" || p === ".*";
}

export function normalizeAmountMatch(value: string): AmountMatch {
  const v = value.trim().toLowerCase();
  return v === "pos" || v === "neg" || v === "zero" ? v : "any";
}

export interface CompiledRule {
  rule: Rule;
  account: RegExp | null;
  description: RegExp | null;
  info: RegExp | null;
}

function compilePattern(rule: Rule, field: "account" | "description" | "info"): RegExp | null {
  const p = rule[field];
  if (isMatchAll(p)) return null;
  try {
    return new RegExp(p, "i");
  } catch (e) {
    throw new RuleError(rule.id, `rule ${rule.id}: invalid ${field} pattern "${p}": ${(e as Error).message}`);
  }
}

export function compileRules(rules: Rule[]): CompiledRule[] {
  return rules.map((rule) => ({
    rule,
    account: compilePattern(rule, "account"),
    description: compilePattern(rule, "description"),
    info: compilePattern(rule, "info"),
  }));
}

function amountMatches(match: AmountMatch, amount: number): boolean {
  if (match === "pos") return amount > 0;
  if (match === "neg") return amount < 0;
  if (match === "zero") return amount === 0;
  return true;
}

export function ruleMatches(c: CompiledRule, row: Categorizable): boolean {
  return (
    (c.account === null || c.account.test(row.account)) &&
    (c.description === null || c.description.test(row.description)) &&
    (c.info === null || c.info.test(row.info)) &&
    amountMatches(c.rule.amount, row.amount)
  );
}

/** Category of one row from the last matching rule, or null when no rule matches. */
export function categorizeRow(compiled: CompiledRule[], row: Categorizable): Category | null {
  for (let i = compiled.length - 1; i >= 0; i--) {
    const c = compiled[i]!;
    if (ruleMatches(c, row)) {
      return { ruleId: c.rule.id, class: c.rule.class, category: c.rule.category, subCategory: c.rule.subCategory };
    }
  }
  return null;
}

/**
 * Per rule id, the transactions that rule decides (the last match wins). Rows without an amount
 * are not categorised, so no rule decides them. By transaction, not by a ledger row's ruleId:
 * a fix puts its own id there.
 */
export function decidedTransactions(compiled: CompiledRule[], rows: readonly SourceRow[]): Map<string, Set<string>> {
  const byRule = new Map<string, Set<string>>();
  for (const r of rows) {
    if (r.fields.amount === null) continue;
    const cat = categorizeRow(compiled, {
      account: r.fields.account,
      description: r.fields.description,
      info: r.fields.info,
      amount: r.fields.amount,
    });
    if (!cat) continue;
    let set = byRule.get(cat.ruleId);
    if (!set) byRule.set(cat.ruleId, (set = new Set()));
    set.add(r.txId);
  }
  return byRule;
}

/** Ids of every rule that matches a row, in order; the last one is the one that applies. */
export function matchingRules(compiled: CompiledRule[], row: Categorizable): string[] {
  return compiled.filter((c) => ruleMatches(c, row)).map((c) => c.rule.id);
}
