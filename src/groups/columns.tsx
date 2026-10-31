import { actions, selectors, types, util } from "@nexusmods/vortex-api";
import type { IGroup } from "./reducers";
import { sortGroups } from "./sort";

const GROUP_ATTR = "openmwGroup";
const SUBGROUP_ATTR = "openmwSubgroup";

const MIN_COLUMN_WIDTH = 220;
const STYLE_ID = "openmw-group-columns-style";

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

  // Position in the load order of the groups: empty first, then the order of the groups
  const rank = (names: string[], name: string): number => {
    if (name === "") return -1;
    const idx = names.indexOf(name);
    return idx === -1 ? names.length : idx;
  };

  // Position of every mod within its group+subgroup, following the "before"/"after" rules between
  // mods of that same subgroup (rules to mods in other subgroups are ignored). Rules only give a
  // partial order and a comparator only sees two mods at a time, so the whole order is calculated
  // once and reused until the mods change.
  const ruleOrder: { mods: unknown; positions: Map<string, number> } = {
    mods: undefined,
    positions: new Map(),
  };

  const modName = (mod: any, id: string): string =>
    String(mod?.attributes?.customFileName ?? mod?.attributes?.logicalFileName ?? mod?.attributes?.name ?? id).toLowerCase();

  const getRuleOrder = (): Map<string, number> => {
    const mods: { [id: string]: any } = util.getSafe(
      context.api.getState(),
      ["persistent", "mods", gameId],
      {},
    );
    if (ruleOrder.mods === mods) return ruleOrder.positions;

    const buckets = new Map<string, string[]>();
    Object.keys(mods).forEach((id) => {
      const key = `${attrOf(mods[id], GROUP_ATTR)}\u0000${attrOf(mods[id], SUBGROUP_ATTR)}`;
      buckets.set(key, [...(buckets.get(key) ?? []), id]);
    });

    const positions = new Map<string, number>();
    buckets.forEach((unsorted) => {
      const ids = [...unsorted].sort((lhs, rhs) => modName(mods[lhs], lhs).localeCompare(modName(mods[rhs], rhs)));
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

      // Kahn's algorithm, always taking the first available mod by name so unrelated mods stay
      // in a stable order
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

    ruleOrder.mods = mods;
    ruleOrder.positions = positions;
    return positions;
  };

  // Used by both columns: sort by group order, by subgroup order within the same group and, within
  // the same subgroup, by the load order rules between the mods.
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
    const positions = getRuleOrder();
    return (positions.get(lhs.id) ?? 0) - (positions.get(rhs.id) ?? 0);
  };

  // When groups or subgroups are deleted (or reset), clear the values mods still have for them.
  const clearStaleValues = () => {
    const state = context.api.getState();
    const groups = getGroups();
    const mods: { [id: string]: IModRow } = util.getSafe(state, ["persistent", "mods", gameId], {});
    const updates: any[] = [];
    Object.keys(mods).forEach((id) => {
      const mod = mods[id]!;
      const group = attrOf(mod, GROUP_ATTR);
      const subgroup = attrOf(mod, SUBGROUP_ATTR);
      const groupEntry = groups.find((g) => g.name === group);
      if (group !== "" && groupEntry === undefined) {
        updates.push(actions.setModAttribute(gameId, id, GROUP_ATTR, ""));
        if (subgroup !== "") {
          updates.push(actions.setModAttribute(gameId, id, SUBGROUP_ATTR, ""));
        }
      } else if (subgroup !== "" && !(groupEntry?.subgroups ?? []).some((s) => s.name === subgroup)) {
        updates.push(actions.setModAttribute(gameId, id, SUBGROUP_ATTR, ""));
      }
    });
    const store = context.api.store;
    if (updates.length > 0 && store !== undefined) {
      util.batchDispatch(store, updates);
    }
  };

  context.once(() => {
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
    calc: (mod: IModRow) => attrOf(mod, GROUP_ATTR),
    sortFuncRaw: sortByGroupOrder,
    // 'customRenderer' is required to repopulate the `subgroup` dropdown when the `group` changes
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
    sortFuncRaw: sortByGroupOrder,
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
