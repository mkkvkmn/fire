// The settings draft and what it is checked against: tabs, list columns, the draft of every list,
// owner renames, and the checks before saving. No DOM.
import { compileRules } from "../../engine/categorize";
import type { AmountMatch, Fix, Rule, Split, Target } from "../../engine/types";
import { lockedFixChanges, type SettingsDraft } from "../../project/service";
import type { Project } from "../../storage/project";
import { CLASSES as CLASS_KEYS, CLASS_LABEL } from "../../ui/classification";
import { parseNumber } from "../../ui/numberField";
import { fmt, t, type TextKey } from "../../ui/texts";

export { parseNumber };

export type Tab = "rules" | "splits" | "fixes" | "targets" | "profiles" | "scripts";
export const TABS: [Tab, TextKey][] = [
  ["rules", "tabRules"],
  ["fixes", "tabFixes"],
  ["targets", "tabTargets"],
  ["splits", "tabSplits"],
  ["profiles", "tabProfiles"],
  ["scripts", "tabScripts"],
];
export type ListTab = "rules" | "splits" | "fixes" | "targets";

export type Kind = "text" | "number" | "date" | "class" | "amountMatch";
export interface Col {
  key: string;
  label: TextKey;
  kind: Kind;
  /** Empty input removes the field (fixes: unset means "keep the value"). */
  optional?: boolean;
  /** The field gets a list of choices (see choices()). */
  list?: string;
}

export const CLASSES: [string, TextKey][] = CLASS_KEYS.map((c) => [c, CLASS_LABEL[c]!]);
export const AMOUNT_MATCH: [AmountMatch, TextKey][] = [
  ["any", "amountAnyShort"],
  ["pos", "amountPosShort"],
  ["neg", "amountNegShort"],
  ["zero", "amountZeroShort"],
];

export const COLS: Record<ListTab, Col[]> = {
  rules: [
    { key: "account", label: "colAccount", kind: "text" },
    { key: "description", label: "colDescription", kind: "text" },
    { key: "info", label: "colInfo", kind: "text" },
    { key: "amount", label: "fieldAmountMatch", kind: "amountMatch" },
    { key: "class", label: "fieldClass", kind: "class" },
    { key: "category", label: "fieldCategory", kind: "text", list: "dl-cats" },
    { key: "subCategory", label: "fieldSubCategory", kind: "text", list: "dl-subs" },
  ],
  splits: [
    { key: "account", label: "colAccount", kind: "text", list: "dl-accounts" },
    { key: "start", label: "colStart", kind: "date" },
    { key: "end", label: "colEnd", kind: "date" },
    { key: "share", label: "colShare", kind: "number" },
    { key: "owner", label: "colOwner", kind: "text", list: "dl-owners" },
  ],
  fixes: [
    { key: "owner", label: "colOwner", kind: "text", optional: true, list: "dl-owners" },
    { key: "date", label: "colDate", kind: "date", optional: true },
    { key: "description", label: "colDescription", kind: "text", optional: true },
    { key: "info", label: "colInfo", kind: "text", optional: true },
    { key: "amount", label: "colAmount", kind: "number", optional: true },
    { key: "class", label: "fieldClass", kind: "class", optional: true },
    { key: "category", label: "fieldCategory", kind: "text", optional: true, list: "dl-cats" },
    { key: "subCategory", label: "fieldSubCategory", kind: "text", optional: true, list: "dl-subs" },
  ],
  targets: [
    { key: "name", label: "colName", kind: "text" },
    { key: "start", label: "colStart", kind: "date" },
    { key: "end", label: "colEnd", kind: "date" },
    { key: "owner", label: "colOwner", kind: "text", list: "dl-owners" },
    { key: "monthlyAmount", label: "colMonthly", kind: "number" },
    { key: "class", label: "fieldClass", kind: "class" },
    { key: "category", label: "fieldCategory", kind: "text", list: "dl-cats" },
    { key: "subCategory", label: "fieldSubCategory", kind: "text", list: "dl-subs" },
  ],
};

export const MAX_RULE_ROWS = 20;
export const MAX_SEARCH = 20;
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type Item = Record<string, unknown>;

export interface Draft {
  revision: number;
  rules: Rule[];
  splits: Split[];
  fixes: Fix[];
  targets: Target[];
  defaultOwner: string;
  /** Owner of each account's rows that no split covers. */
  accountOwners: Record<string, string>;
  /** Owner renames: old name -> new name. */
  renames: Record<string, string>;
}

export function nextNumericId(ids: string[]): string {
  return String(ids.reduce((m, id) => (/^\d+$/.test(id) ? Math.max(m, Number(id)) : m), 0) + 1);
}

/** Applies owner renames to a draft's lists and default owner. */
export function withRenames(d: Draft): SettingsDraft {
  const rn = (o: string) => (d.renames[o]?.trim() ? d.renames[o]!.trim() : o);
  return {
    rules: d.rules,
    splits: d.splits.map((s) => ({ ...s, owner: rn(s.owner) })),
    fixes: d.fixes.map((f) => (f.owner === undefined ? f : { ...f, owner: rn(f.owner) })),
    targets: d.targets.map((x) => ({ ...x, owner: rn(x.owner) })),
    defaultOwner: rn(d.defaultOwner.trim()),
    accountOwners: Object.fromEntries(Object.entries(d.accountOwners).map(([a, o]) => [a, rn(o)])),
  };
}

/** What a combo adds when the typed value is new. */
export const NOUN: Record<string, TextKey> = { category: "nounMain", subCategory: "nounSub", account: "nounAccount", owner: "nounOwner" };

/** Checks the draft before preview; returns an error message or "". */
export function validate(p: Project, d: Draft): string {
  try {
    compileRules(d.rules);
  } catch (e) {
    return fmt("ruleInvalid", { e: e instanceof Error ? e.message : String(e) });
  }
  const noClass = d.rules.find((r) => !r.class);
  if (noClass) return fmt("needClassRule", { id: noClass.id });
  for (const s of d.splits) {
    if (!ISO_DATE.test(s.start) || !ISO_DATE.test(s.end)) return t("badDate");
    if (!Number.isFinite(s.share) || s.share < 0 || s.share > 1) return t("badShare");
    if (!s.owner.trim()) return t("needOwner");
  }
  for (const x of d.targets) {
    if (!ISO_DATE.test(x.start) || !ISO_DATE.test(x.end)) return t("badDate");
    if (!Number.isFinite(x.monthlyAmount)) return t("badNumber");
    if (!x.name.trim()) return t("needName");
    if (!x.class) return fmt("needClassTarget", { name: x.name });
  }
  for (const f of d.fixes) {
    if (f.date !== undefined && !ISO_DATE.test(f.date)) return t("badDate");
    if (f.amount !== undefined && !Number.isFinite(f.amount)) return t("badNumber");
  }
  if (!withRenames(d).defaultOwner) return t("needOwner");
  const locked = lockedFixChanges(p, withRenames(d).fixes ?? []);
  if (locked.length > 0) return fmt("fixLocked", { ids: locked.join(", "), m: p.getSettings().lockedThrough });
  return "";
}
