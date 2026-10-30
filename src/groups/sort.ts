import type { ISubgroup } from "./reducers";

/** Order groups so every group comes after the ones it lists in `after`. */
export function sortGroups<T extends ISubgroup>(groups: T[]): T[] {
  const byName = new Map(groups.map((g) => [g.name, g]));
  const done = new Set<string>();
  const result: T[] = [];
  const visit = (g: T, stack: Set<string>) => {
    if (done.has(g.name) || stack.has(g.name)) return;
    stack.add(g.name);
    g.after.forEach((a) => {
      const dep = byName.get(a);
      if (dep !== undefined) visit(dep, stack);
    });
    done.add(g.name);
    result.push(g);
  };
  groups.forEach((g) => visit(g, new Set()));
  return result;
}
