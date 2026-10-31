import { IconBar, MainPage, selectors, Toggle, types } from "@nexusmods/vortex-api";
import path from "path";
import React from "react";
import { useTranslation } from "react-i18next";
import { useDispatch, useSelector } from "react-redux";

import { setExternalPluginSettings } from "../actions";
import { attrOf, getModPositions, GROUP_ATTR, modName, SORTING_ATTR, sortingGroupsOf, SUBGROUP_ATTR, subgroupsOf, validValues } from "../groups/order";
import type { IGroup, ISubgroup } from "../groups/reducers";
import { sortGroups } from "../groups/sort";
import ValueSelect from "../groups/ValueSelect";
import { DEFAULT_ARCHIVES, DEFAULT_PLUGINS, isDefault, withDefaults } from "../data/defaults";
import { getCachedArchives, getCachedPlugins, orderPlugins, pluginBaseName, scanMod } from "../plugins/scan";

const VMainPage = MainPage as any;
const VIconBar = IconBar as any;
const VToggle = Toggle as any;

interface IProps {
  gameId: string;
}

interface IEntry {
  key: string;
  plugin: string;
  mod: string;
  /** an external plugin, shown with controls for its settings instead of a mod name */
  external?: boolean;
}

/** What is saved for an external plugin. */
interface IExternalSettings {
  enabled?: boolean;
  [attr: string]: string | boolean | undefined;
}

const emptyObject = {};
const emptyArray: string[] = [];

/** A heading and what is listed under it, `level` 1 for a group, 2 for a subgroup, 3 for a sorting group. */
interface ISection {
  key: string;
  level: 1 | 2 | 3;
  title: string;
  entries: IEntry[];
}

function OpenMWPage(props: IProps) {
  const { gameId } = props;
  const { t } = useTranslation();

  const mods: { [id: string]: any } = useSelector(
    (s: types.IState) => (s.persistent.mods as any)[gameId] ?? emptyObject,
  );
  const modState: { [id: string]: { enabled: boolean } } = useSelector(
    (s: types.IState) => (selectors.activeProfile(s) as any)?.modState ?? emptyObject,
  );
  const groups: IGroup[] = useSelector((s: types.IState) => (s.persistent as any).openmw?.groups ?? []);
  const pluginRules: { [modId: string]: { [plugin: string]: string[] } } = useSelector(
    (s: types.IState) => (s.persistent as any).openmw?.pluginRules ?? emptyObject,
  );
  const installPath: string | undefined = useSelector((s: types.IState) =>
    selectors.installPathForGame(s, gameId),
  );
  // archives used by OpenMW that don't come from a mod, see the "Import Load Order" button
  const storedArchives: string[] = useSelector(
    (s: types.IState) => (s.persistent as any).openmw?.externalArchives ?? emptyArray,
  );
  // the archives and plugins of the base game come first, whether launcher.cfg was read or not
  const externalArchives = React.useMemo(() => withDefaults(DEFAULT_ARCHIVES, storedArchives), [storedArchives]);
  // plugins used by OpenMW that don't come from a mod, see the "Import Load Order" button
  const storedPlugins: string[] = useSelector(
    (s: types.IState) => (s.persistent as any).openmw?.external ?? emptyArray,
  );
  const external = React.useMemo(() => withDefaults(DEFAULT_PLUGINS, storedPlugins), [storedPlugins]);
  // the external plugins that can be set up, which is all but the ones of the base game
  const optionalExternal = React.useMemo(
    () => external.filter((plugin) => !isDefault(DEFAULT_PLUGINS, plugin)),
    [external],
  );
  // saved per plugin by lowercase file name, so they are kept when the import changes the list
  const externalSettings: { [plugin: string]: IExternalSettings } = useSelector(
    (s: types.IState) => (s.persistent as any).openmw?.externalSettings ?? emptyObject,
  );
  const dispatch = useDispatch();

  // the mods that are installed, enabled and have a group
  const listed = React.useMemo(
    () =>
      Object.keys(mods).filter(
        (id) => modState[id]?.enabled === true && attrOf(mods[id], GROUP_ATTR) !== "",
      ),
    [mods, modState],
  );

  // The plugin files are found by looking into the staging folders, the list is drawn again once that is done.
  const [, setScanned] = React.useState(0);
  React.useEffect(() => {
    if (installPath === undefined) return;
    let cancelled = false;
    Promise.all(
      listed.map((id) =>
        mods[id].installationPath !== undefined
          ? scanMod(id, path.join(installPath, mods[id].installationPath))
          : Promise.resolve([]),
      ),
    ).then(() => {
      if (!cancelled) setScanned((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [listed.join("\n"), installPath]);

  const { sections, archives, ungrouped } = React.useMemo(() => {
    const positions = getModPositions(mods);

    // the external plugins per group, subgroup and sorting group, in the order of the list
    const externalBuckets = new Map<string, string[]>();
    optionalExternal.forEach((plugin) => {
      const valid = validValues(groups, externalSettings[plugin.toLowerCase()] ?? {});
      const key = [valid[GROUP_ATTR], valid[SUBGROUP_ATTR], valid[SORTING_ATTR]].join("\u0000");
      externalBuckets.set(key, [...(externalBuckets.get(key) ?? []), plugin]);
    });

    // the listed mods per group, subgroup and sorting group, in the order of their rules
    const buckets = new Map<string, string[]>();
    listed.forEach((id) => {
      const key = [GROUP_ATTR, SUBGROUP_ATTR, SORTING_ATTR].map((a) => attrOf(mods[id], a)).join("\u0000");
      buckets.set(key, [...(buckets.get(key) ?? []), id]);
    });
    buckets.forEach((ids) => ids.sort((lhs, rhs) => (positions.get(lhs) ?? 0) - (positions.get(rhs) ?? 0)));

    // the archives of the mods, in the same order as their plugins are listed
    const archives: IEntry[] = [];

    const entriesOf = (group: string, subgroup: string, sorting: string): IEntry[] => {
      const ids = buckets.get([group, subgroup, sorting].join("\u0000")) ?? [];
      ids.forEach((id) =>
        [...(getCachedArchives(id) ?? [])]
          .sort((lhs, rhs) => pluginBaseName(lhs).toLowerCase().localeCompare(pluginBaseName(rhs).toLowerCase()))
          .forEach((archive) =>
            archives.push({ key: `${id}|${archive}`, plugin: archive, mod: modName(mods[id], id) }),
          ),
      );
      const ofMods: IEntry[] = ids.flatMap((id) =>
        orderPlugins(getCachedPlugins(id) ?? [], pluginRules[id]).map((plugin) => ({
          key: `${id}|${plugin}`,
          plugin,
          mod: modName(mods[id], id),
        })),
      );
      // the external plugins of the same group come after the ones of the mods
      const ofExternal: IEntry[] = (externalBuckets.get([group, subgroup, sorting].join("\u0000")) ?? []).map(
        (plugin) => ({ key: `external|${plugin}`, plugin, mod: "", external: true }),
      );
      return [...ofMods, ...ofExternal];
    };

    const result: ISection[] = [];
    const add = (level: 1 | 2 | 3, title: string, entries: IEntry[], key: string) => {
      result.push({ key, level, title, entries });
    };
    sortGroups(groups).forEach((group: IGroup) => {
      const subgroups: ISubgroup[] = sortGroups(group.subgroups);
      // mods that only have a group come before the ones in its subgroups, like when sorting
      add(1, group.name, entriesOf(group.name, "", ""), group.name);
      subgroups.forEach((subgroup) => {
        const sub = `${group.name}/${subgroup.name}`;
        add(2, subgroup.name, entriesOf(group.name, subgroup.name, ""), sub);
        sortGroups(subgroup.sortingGroups ?? []).forEach((sorting) => {
          add(3, sorting.name, entriesOf(group.name, subgroup.name, sorting.name), `${sub}/${sorting.name}`);
        });
      });
    });

    // sections without plugins below them aren't shown, a heading is kept for the ones with plugins somewhere below it
    const shown = result.filter((section, idx) => {
      for (let i = idx; i < result.length; ++i) {
        if (i > idx && result[i]!.level <= section.level) break;
        if (result[i]!.entries.length > 0) return true;
      }
      return false;
    });
    // the external plugins without a group stay in the "external" section
    const ungrouped = externalBuckets.get(["", "", ""].join("\u0000")) ?? [];
    return { sections: shown, archives, ungrouped };
  }, [mods, groups, pluginRules, listed, installPath, optionalExternal, externalSettings]);

  const setSetting = (plugin: string, key: string, value: string) => {
    const current = externalSettings[plugin.toLowerCase()] ?? {};
    // a subgroup only makes sense within its group, a sorting group within its subgroup
    const valid = validValues(groups, { ...current, [key]: value } as { [attr: string]: string });
    dispatch(setExternalPluginSettings(plugin, valid) as any);
  };

  /** A plugin that doesn't come from a mod: a toggle, its name and the selectors for its groups. */
  const renderExternal = (plugin: string, number: number) => {
    const current = externalSettings[plugin.toLowerCase()] ?? {};
    const enabled = current.enabled !== false;
    const valid = validValues(groups, current as { [attr: string]: string });
    const group = valid[GROUP_ATTR]!;
    const subgroup = valid[SUBGROUP_ATTR]!;
    const selector = (key: string, value: string, options: ISubgroup[]) => (
      <div style={{ width: 200 }}>
        <ValueSelect
          value={value}
          options={sortGroups(options).map((o) => o.name)}
          disabled={false}
          noneLabel={t("(none)")}
          onChange={(v) => setSetting(plugin, key, v)}
        />
      </div>
    );
    return (
      <div key={`external|${plugin}`} style={{ display: "flex", gap: 12, padding: "2px 0", alignItems: "center" }}>
        <span style={{ opacity: 0.5, minWidth: "3em", textAlign: "right" }}>{number}</span>
        <VToggle
          checked={enabled}
          onToggle={(value: boolean) => dispatch(setExternalPluginSettings(plugin, { enabled: value }) as any)}
        />
        <span style={{ opacity: enabled ? 1 : 0.5 }}>{plugin}</span>
        {selector(GROUP_ATTR, group, groups)}
        {group !== "" ? selector(SUBGROUP_ATTR, subgroup, subgroupsOf(groups, group)) : null}
        {subgroup !== ""
          ? selector(SORTING_ATTR, valid[SORTING_ATTR]!, sortingGroupsOf(groups, group, subgroup))
          : null}
      </div>
    );
  };

  let position = 0;
  let archivePosition = 0;

  return (
    <VMainPage>
      <VMainPage.Header>
        {/* buttons are registered for this group with registerAction("openmw-icons", ...) */}
        <VIconBar group="openmw-icons" className="menubar" t={t} />
      </VMainPage.Header>
      <VMainPage.Body>
        <div className="openmw-plugin-list" style={{ overflow: "auto", height: "100%" }}>
          <h1>{t("Archives")}</h1>
          {externalArchives.length === 0 && archives.length === 0 ? (
            <p style={{ opacity: 0.6 }}>{t("No archives")}</p>
          ) : null}
          {/* the ones from launcher.cfg first, then the ones of the mods */}
          {externalArchives.map((archive) => (
            <div key={`external|${archive}`} style={{ display: "flex", gap: 12, padding: "2px 0" }}>
              <span style={{ opacity: 0.5, minWidth: "3em", textAlign: "right" }}>{++archivePosition}</span>
              <span>{archive}</span>
            </div>
          ))}
          {archives.map((entry) => (
            <div key={entry.key} style={{ display: "flex", gap: 12, padding: "2px 0" }}>
              <span style={{ opacity: 0.5, minWidth: "3em", textAlign: "right" }}>{++archivePosition}</span>
              <span>{pluginBaseName(entry.plugin)}</span>
              <span style={{ opacity: 0.6 }}>{entry.mod}</span>
            </div>
          ))}
          <h1>{t("Plugins")}</h1>
          <h2>{t("EXTERNAL")}</h2>
          {/* the plugins of the base game, then the other external ones that don't have a group */}
          {external
            .filter((plugin) => isDefault(DEFAULT_PLUGINS, plugin))
            .map((plugin) => (
              <div key={plugin} style={{ display: "flex", gap: 12, padding: "2px 0" }}>
                <span style={{ opacity: 0.5, minWidth: "3em", textAlign: "right" }}>{++position}</span>
                <span>{plugin}</span>
              </div>
            ))}
          {ungrouped.map((plugin) => renderExternal(plugin, ++position))}
          {sections.map((section) => {
            // groups are h2 now, as the plugins are a section of their own below the h1 "Plugins"
            const Heading = `h${section.level + 1}` as "h2" | "h3" | "h4";
            return (
              <div key={section.key}>
                <Heading>{section.title}</Heading>
                {section.entries.map((entry) =>
                  entry.external ? (
                    renderExternal(entry.plugin, ++position)
                  ) : (
                    <div key={entry.key} style={{ display: "flex", gap: 12, padding: "2px 0" }}>
                      <span style={{ opacity: 0.5, minWidth: "3em", textAlign: "right" }}>{++position}</span>
                      <span>{pluginBaseName(entry.plugin)}</span>
                      <span style={{ opacity: 0.6 }}>{entry.mod}</span>
                    </div>
                  ),
                )}
              </div>
            );
          })}
        </div>
      </VMainPage.Body>
    </VMainPage>
  );
}

export default OpenMWPage;
