import { actions, OptionsFilter, selectors, types, util } from "@nexusmods/vortex-api";
import type { IGroup, ISubgroup } from "./reducers";
import { attrOf, getModPositions, GROUP_ATTR, SORTING_ATTR, SUBGROUP_ATTR } from "./order";
import { sortGroups } from "./sort";


const MIN_COLUMN_WIDTH = 220;
const STYLE_ID = "openmw-group-columns-style";

interface IModRow {
  id: string;
  state?: string;
  archiveId?: string;
  attributes?: { [key: string]: any };
}

function injectColumnStyle() {
  if (document.getElementById(STYLE_ID) !== null) return;
  const ids = ["openmw-group", "openmw-subgroup", "openmw-sorting-group"];
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

export function registerGroupColumns(context: types.IExtensionContext, gameId: string) {
  context.once(injectColumnStyle);

  const getGroups = (): IGroup[] =>
    util.getSafe(context.api.getState(), ["persistent", "openmw", "groups"], []);

  const getDownloads = (): { [archiveId: string]: any } =>
    util.getSafe(context.api.getState(), ["persistent", "downloads", "files"], {});

  /** Actions that make the values kept with a download match `values`, where they differ. */
  const downloadUpdates = (archiveId: string, values: { [key: string]: string }): any[] => {
    const download = getDownloads()[archiveId];
    if (download === undefined) return [];
    const custom = download.modInfo?.custom ?? {};
    return Object.keys(values)
      .filter((key) => (custom[key] ?? "") !== values[key])
      .map((key) => actions.setDownloadModInfo(archiveId, `custom.${key}`, values[key]));
  };

  const dispatchAll = (updates: any[]) => {
    const store = context.api.store;
    if (updates.length > 0 && store !== undefined) {
      util.batchDispatch(store, updates);
    }
  };

  // The values are kept on the mod and on the download it came from, so that both always agree.
  // Downloads that aren't installed have no mod entry, their values are only kept with the download
  // (the row id is the archive id) and read back by the extractor below.
  const setAttrs = (row: IModRow, values: { [key: string]: string }) => {
    if (row.state === "downloaded") {
      dispatchAll(downloadUpdates(row.id, values));
      return;
    }
    dispatchAll([
      ...Object.keys(values).map((key) => actions.setModAttribute(gameId, row.id, key, values[key])),
      ...(row.archiveId !== undefined ? downloadUpdates(row.archiveId, values) : []),
    ]);
  };

  // Builds the attributes of a downloaded row from what is kept with the download. The same
  // attributes are used when the download is installed, so the mod keeps its groups.
  context.registerAttributeExtractor(100, (input: any) => {
    const custom = input?.download?.modInfo?.custom ?? {};
    return Promise.resolve({
      [GROUP_ATTR]: custom[GROUP_ATTR],
      [SUBGROUP_ATTR]: custom[SUBGROUP_ATTR],
      [SORTING_ATTR]: custom[SORTING_ATTR],
    });
  });

  const subgroupsOf = (groups: IGroup[], group: string): ISubgroup[] =>
    groups.find((g) => g.name === group)?.subgroups ?? [];

  const sortingGroupsOf = (groups: IGroup[], group: string, subgroup: string): ISubgroup[] =>
    subgroupsOf(groups, group).find((s) => s.name === subgroup)?.sortingGroups ?? [];

  /**
   * The group, subgroup and sorting group with the ones that don't exist any more removed. A subgroup only makes sense within its group, a sorting group within its subgroup.
   */
  const validValues = (
    groups: IGroup[],
    values: { [attr: string]: string },
  ): { [attr: string]: string } => {
    const group = values[GROUP_ATTR] ?? "";
    const subgroup = values[SUBGROUP_ATTR] ?? "";
    const sorting = values[SORTING_ATTR] ?? "";
    const g = groups.some((x) => x.name === group) ? group : "";
    const s = g !== "" && subgroupsOf(groups, g).some((x) => x.name === subgroup) ? subgroup : "";
    const o = s !== "" && sortingGroupsOf(groups, g, s).some((x) => x.name === sorting) ? sorting : "";
    return { [GROUP_ATTR]: g, [SUBGROUP_ATTR]: s, [SORTING_ATTR]: o };
  };

  const valuesOf = (mod: IModRow): { [attr: string]: string } => ({
    [GROUP_ATTR]: attrOf(mod, GROUP_ATTR),
    [SUBGROUP_ATTR]: attrOf(mod, SUBGROUP_ATTR),
    [SORTING_ATTR]: attrOf(mod, SORTING_ATTR),
  });

  /** Sets one of the three values and clears the ones below it that don't fit any more. */
  const setValue = (mod: IModRow, key: string, value: string) => {
    const values = { ...valuesOf(mod), [key]: value };
    const valid = validValues(getGroups(), values);
    const changed: { [key: string]: string } = {};
    Object.keys(valid).forEach((k) => {
      if (k === key || valid[k] !== attrOf(mod, k)) changed[k] = valid[k]!;
    });
    setAttrs(mod, changed);
  };

  const setGroup = (mod: IModRow, group: string) => setValue(mod, GROUP_ATTR, group);

  // Position in the load order of the groups: empty first, then the order of the groups
  const rank = (names: string[], name: string): number => {
    if (name === "") return -1;
    const idx = names.indexOf(name);
    return idx === -1 ? names.length : idx;
  };

  // Position of every mod within its sorting group, see getModPositions
  const getRuleOrder = (): Map<string, number> =>
    getModPositions(util.getSafe(context.api.getState(), ["persistent", "mods", gameId], {}));

  // Used by all three columns: sort by group order, by subgroup order within the same group, by
  // sorting group order within the same subgroup and, within the same sorting group, by the load
  // order rules between the mods.
  const sortByGroupOrder = (lhs: IModRow, rhs: IModRow): number => {
    const groups = sortGroups(getGroups());
    const groupNames = groups.map((g) => g.name);
    const lhsGroup = attrOf(lhs, GROUP_ATTR);
    const rhsGroup = attrOf(rhs, GROUP_ATTR);
    if (lhsGroup !== rhsGroup) {
      return rank(groupNames, lhsGroup) - rank(groupNames, rhsGroup);
    }
    const subgroupNames = sortGroups(groups.find((g) => g.name === lhsGroup)?.subgroups ?? []).map(
      (s) => s.name,
    );
    const lhsSub = attrOf(lhs, SUBGROUP_ATTR);
    const rhsSub = attrOf(rhs, SUBGROUP_ATTR);
    if (lhsSub !== rhsSub) {
      return rank(subgroupNames, lhsSub) - rank(subgroupNames, rhsSub);
    }
    const sortingNames = sortGroups(sortingGroupsOf(groups, lhsGroup, lhsSub)).map((s) => s.name);
    const lhsSorting = attrOf(lhs, SORTING_ATTR);
    const rhsSorting = attrOf(rhs, SORTING_ATTR);
    if (lhsSorting !== rhsSorting) {
      return rank(sortingNames, lhsSorting) - rank(sortingNames, rhsSorting);
    }
    const positions = getRuleOrder();
    return (positions.get(lhs.id) ?? 0) - (positions.get(rhs.id) ?? 0);
  };

  // When groups, subgroups or sorting groups are deleted (or reset), clear the values mods and
  // downloads still have for them.
  const clearStaleValues = () => {
    const state = context.api.getState();
    const groups = getGroups();
    const mods: { [id: string]: IModRow } = util.getSafe(state, ["persistent", "mods", gameId], {});
    const downloads = getDownloads();
    const updates: any[] = [];
    const withMod = new Set<string>();
    Object.keys(mods).forEach((id) => {
      const mod = mods[id]!;
      const current = valuesOf(mod);
      const valid = validValues(groups, current);
      Object.keys(valid).forEach((key) => {
        if (valid[key] !== current[key]) {
          updates.push(actions.setModAttribute(gameId, id, key, valid[key]));
        }
      });
      if (mod.archiveId !== undefined) {
        // the download follows its mod
        withMod.add(mod.archiveId);
        updates.push(...downloadUpdates(mod.archiveId, valid));
      }
    });
    Object.keys(downloads).forEach((archiveId) => {
      const custom = downloads[archiveId]?.modInfo?.custom;
      if (withMod.has(archiveId) || custom === undefined) return;
      const current = valuesOf({ id: archiveId, attributes: custom });
      updates.push(...downloadUpdates(archiveId, validValues(groups, current)));
    });
    dispatchAll(updates);
  };

  // Brings the downloads in line with the values of their installed mods, the mod wins. This fixes
  // what differs from before the two were kept together.
  const syncDownloads = () => {
    const mods: { [id: string]: IModRow } = util.getSafe(
      context.api.getState(),
      ["persistent", "mods", gameId],
      {},
    );
    dispatchAll(
      Object.keys(mods).flatMap((id) => {
        const archiveId = mods[id]!.archiveId;
        return archiveId !== undefined ? downloadUpdates(archiveId, valuesOf(mods[id]!)) : [];
      }),
    );
  };

  context.once(() => {
    syncDownloads();
    context.api.onStateChange?.(["persistent", "openmw", "groups"], clearStaleValues);
  });

  const condition = () => selectors.activeGameId(context.api.getState()) === gameId;

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
    // multi-select dropdown like the one of the Category column; the options are read when it opens, so they follow edits made in the group editor. raw=false matches on the group name from calc.
    filter: new OptionsFilter(
      () => [
        { value: OptionsFilter.EMPTY, label: `<${context.api.translate("Unassigned")}>` },
        ...sortGroups(getGroups()).map((g) => ({ value: g.name, label: g.name })),
      ],
      true,
      false,
    ),
    calc: (mod: IModRow) => attrOf(mod, GROUP_ATTR),
    sortFuncRaw: sortByGroupOrder,
    // 'customRenderer' is required to repopulate the `subgroup` dropdown when the `group` changes
    customRenderer: (mod: IModRow, _detail: boolean, t: (s: string) => string) => (
      <ValueSelect
        value={attrOf(mod, GROUP_ATTR)}
        options={sortGroups(getGroups()).map((g) => g.name)}
        disabled={false}
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
    sortFuncRaw: sortByGroupOrder,
    customRenderer: (mod: IModRow, _detail: boolean, t: (s: string) => string) => {
      const group = getGroups().find((g) => g.name === attrOf(mod, GROUP_ATTR));
      return (
        <ValueSelect
          value={attrOf(mod, SUBGROUP_ATTR)}
          options={sortGroups(group?.subgroups ?? []).map((s) => s.name)}
          disabled={group === undefined}
          noneLabel={t("(none)")}
          onChange={(value) => setValue(mod, SUBGROUP_ATTR, value)}
        />
      );
    },
    edit: {},
  } as types.ITableAttribute);

  context.registerTableAttribute("mods", {
    id: "openmw-sorting-group",
    name: "Sorting Group",
    description: "OpenMW load order sorting group, within a subgroup",
    icon: "sitemap",
    placement: "both",
    position: 122,
    condition,
    isToggleable: true,
    isSortable: true,
    isVolatile: true,
    calc: (mod: IModRow) => attrOf(mod, SORTING_ATTR),
    sortFuncRaw: sortByGroupOrder,
    customRenderer: (mod: IModRow, _detail: boolean, t: (s: string) => string) => {
      const group = attrOf(mod, GROUP_ATTR);
      const subgroup = attrOf(mod, SUBGROUP_ATTR);
      const subgroupEntry = subgroupsOf(getGroups(), group).find((s) => s.name === subgroup);
      return (
        <ValueSelect
          value={attrOf(mod, SORTING_ATTR)}
          options={sortGroups(sortingGroupsOf(getGroups(), group, subgroup)).map((s) => s.name)}
          disabled={subgroupEntry === undefined}
          noneLabel={t("(none)")}
          onChange={(value) => setValue(mod, SORTING_ATTR, value)}
        />
      );
    },
    edit: {},
  } as types.ITableAttribute);
}
