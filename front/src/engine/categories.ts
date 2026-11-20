// The project's category list: the categories of each class and the subcategories of each category,
// so the combos offer a name before any row uses it. Pure; names compare without case.

/** One category of the list: its class, its name and its subcategories. */
export interface CategoryEntry {
  class: string;
  category: string;
  subCategories: string[];
}

/**
 * A place in the classification. As a node of the list: a category (`subCategory` "") or a
 * subcategory. As a row's classification: its class, category and subcategory.
 */
export interface CategoryPath {
  class: string;
  category: string;
  subCategory: string;
}

const lc = (s: string) => s.trim().toLowerCase();

/** True when the row lies in the node: the same class and category, and the subcategory when the node has one. */
export function inNode(row: CategoryPath, node: CategoryPath): boolean {
  return (
    lc(row.class) === lc(node.class) &&
    lc(row.category) === lc(node.category) &&
    (node.subCategory === "" || lc(row.subCategory) === lc(node.subCategory))
  );
}

/** The list with every path added that it does not hold yet. A path without a class or a category adds nothing. */
export function withPaths(list: readonly CategoryEntry[], paths: readonly CategoryPath[]): CategoryEntry[] {
  const out = list.map((e) => ({ ...e, subCategories: [...e.subCategories] }));
  for (const p of paths) {
    const cls = lc(p.class);
    const category = p.category.trim();
    if (!cls || !category) continue;
    let entry = out.find((e) => e.class === cls && lc(e.category) === lc(category));
    if (!entry) {
      entry = { class: cls, category, subCategories: [] };
      out.push(entry);
    }
    const sub = p.subCategory.trim();
    if (sub && !entry.subCategories.some((s) => lc(s) === lc(sub))) entry.subCategories.push(sub);
  }
  return out;
}

/** True when the list has this node. */
export function hasNode(list: readonly CategoryEntry[], node: CategoryPath): boolean {
  const e = list.find((x) => x.class === lc(node.class) && lc(x.category) === lc(node.category));
  return !!e && (node.subCategory === "" || e.subCategories.some((s) => lc(s) === lc(node.subCategory)));
}

/**
 * Why `node` cannot be renamed to `to` in the list: "empty", or "exists" when its parent already
 * has another node with that name. "" when it can (a change of case alone can).
 */
export function renameProblem(list: readonly CategoryEntry[], node: CategoryPath, to: string): "" | "empty" | "exists" {
  const name = to.trim();
  if (!name) return "empty";
  const own = node.subCategory || node.category;
  if (lc(name) === lc(own)) return "";
  const taken = node.subCategory ? { ...node, subCategory: name } : { ...node, category: name };
  return hasNode(list, taken) ? "exists" : "";
}

/** The list with the node renamed. */
export function renameNode(list: readonly CategoryEntry[], node: CategoryPath, to: string): CategoryEntry[] {
  const name = to.trim();
  return list.map((e) => {
    if (e.class !== lc(node.class) || lc(e.category) !== lc(node.category)) return e;
    if (!node.subCategory) return { ...e, category: name };
    return { ...e, subCategories: e.subCategories.map((s) => (lc(s) === lc(node.subCategory) ? name : s)) };
  });
}

/** The list without the node (a category goes with its subcategories). */
export function removeNode(list: readonly CategoryEntry[], node: CategoryPath): CategoryEntry[] {
  const own = (e: CategoryEntry) => e.class === lc(node.class) && lc(e.category) === lc(node.category);
  if (!node.subCategory) return list.filter((e) => !own(e));
  return list.map((e) => (own(e) ? { ...e, subCategories: e.subCategories.filter((s) => lc(s) !== lc(node.subCategory)) } : e));
}

/**
 * The item with the node's name replaced by `to`, when it stores that name. `at` is where the item
 * puts its row: the item itself, or for a fix, which may leave the class or category to the rules,
 * the row it fixes.
 */
export function renamedIn<T extends Partial<CategoryPath>>(
  item: T,
  node: CategoryPath,
  to: string,
  at: CategoryPath = item as CategoryPath,
): T {
  if (!inNode(at, node)) return item;
  if (node.subCategory) return item.subCategory ? { ...item, subCategory: to } : item;
  return item.category ? { ...item, category: to } : item;
}
