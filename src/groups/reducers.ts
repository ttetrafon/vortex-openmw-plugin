import { types, util } from "@nexusmods/vortex-api";

import * as actions from "./actions";

export const DEFAULT_GROUP_NAMES = [
  "MORROWIND",
  "MASTER",
  "FIXES & OPTIMISATION",
  "RESOURCES & FRAMEWORKS",
  "_scripting",
  "_main packs",
  "_music & sounds",
  "_splash screens",
  "_models & textures",
  "_animations",
  "_light",
  "UNDERRIDES",
  "EARLY LOADERS",
  "WORLD",
  "_general",
  "_other",
  "_Seas",
  "_Tamriel Rebuilt",
  "_Skyrim",
  "_Cyrodiil",
  "_Vvardenfell",
  "EQUIPMENT",
  "_changes",
  "_additions",
  "CREATURES",
  "_base",
  "_additions",
  "_changes",
  "FACTIONS",
  "QUESTING",
  "_existing",
  "_new",
  "_patches",
  "UI",
  "_general",
  "_HUD",
  "_notifications",
  "_icons",
  "_journal",
  "_map",
  "_inventory",
  "MAGIC",
  "_additions",
  "_changes",
  "LOW PRIORITY PATCHES",
  "LOW PRIORITY OVERRIDES",
  "GAMEPLAY",
  "_exploration",
  "_character creation",
  "_character",
  "_combat",
  "_crime",
  "_services",
  "_weather",
  "_enemies",
  "LATE PATCHES",
  "LATE LOADERS",
  "AUTOMATED",
  "TOOLS",
];

/** A group within a parent group. Names only need to be unique within their parent. */
export interface ISubgroup {
  name: string;
  after: string[];
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

/** Applies `fn` to the top-level groups, or to the subgroups of `parent` when given. */
function updateList(
  state: any,
  parent: string | undefined,
  fn: (list: ISubgroup[]) => ISubgroup[],
): any {
  if (parent === undefined) {
    return util.setSafe(state, ["groups"], fn(state.groups) as IGroup[]);
  }
  return util.setSafe(
    state,
    ["groups"],
    (state.groups as IGroup[]).map((g) => (g.name === parent ? { ...g, subgroups: fn(g.subgroups) } : g)),
  );
}

export const groupsReducer: types.IReducerSpec = {
  reducers: {
    [actions.addGroup as any]: (state, { name, parent }) =>
      updateList(state, parent, (list) =>
        list.some((g) => g.name === name)
          ? list
          : [...list, parent === undefined ? { name, after: [], subgroups: [] } : { name, after: [] }],
      ),
    [actions.removeGroup as any]: (state, { name, parent }) =>
      updateList(state, parent, (list) =>
        list.filter((g) => g.name !== name).map((g) => ({ ...g, after: g.after.filter((a) => a !== name) })),
      ),
    [actions.addGroupRule as any]: (state, { group, after, parent }) =>
      updateList(state, parent, (list) =>
        list.map((g) =>
          g.name === group && !g.after.includes(after) ? { ...g, after: [...g.after, after] } : g,
        ),
      ),
    [actions.removeGroupRule as any]: (state, { group, after, parent }) =>
      updateList(state, parent, (list) =>
        list.map((g) => (g.name === group ? { ...g, after: g.after.filter((a) => a !== after) } : g)),
      ),
    [actions.resetGroups as any]: (state) => util.setSafe(state, ["groups"], defaultGroups),
  },
  defaults: {
    groups: defaultGroups,
  },
};

// session: whether the editor dialog is open, stored at state.session.openmw
export const sessionReducer: types.IReducerSpec = {
  reducers: {
    [actions.openGroupEditor as any]: (state, open: boolean) =>
      util.setSafe(state, ["groupEditorOpen"], open),
  },
  defaults: {
    groupEditorOpen: false,
  },
};
