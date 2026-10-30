import { createAction } from "redux-act";

// redux-act types the action creator as taking a single payload, not the arguments of the payload reducer.
const make = <A extends any[]>(type: string, payloadReducer: (...args: A) => unknown) =>
  createAction(type, payloadReducer as any) as unknown as ((...args: A) => {
    type: string;
    payload: unknown;
  }) & { toString(): string };

// `parent` is the name of the group whose subgroups are changed; omit it to change top-level groups.
export const openGroupEditor = make("OPENMW_OPEN_GROUP_EDITOR", (open: boolean) => open);
export const addGroup = make("OPENMW_ADD_GROUP", (name: string, parent?: string) => ({
  name,
  parent,
}));
export const removeGroup = make("OPENMW_REMOVE_GROUP", (name: string, parent?: string) => ({
  name,
  parent,
}));
export const addGroupRule = make(
  "OPENMW_ADD_GROUP_RULE",
  (group: string, after: string, parent?: string) => ({ group, after, parent }),
);
export const removeGroupRule = make(
  "OPENMW_REMOVE_GROUP_RULE",
  (group: string, after: string, parent?: string) => ({ group, after, parent }),
);
export const resetGroups = make("OPENMW_RESET_GROUPS", () => undefined);
