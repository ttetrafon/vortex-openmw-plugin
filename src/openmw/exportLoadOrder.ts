import { types, util } from "@nexusmods/vortex-api";
import { promises as fs } from "fs";
import path from "path";

import { setCurrentProfile } from "../actions";
import { getImportedData } from "./importLoadOrder";
import { parseActivePlugins, writeOpenmwCfg, writeProfile } from "./launcherCfg";

/** Name of the profile in launcher.cfg that is written by the export. */
export const EXPORT_PROFILE = "Vortex";

/** The load order as the OpenMW page shows it, kept up to date by that page. */
export interface ILoadOrder {
  archives: string[];
  plugins: string[];
}

let latest: ILoadOrder | undefined;

export function setLoadOrder(loadOrder: ILoadOrder) {
  latest = loadOrder;
}

/**
 * Writes the archives and plugins of the OpenMW page as the profile "Vortex" of launcher.cfg, makes
 * it the current profile and updates the data=, content= and fallback-archive= lines of openmw.cfg
 * to match.
 */
export async function exportLoadOrder(api: types.IExtensionApi): Promise<void> {
  const warn = (id: string, message: string) =>
    api.sendNotification?.({ id, type: "warning", message, displayMS: 6000 });

  const settingsDir: string = util.getSafe(api.getState(), ["settings", "openmw", "location"], "");
  if (settingsDir === "") {
    warn("openmw-export-no-location", "Set the 'OpenMW Settings Location' in the OpenMW tab of the settings first.");
    return;
  }
  if (latest === undefined) {
    warn("openmw-export-no-list", "The load order isn't ready yet, open the OpenMW page first.");
    return;
  }

  const file = path.join(settingsDir, "launcher.cfg");
  try {
    const text = await fs.readFile(file, "utf8");

    // the data= lines of the profile that was imported, or of the current one if nothing was imported
    const data = getImportedData() ?? parseActivePlugins(text).data;

    // the original is kept next to it the first time the file is changed
    const backup = `${file}.vortex-backup`;
    await fs.copyFile(file, backup, 1 /* COPYFILE_EXCL: don't overwrite an older backup */).catch(() => undefined);

    const content = { data, ...latest };
    await fs.writeFile(file, writeProfile(text, EXPORT_PROFILE, content), "utf8");

    // The launcher compares openmw.cfg with the current profile when it starts, and creates a new
    // profile from openmw.cfg if they differ, so that has to match the exported profile.
    const openmwFile = path.join(settingsDir, "openmw.cfg");
    let openmwText: string | undefined;
    try {
      openmwText = await fs.readFile(openmwFile, "utf8");
    } catch {
      warn("openmw-export-no-openmw-cfg", `No openmw.cfg found in '${settingsDir}', only launcher.cfg was updated.`);
    }
    if (openmwText !== undefined) {
      await fs.copyFile(openmwFile, `${openmwFile}.vortex-backup`, 1).catch(() => undefined);
      await fs.writeFile(openmwFile, writeOpenmwCfg(openmwText, content), "utf8");
    }
    // launcher.cfg names this profile as the current one now
    api.store?.dispatch(setCurrentProfile(EXPORT_PROFILE) as any);
    api.sendNotification?.({
      id: "openmw-export-done",
      type: "success",
      message: `Exported ${latest.plugins.length} plugin(s) and ${latest.archives.length} archive(s) to the profile '${EXPORT_PROFILE}', which is now the current profile.`,
      displayMS: 6000,
    });
  } catch (err) {
    api.showErrorNotification?.("Failed to write launcher.cfg", err as Error, { allowReport: false });
  }
}
