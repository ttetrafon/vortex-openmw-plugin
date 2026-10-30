import { actions, selectors, types, util } from "@nexusmods/vortex-api";
import React from "react";

import type { IGroup } from "./reducers";
import { sortGroups } from "./sort";

const GROUP_ATTR = "openmwGroup";
const SUBGROUP_ATTR = "openmwSubgroup";

// The table sizes columns by their content, which leaves the dropdowns too narrow to read.
const MIN_COLUMN_WIDTH = 220;
const STYLE_ID = "openmw-group-columns-style";

// a mod row as the mods table hands it to us
interface IModRow {
  id: string;
  state?: string;
  attributes?: { [key: string]: any };
}

function injectColumnStyle() {
  if (document.getElementById(STYLE_ID) !== null) return;
  const ids = ["openmw-group", "openmw-subgroup"];
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = ids
    .map((id) => `.header-${id}, .cell-${id} { min-width: ${MIN_COLUMN_WIDTH}px; }`)
    .join("\n");
  document.head.appendChild(style);
}

interface ISelectProps {
  value: string;
  options: string[];
  disabled: boolean;
  noneLabel: string;
  onChange: (value: string) => void;
}

function ValueSelect(props: ISelectProps) {
  const { value, options, disabled, noneLabel, onChange } = props;
  // keep a value whose group/subgroup was deleted visible, so it can still be seen and cleared
  const all = value !== "" && !options.includes(value) ? [value, ...options] : options;
  return (
    <select
      className="form-control"
      value={value}
      disabled={disabled}
      onChange={(evt) => onChange(evt.target.value)}
      // don't let clicks select/open the table row
      onClick={(evt) => evt.stopPropagation()}
    >
      <option value="">{noneLabel}</option>
      {all.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </select>
  );
}

/** Adds the "Group" and "Subgroup" columns to the mods table of the given game. */
export function registerGroupColumns(context: types.IExtensionContext, gameId: string) {
  context.once(injectColumnStyle);

  const getGroups = (): IGroup[] =>
    util.getSafe(context.api.getState(), ["persistent", "openmw", "groups"], []);

  const attrOf = (mod: IModRow, key: string): string => mod?.attributes?.[key] ?? "";

  const setAttrs = (row: IModRow, values: { [key: string]: string }) => {
    // downloads that aren't installed have no mod entry to attach the value to
    if (row.state === "downloaded") return;
    Object.keys(values).forEach((key) => {
      context.api.store?.dispatch(actions.setModAttribute(gameId, row.id, key, values[key]));
    });
  };

  const setGroup = (mod: IModRow, group: string) => {
    const subgroups = getGroups().find((g) => g.name === group)?.subgroups ?? [];
    // a subgroup only makes sense within its own group
    const keep = subgroups.some((s) => s.name === attrOf(mod, SUBGROUP_ATTR));
    setAttrs(mod, keep ? { [GROUP_ATTR]: group } : { [GROUP_ATTR]: group, [SUBGROUP_ATTR]: "" });
  };

  const condition = () => selectors.activeGameId(context.api.getState()) === gameId;

  // A custom renderer (unlike "edit.choices") is redrawn whenever the row changes, which is needed
  // for the subgroup options to follow the group of the same row.
  context.registerTableAttribute("mods", {
    id: "openmw-group",
    name: "Group",
    description: "OpenMW load order group",
    icon: "sitemap",
    placement: "both",
    position: 120,
    condition,
    isToggleable: true,
    isSortable: true,
    isVolatile: true,
    calc: (mod: IModRow) => attrOf(mod, GROUP_ATTR),
    customRenderer: (mod: IModRow, _detail: boolean, t: (s: string) => string) => (
      <ValueSelect
        value={attrOf(mod, GROUP_ATTR)}
        options={sortGroups(getGroups()).map((g) => g.name)}
        disabled={mod.state === "downloaded"}
        noneLabel={t("(none)")}
        onChange={(value) => setGroup(mod, value)}
      />
    ),
    edit: {},
  } as types.ITableAttribute);

  context.registerTableAttribute("mods", {
    id: "openmw-subgroup",
    name: "Subgroup",
    description: "OpenMW load order subgroup",
    icon: "sitemap",
    placement: "both",
    position: 121,
    condition,
    isToggleable: true,
    isSortable: true,
    isVolatile: true,
    calc: (mod: IModRow) => attrOf(mod, SUBGROUP_ATTR),
    customRenderer: (mod: IModRow, _detail: boolean, t: (s: string) => string) => {
      const group = getGroups().find((g) => g.name === attrOf(mod, GROUP_ATTR));
      return (
        <ValueSelect
          value={attrOf(mod, SUBGROUP_ATTR)}
          options={sortGroups(group?.subgroups ?? []).map((s) => s.name)}
          disabled={mod.state === "downloaded" || group === undefined}
          noneLabel={t("(none)")}
          onChange={(value) => setAttrs(mod, { [SUBGROUP_ATTR]: value })}
        />
      );
    },
    edit: {},
  } as types.ITableAttribute);
}
