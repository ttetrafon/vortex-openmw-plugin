import { types, util } from "@nexusmods/vortex-api";
import { promises as fs } from "fs";
import path from "path";

import { EXPORT_PROFILE } from "./exportLoadOrder";
import { importLoadOrder } from "./importLoadOrder";
import { hasProfile, removeProfile } from "./launcherCfg";

/** The profile OpenMW has from the start, it becomes the current one again after the delete. */
const DEFAULT_PROFILE = "Default";

/**
 * Removes the profile "Vortex" from launcher.cfg, makes "Default" the current profile again (if
 * "Vortex" was the current one) and imports the load order of that profile.
 */
export async function deleteLoadOrder(api: types.IExtensionApi, gameId: string): Promise<void> {
  const settingsDir: string = util.getSafe(api.getState(), ["settings", "openmw", "location"], "");
  if (settingsDir === "") {
    api.sendNotification?.({
      id: "openmw-delete-no-location",
      type: "warning",
      message: "Set the 'OpenMW Settings Location' in the OpenMW tab of the settings first.",
      displayMS: 6000,
    });
    return;
  }

  const file = path.join(settingsDir, "launcher.cfg");
  try {
    const text = await fs.readFile(file, "utf8");
    if (!hasProfile(text, EXPORT_PROFILE)) {
      api.sendNotification?.({
        id: "openmw-delete-nothing",
        type: "info",
        message: `launcher.cfg has no '${EXPORT_PROFILE}' profile.`,
        displayMS: 6000,
      });
      return;
    }

    const answer = await api.showDialog?.(
      "question",
      "Delete the Vortex load order",
      {
        text:
          `This removes the profile '${EXPORT_PROFILE}' from launcher.cfg and goes back to the ` +
          `'${DEFAULT_PROFILE}' profile. This can't be undone.`,
      },
      [{ label: "Cancel" }, { label: "Delete", default: true }],
    );
    if (answer?.action !== "Delete") return;

    // the original is kept next to it the first time the file is changed
    await fs.copyFile(file, `${file}.vortex-backup`, 1 /* COPYFILE_EXCL */).catch(() => undefined);
    await fs.writeFile(file, removeProfile(text, EXPORT_PROFILE, DEFAULT_PROFILE), "utf8");
  } catch (err) {
    api.showErrorNotification?.("Failed to write launcher.cfg", err as Error, { allowReport: false });
    return;
  }

  api.sendNotification?.({
    id: "openmw-delete-done",
    type: "success",
    message: `The '${EXPORT_PROFILE}' profile was removed from launcher.cfg.`,
    displayMS: 6000,
  });
  // the load order of the profile that is current now
  await importLoadOrder(api, gameId);
}
