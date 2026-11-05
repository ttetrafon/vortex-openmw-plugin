import { promises as fs } from "fs";
import path from "path";

import { isPluginFile } from "../plugins/scan";

/**
 * The folders of the `data=` lines of launcher.cfg, which hold the files OpenMW loads. The values
 * are paths, sometimes in quotes. Entries that aren't a plain path (like ?userdata?) are skipped.
 */
export function dataDirectories(data: string[]): string[] {
  return data
    .map((value) => value.trim().replace(/^"(.*)"$/, "$1").trim())
    .filter((dir) => dir !== "" && !dir.startsWith("?"));
}

/** The value of the last line `key=value` of an openmw.cfg (quotes removed), if there is one. */
function lastValue(config: string, key: string): string | undefined {
  let value: string | undefined;
  for (const line of config.split(/\r?\n/)) {
    const eq = line.indexOf("=");
    if (eq !== -1 && line.slice(0, eq).trim().toLowerCase() === key) {
      value = line.slice(eq + 1).trim().replace(/^"(.*)"$/, "$1");
    }
  }
  return value;
}

/**
 * The local data folder of OpenMW, which isn't a `data=` line of launcher.cfg but is always used
 * (the launcher shows it after the other data folders). By default it is `data` in the user data
 * folder, which is the folder of launcher.cfg and openmw.cfg, `Documents/My Games/OpenMW` on
 * Windows. openmw.cfg can change it with `data-local=` and the user data folder with `userdata=`.
 */
export async function localDataDirectory(settingsDir: string): Promise<string> {
  let config = "";
  try {
    config = await fs.readFile(path.join(settingsDir, "openmw.cfg"), "utf8");
  } catch {
    // no openmw.cfg: the defaults apply
  }
  const userData = lastValue(config, "userdata") ?? settingsDir;
  // ?userdata? and ?config? stand for folders in paths of openmw.cfg
  const resolve = (value: string): string =>
    value.replace(/^\?userdata\?[\\/]*/i, `${userData}${path.sep}`).replace(/^\?config\?[\\/]*/i, `${settingsDir}${path.sep}`);
  return path.normalize(resolve(lastValue(config, "data-local") ?? path.join(userData, "data")));
}

/**
 * The plugin files (.esm, .esp, .omwaddon, .omwscripts) in the data folders, in the order of the
 * folders and by name within a folder. OpenMW only loads plugins that lie directly in a data
 * folder, so the folders below are not searched. A file name found in several folders is listed
 * once. `unreadable` are the folders that couldn't be read, for example because they don't exist.
 */
export async function scanDataDirectories(
  dirs: string[],
): Promise<{ plugins: string[]; unreadable: string[] }> {
  const plugins: string[] = [];
  const unreadable: string[] = [];
  const seen = new Set<string>();
  for (const dir of dirs) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      unreadable.push(dir);
      continue;
    }
    entries
      // mods can be deployed as links, which are files as far as OpenMW is concerned
      .filter((entry) => (entry.isFile() || entry.isSymbolicLink()) && isPluginFile(entry.name))
      .map((entry) => entry.name)
      .sort((lhs, rhs) => lhs.toLowerCase().localeCompare(rhs.toLowerCase()))
      .forEach((name) => {
        if (!seen.has(name.toLowerCase())) {
          seen.add(name.toLowerCase());
          plugins.push(name);
        }
      });
  }
  return { plugins, unreadable };
}
