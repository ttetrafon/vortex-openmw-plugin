import { createAction } from "redux-act";

export const setOpenMWLocation = createAction(
  "OPENMW_SET_LOCATION",
  (location: string) => location,
);
const make = <A extends any[]>(type: string, payloadReducer: (...args: A) => unknown) =>
  createAction(type, payloadReducer as any) as unknown as ((...args: A) => {
    type: string;
    payload: unknown;
  }) & { toString(): string };

// `parent` is the name of the group whose subgroups are changed; omit it to change top-level groups.
// With `subgroup` as well (a subgroup of `parent`), the sorting groups of that subgroup are changed.
export const openGroupEditor = make("OPENMW_OPEN_GROUP_EDITOR", (open: boolean) => open);
export const addGroup = make(
  "OPENMW_ADD_GROUP",
  (name: string, parent?: string, subgroup?: string) => ({ name, parent, subgroup }),
);
export const removeGroup = make(
  "OPENMW_REMOVE_GROUP",
  (name: string, parent?: string, subgroup?: string) => ({ name, parent, subgroup }),
);
export const addGroupRule = make(
  "OPENMW_ADD_GROUP_RULE",
  (group: string, after: string, parent?: string, subgroup?: string) => ({
    group,
    after,
    parent,
    subgroup,
  }),
);
export const removeGroupRule = make(
  "OPENMW_REMOVE_GROUP_RULE",
  (group: string, after: string, parent?: string, subgroup?: string) => ({
    group,
    after,
    parent,
    subgroup,
  }),
);
// the plugin editor shows the plugin files of one mod, `undefined` closes it
export const openPluginEditor = make("OPENMW_OPEN_PLUGIN_EDITOR", (modId: string | undefined) => modId);
// `rules` maps a plugin file to the plugin files that load before it; `undefined` restores the defaults
export const setPluginRules = make(
  "OPENMW_SET_PLUGIN_RULES",
  (modId: string, rules: { [plugin: string]: string[] } | undefined) => ({ modId, rules }),
);
export const resetGroups = make("OPENMW_RESET_GROUPS", () => undefined);
// plugins that are used by OpenMW but don't come from a mod in Vortex, in load order
export const setExternalPlugins = make("OPENMW_SET_EXTERNAL_PLUGINS", (plugins: string[]) => plugins);
// archives (.bsa) that OpenMW uses but that don't come from a mod in Vortex, in load order
export const setExternalArchives = make("OPENMW_SET_EXTERNAL_ARCHIVES", (archives: string[]) => archives);
