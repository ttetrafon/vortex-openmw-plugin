import { promises as fs } from "fs";
import path from "path";

const PLUGIN_EXTENSIONS = [".esm", ".esp", ".omwaddon", ".omwscripts", ".omwscript"];
const ADDON_EXTENSION = ".omwaddon";
const SCRIPT_EXTENSIONS = [".omwscripts", ".omwscript"];

interface IScanResult {
  /** staging folder the result belongs to, a different one means the mod changed */
  dir: string;
  /** plugin files relative to the staging folder, with "/" as separator */
  plugins: string[];
}

const results = new Map<string, IScanResult>();
const pending = new Map<string, Promise<IScanResult>>();

async function scan(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { recursive: true });
    return entries
      .filter((entry) => PLUGIN_EXTENSIONS.includes(path.extname(entry).toLowerCase()))
      .map((entry) => entry.split(path.sep).join("/"))
      .sort((lhs, rhs) => lhs.localeCompare(rhs));
  } catch {
    // staging folder missing or unreadable: no plugins to show
    return [];
  }
}

/** Plugin files found in the staging folder of the mod, `undefined` while that isn't known yet. */
export function getCachedPlugins(modId: string): string[] | undefined {
  return results.get(modId)?.plugins;
}

/** Looks for the plugin files in the staging folder of a mod, the result is cached per mod. */
export function scanMod(modId: string, dir: string): Promise<string[]> {
  const cached = results.get(modId);
  if (cached !== undefined && cached.dir === dir) {
    return Promise.resolve(cached.plugins);
  }
  const key = `${modId}|${dir}`;
  let running = pending.get(key);
  if (running === undefined) {
    running = scan(dir).then((plugins) => {
      const result = { dir, plugins };
      results.set(modId, result);
      pending.delete(key);
      return result;
    });
    pending.set(key, running);
  }
  return running.then((result) => result.plugins);
}

/** Forget what was found for a mod, e.g. because it was installed again. */
export function forgetMod(modId: string) {
  results.delete(modId);
}

/** Plugin file name without folders. */
export function pluginBaseName(plugin: string): string {
  return plugin.slice(plugin.lastIndexOf("/") + 1);
}

/** Every .omwaddon loads before the .omwscripts with the same name (ignoring folders and case). */
export function defaultPluginRules(plugins: string[]): { [plugin: string]: string[] } {
  const stem = (plugin: string) => path.parse(pluginBaseName(plugin)).name.toLowerCase();
  const ext = (plugin: string) => path.extname(plugin).toLowerCase();
  const rules: { [plugin: string]: string[] } = {};
  plugins
    .filter((plugin) => SCRIPT_EXTENSIONS.includes(ext(plugin)))
    .forEach((script) => {
      const addons = plugins.filter((p) => ext(p) === ADDON_EXTENSION && stem(p) === stem(script));
      if (addons.length > 0) {
        rules[script] = addons;
      }
    });
  return rules;
}
