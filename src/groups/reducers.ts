import { types, util } from "@nexusmods/vortex-api";

import * as actions from "./actions";

export const DEFAULT_GROUP_NAMES = [
  "MORROWIND",
  "MASTER",
  "FIXES & OPTIMISATION",
  "RESOURCES & FRAMEWORKS",
  "_Scripting",
  "_Main Packs",
  "_Music & Sounds",
  "_Splash Screens",
  "_Models & Textures",
  "_Animations",
  "_Light",
  "UNDERRIDES",
  "EARLY LOADERS",
  "WORLD",
  "_General",
  "_Other",
  "_Seas",
  "_Tamriel Rebuilt",
  "_Skyrim",
  "_Cyrodiil",
  "_Vvardenfell",
  "EQUIPMENT",
  "_Changes",
  "_Additions",
  "CREATURES",
  "_Base",
  "_Additions",
  "_Changes",
  "FACTIONS",
  "QUESTING",
  "_Existing",
  "_New",
  "_Patches",
  "UI",
  "_General",
  "_HUD",
  "_Notifications",
  "_Icons",
  "_Journal",
  "_Map",
  "_Inventory",
  "MAGIC",
  "_Additions",
  "_Changes",
  "LOW PRIORITY PATCHES",
  "LOW PRIORITY OVERRIDES",
  "GAMEPLAY",
  "_Exploration",
  "_Character Creation",
  "_Character",
  "_Combat",
  "_Crime",
  "_Services",
  "_Weather",
  "_Enemies",
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
