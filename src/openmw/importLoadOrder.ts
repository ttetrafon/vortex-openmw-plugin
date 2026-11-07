import { log, selectors, types, util } from "@nexusmods/vortex-api";
import path from "path";

import { setCurrentProfile, setExternalArchives, setExternalPlugins } from "../actions";
import { getCachedArchives, pluginBaseName, scanMod } from "../plugins/scan";
import { DEFAULT_ARCHIVES, DEFAULT_PLUGINS, isDefault } from "../data/defaults";
import { dataDirectories, localDataDirectory, scanDataDirectories } from "./dataDirectories";
import { readActivePlugins } from "./launcherCfg";

// The data= lines of the profile that was imported last. They are copied as they are when the
// load order is exported, so they only need to be kept in memory, the import runs at every start.
let importedData: string[] | undefined;

export function getImportedData(): string[] | undefined {
  return importedData;
}

/**
 * Looks for the plugins in the data folders (the `data=` lines, and the local data folder) of the current OpenMW profile and
 * keeps the ones that no mod installed in Vortex has as "External". A plugin that a mod has is not
 * kept, the page lists it with its mod if that has a group, and leaves it out if not. The archives
 * of the profile are read from its `fallback-archive=` lines.
 */
export async function importLoadOrder(
  api: types.IExtensionApi,
  gameId: string,
  options: { silent?: boolean } = {},
): Promise<void> {
  // when Vortex starts nothing is shown, a missing setting or file only goes to the log
  const silent = options.silent === true;
  const state = api.getState();
  const settingsDir: string = util.getSafe(state, ["settings", "openmw", "location"], "");
  if (settingsDir === "") {
    if (silent) return;
    api.sendNotification?.({
      id: "openmw-import-no-location",
      type: "warning",
      message: "Set the 'OpenMW Settings Location' in the OpenMW tab of the settings first.",
      displayMS: 6000,
    });
    return;
  }

  let active;
  try {
    active = await readActivePlugins(settingsDir);
  } catch (err) {
    if (silent) {
      log("warn", "OpenMW: could not read launcher.cfg", { settingsDir, error: (err as Error).message });
    } else {
      api.showErrorNotification?.("Failed to read launcher.cfg", err as Error, { allowReport: false });
    }
    return;
  }
  if (active.profile === undefined) {
    if (silent) return;
    api.sendNotification?.({
      id: "openmw-import-no-profile",
      type: "warning",
      message: "launcher.cfg doesn't name a current profile.",
      displayMS: 6000,
    });
    return;
  }

  importedData = active.data;
  api.store?.dispatch(setCurrentProfile(active.profile) as any);

  // every plugin file of every installed mod, whatever its group or state, so that a plugin isn't
  // listed twice once a mod is added
  const installPath = selectors.installPathForGame(state, gameId);
  const mods: { [id: string]: any } = util.getSafe(state, ["persistent", "mods", gameId], {});
  const known = new Set<string>();
  const knownArchives = new Set<string>();
  if (installPath !== undefined) {
    await Promise.all(
      Object.keys(mods)
        .filter((id) => mods[id].installationPath !== undefined)
        .map((id) =>
          scanMod(id, path.join(installPath, mods[id].installationPath)).then((plugins) => {
            plugins.forEach((plugin) => known.add(pluginBaseName(plugin).toLowerCase()));
            (getCachedArchives(id) ?? []).forEach((archive) =>
              knownArchives.add(pluginBaseName(archive).toLowerCase()),
            );
          }),
        ),
    );
  }

  // the plugins that are really there: the files in the data folders, not what launcher.cfg lists
  // The data folders of the profile, and the local one that OpenMW always has after them. The
  // data= lines themselves are exported as they are, the local folder is not one of them.
  const folders = [...dataDirectories(active.data), await localDataDirectory(settingsDir)];
  const { plugins: found, archives: foundArchives, unreadable } = await scanDataDirectories(
    folders.filter((dir, idx) => folders.findIndex((other) => path.normalize(other).toLowerCase() === path.normalize(dir).toLowerCase()) === idx),
  );
  if (unreadable.length > 0) {
    log("warn", "OpenMW: data folders that couldn't be read", { unreadable });
  }

  // the base game files are always listed first, so they aren't kept here
  const optional = found.filter((plugin) => !isDefault(DEFAULT_PLUGINS, plugin));
  // Like the plugins, an archive only counts if the file is in a data folder. launcher.cfg keeps
  // listing the archive of a mod that was removed since the last export.
  const archivesOnDisk = new Set(foundArchives.map((archive) => archive.toLowerCase()));
  const optionalArchives = active.archives.filter(
    (archive) => !isDefault(DEFAULT_ARCHIVES, archive) && archivesOnDisk.has(pluginBaseName(archive).toLowerCase()),
  );
  const external = optional.filter((plugin) => !known.has(plugin.toLowerCase()));
  // archives of the profile that no mod provides, the ones of mods are found when showing the list
  const externalArchives = optionalArchives.filter((archive) => !knownArchives.has(archive.toLowerCase()));
  api.store?.dispatch(setExternalPlugins(external) as any);
  api.store?.dispatch(setExternalArchives(externalArchives) as any);
  if (silent) return;
  api.sendNotification?.({
    id: "openmw-import-done",
    type: "success",
    message: `Profile '${active.profile}': ${external.length} external plugin(s) and ${externalArchives.length
      } external archive(s) imported, ${optional.length - external.length} plugin(s) and ${optionalArchives.length - externalArchives.length
      } archive(s) already provided by mods in Vortex.${unreadable.length > 0 ? ` ${unreadable.length} data folder(s) couldn't be read.` : ""}`,
    displayMS: 6000,
  });
}
