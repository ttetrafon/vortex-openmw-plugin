import { types, util } from "@nexusmods/vortex-api";

import * as actions from "../actions";
import { DEFAULT_GROUP_NAMES } from "../data/groups";

/** A group within a parent group. Names only need to be unique within their parent. */
export interface ISubgroup {
  name: string;
  after: string[];
}

/** A group within a subgroup. Names only need to be unique within their subgroup. */
export interface ISubgroup {
  /** Not part of the defaults, only exists once the user adds some. */
  sortingGroups?: ISubgroup[];
}

export interface IGroup extends ISubgroup {
  subgroups: ISubgroup[];
}

const chain = <T extends { name: string }>(items: T[]): (T & { after: string[] })[] =>
  items.map((item, idx) => ({ ...item, after: idx > 0 ? [items[idx - 1]!.name] : [] }));

/** Names starting with "_" are subgroups of the closest group before them. */
function buildDefaultGroups(names: string[]): IGroup[] {
  const parents: { name: string; subgroups: { name: string }[] }[] = [];
  names.forEach((name) => {
    if (name.startsWith("_")) {
      parents[parents.length - 1]?.subgroups.push({ name: name.slice(1) });
    } else {
      parents.push({ name, subgroups: [] });
    }
  });
  return chain(parents).map((p) => ({ ...p, subgroups: chain(p.subgroups) }));
}

export const defaultGroups: IGroup[] = buildDefaultGroups(DEFAULT_GROUP_NAMES);

/**
 * Applies the function to the top-level groups, to the subgroups of `parent` when given or to the sorting groups of the subgroup `subgroup` of `parent` when both are given.
 */
function updateList(
  state: any,
  parent: string | undefined,
  subgroup: string | undefined,
  fn: (list: ISubgroup[]) => ISubgroup[],
): any {
  if (parent === undefined) {
    return util.setSafe(state, ["groups"], fn(state.groups) as IGroup[]);
  }
  const inParent = (g: IGroup): IGroup =>
    subgroup === undefined
      ? { ...g, subgroups: fn(g.subgroups) }
      : {
        ...g,
        subgroups: g.subgroups.map((s) =>
          s.name === subgroup ? { ...s, sortingGroups: fn(s.sortingGroups ?? []) } : s,
        ),
      };
  return util.setSafe(
    state,
    ["groups"],
    (state.groups as IGroup[]).map((g) => (g.name === parent ? inParent(g) : g)),
  );
}

export const groupsReducer: types.IReducerSpec = {
  reducers: {
    [actions.addGroup as any]: (state, { name, parent, subgroup }) =>
      updateList(state, parent, subgroup, (list) => {
        if (list.some((g) => g.name === name)) return list;
        // every level has the groups it contains, except the lowest one
        const entry: ISubgroup =
          parent === undefined
            ? ({ name, after: [], subgroups: [] } as IGroup)
            : subgroup === undefined
              ? { name, after: [], sortingGroups: [] }
              : { name, after: [] };
        return [...list, entry];
      }),
    [actions.removeGroup as any]: (state, { name, parent, subgroup }) =>
      updateList(state, parent, subgroup, (list) =>
        list.filter((g) => g.name !== name).map((g) => ({ ...g, after: g.after.filter((a) => a !== name) })),
      ),
    [actions.addGroupRule as any]: (state, { group, after, parent, subgroup }) =>
      updateList(state, parent, subgroup, (list) =>
        list.map((g) =>
          g.name === group && !g.after.includes(after) ? { ...g, after: [...g.after, after] } : g,
        ),
      ),
    [actions.removeGroupRule as any]: (state, { group, after, parent, subgroup }) =>
      updateList(state, parent, subgroup, (list) =>
        list.map((g) => (g.name === group ? { ...g, after: g.after.filter((a) => a !== after) } : g)),
      ),
    [actions.resetGroups as any]: (state) => util.setSafe(state, ["groups"], defaultGroups),
    [actions.setPluginRules as any]: (state, { modId, rules }) =>
      rules === undefined
        ? util.deleteOrNop(state, ["pluginRules", modId])
        : util.setSafe(state, ["pluginRules", modId], rules),
  },
  defaults: {
    groups: defaultGroups,
    // per mod: the plugin files that load before each plugin file of that mod
    pluginRules: {},
  },
};

// session: whether the editor dialog is open, stored at state.session.openmw
export const sessionReducer: types.IReducerSpec = {
  reducers: {
    [actions.openGroupEditor as any]: (state, open: boolean) =>
      util.setSafe(state, ["groupEditorOpen"], open),
    [actions.openPluginEditor as any]: (state, modId: string | undefined) =>
      util.setSafe(state, ["pluginEditorMod"], modId),
  },
  defaults: {
    groupEditorOpen: false,
    pluginEditorMod: undefined,
  },
};
