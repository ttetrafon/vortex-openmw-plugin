import { util } from "@nexusmods/vortex-api";

import type { IGroup, ISubgroup } from "./reducers";

export const GROUP_ATTR = "openmwGroup";
export const SUBGROUP_ATTR = "openmwSubgroup";
export const SORTING_ATTR = "openmwSortingGroup";

export const attrOf = (mod: any, key: string): string => mod?.attributes?.[key] ?? "";

export const modName = (mod: any, id: string): string =>
  String(
    mod?.attributes?.customFileName ?? mod?.attributes?.logicalFileName ?? mod?.attributes?.name ?? id,
  );

let cache: { mods: unknown; positions: Map<string, number> } = {
  mods: undefined,
  positions: new Map(),
};

/**
 * Position of every mod within its group+subgroup+sorting group, following the "before"/"after"
 * rules between mods of that same sorting group (rules to mods elsewhere are ignored, those are
 * ordered by their groups). Rules only give a partial order and a comparator only sees two mods at
 * a time, so the whole order is calculated once and reused until the mods change.
 */
export function getModPositions(mods: { [id: string]: any }): Map<string, number> {
  if (cache.mods === mods) return cache.positions;

  const buckets = new Map<string, string[]>();
  Object.keys(mods).forEach((id) => {
    const key = [GROUP_ATTR, SUBGROUP_ATTR, SORTING_ATTR].map((a) => attrOf(mods[id], a)).join("\u0000");
    buckets.set(key, [...(buckets.get(key) ?? []), id]);
  });

  const positions = new Map<string, number>();
  buckets.forEach((unsorted) => {
    const lower = (id: string) => modName(mods[id], id).toLowerCase();
    const ids = [...unsorted].sort((lhs, rhs) => lower(lhs).localeCompare(lower(rhs)));
    // edges[a] = mods that have to load after a
    const edges = new Map<string, Set<string>>(ids.map((id) => [id, new Set<string>()]));
    const incoming = new Map<string, number>(ids.map((id) => [id, 0]));
    const addEdge = (from: string, to: string) => {
      if (from === to || edges.get(from)!.has(to)) return;
      edges.get(from)!.add(to);
      incoming.set(to, incoming.get(to)! + 1);
    };
    ids.forEach((id) => {
      (mods[id]?.rules ?? []).forEach((rule: any) => {
        if (rule.ignored || (rule.type !== "before" && rule.type !== "after")) return;
        ids.forEach((otherId) => {
          if (otherId !== id && util.testModReference(mods[otherId], rule.reference)) {
            if (rule.type === "before") addEdge(id, otherId);
            else addEdge(otherId, id);
          }
        });
      });
    });

    // Always taking the first available mod by name so unrelated mods stay in a stable order
    const done = new Set<string>();
    const ordered: string[] = [];
    while (ordered.length < ids.length) {
      const next =
        ids.find((id) => !done.has(id) && incoming.get(id) === 0) ??
        // a cycle in the rules, break it at the first remaining mod
        ids.find((id) => !done.has(id))!;
      done.add(next);
      ordered.push(next);
      edges.get(next)!.forEach((to) => incoming.set(to, incoming.get(to)! - 1));
    }
    ordered.forEach((id, idx) => positions.set(id, idx));
  });

  cache = { mods, positions };
  return positions;
}

export const subgroupsOf = (groups: IGroup[], group: string): ISubgroup[] =>
  groups.find((g) => g.name === group)?.subgroups ?? [];

export const sortingGroupsOf = (groups: IGroup[], group: string, subgroup: string): ISubgroup[] =>
  subgroupsOf(groups, group).find((s) => s.name === subgroup)?.sortingGroups ?? [];

/**
 * The group, subgroup and sorting group (the values of the three attributes) with the ones that
 * don't exist any more removed. A subgroup only makes sense within its group, a sorting group
 * within its subgroup.
 */
export const validValues = (
  groups: IGroup[],
  values: { [attr: string]: unknown },
): { [attr: string]: string } => {
  const text = (attr: string): string => (typeof values[attr] === "string" ? (values[attr] as string) : "");
  const group = text(GROUP_ATTR);
  const subgroup = text(SUBGROUP_ATTR);
  const sorting = text(SORTING_ATTR);
  const g = groups.some((x) => x.name === group) ? group : "";
  const s = g !== "" && subgroupsOf(groups, g).some((x) => x.name === subgroup) ? subgroup : "";
  const o = s !== "" && sortingGroupsOf(groups, g, s).some((x) => x.name === sorting) ? sorting : "";
  return { [GROUP_ATTR]: g, [SUBGROUP_ATTR]: s, [SORTING_ATTR]: o };
};
