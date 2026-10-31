import { IconBar, MainPage, selectors, types } from "@nexusmods/vortex-api";
import path from "path";
import React from "react";
import { useTranslation } from "react-i18next";
import { useSelector } from "react-redux";

import { attrOf, getModPositions, GROUP_ATTR, modName, SORTING_ATTR, SUBGROUP_ATTR } from "../groups/order";
import type { IGroup, ISubgroup } from "../groups/reducers";
import { sortGroups } from "../groups/sort";
import { DEFAULT_ARCHIVES, DEFAULT_PLUGINS, withDefaults } from "../data/defaults";
import { getCachedArchives, getCachedPlugins, orderPlugins, pluginBaseName, scanMod } from "../plugins/scan";

const VMainPage = MainPage as any;
const VIconBar = IconBar as any;

interface IProps {
  gameId: string;
}

interface IEntry {
  key: string;
  plugin: string;
  mod: string;
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

  const { sections, archives } = React.useMemo(() => {
    const positions = getModPositions(mods);

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
      return ids.flatMap((id) =>
        orderPlugins(getCachedPlugins(id) ?? [], pluginRules[id]).map((plugin) => ({
          key: `${id}|${plugin}`,
          plugin,
          mod: modName(mods[id], id),
        })),
      );
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
    return { sections: shown, archives };
  }, [mods, groups, pluginRules, listed, installPath]);

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
          {external.length === 0 ? (
            <p style={{ opacity: 0.6 }}>{t("No external plugins")}</p>
          ) : (
            external.map((plugin) => (
              <div key={plugin} style={{ display: "flex", gap: 12, padding: "2px 0" }}>
                <span style={{ opacity: 0.5, minWidth: "3em", textAlign: "right" }}>{++position}</span>
                <span>{plugin}</span>
              </div>
            ))
          )}
          {sections.map((section) => {
            // groups are h2 now, as the plugins are a section of their own below the h1 "Plugins"
            const Heading = `h${section.level + 1}` as "h2" | "h3" | "h4";
            return (
              <div key={section.key}>
                <Heading>{section.title}</Heading>
                {section.entries.map((entry) => (
                  <div key={entry.key} style={{ display: "flex", gap: 12, padding: "2px 0" }}>
                    <span style={{ opacity: 0.5, minWidth: "3em", textAlign: "right" }}>{++position}</span>
                    <span>{pluginBaseName(entry.plugin)}</span>
                    <span style={{ opacity: 0.6 }}>{entry.mod}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </VMainPage.Body>
    </VMainPage>
  );
}

export default OpenMWPage;
