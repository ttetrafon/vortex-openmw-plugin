import { promises as fs } from "fs";
import path from "path";

const PLUGIN_EXTENSIONS = [".esm", ".esp", ".omwaddon", ".omwscripts"];
const ARCHIVE_EXTENSION = ".bsa";
const ADDON_EXTENSION = ".omwaddon";
const SCRIPT_EXTENSION = ".omwscripts";

interface IScanResult {
  /** staging folder the result belongs to, a different one means the mod changed */
  dir: string;
  /** plugin files relative to the staging folder, with "/" as separator */
  plugins: string[];
  /** archive (.bsa) files, relative to the staging folder with "/" as separator */
  archives: string[];
}

const results = new Map<string, IScanResult>();
const pending = new Map<string, Promise<IScanResult>>();

async function scan(dir: string): Promise<{ plugins: string[]; archives: string[] }> {
  try {
    const entries = (await fs.readdir(dir, { recursive: true }))
      .map((entry) => entry.split(path.sep).join("/"))
      .sort((lhs, rhs) => lhs.localeCompare(rhs));
    const withExtension = (extensions: string[]) =>
      entries.filter((entry) => extensions.includes(path.extname(entry).toLowerCase()));
    return { plugins: withExtension(PLUGIN_EXTENSIONS), archives: withExtension([ARCHIVE_EXTENSION]) };
  } catch {
    // staging folder missing or unreadable: nothing to show
    return { plugins: [], archives: [] };
  }
}

/** Whether a file name is the one of a plugin (.esm, .esp, .omwaddon, .omwscripts). */
export function isPluginFile(name: string): boolean {
  return PLUGIN_EXTENSIONS.includes(path.extname(name).toLowerCase());
}

/** Plugin files found in the staging folder of the mod, `undefined` while that isn't known yet. */
export function getCachedPlugins(modId: string): string[] | undefined {
  return results.get(modId)?.plugins;
}

/** Archive (.bsa) files found in the staging folder of the mod, `undefined` while that isn't known yet. */
export function getCachedArchives(modId: string): string[] | undefined {
  return results.get(modId)?.archives;
}

/**
 * Looks for the plugin files and archives in the staging folder of a mod, the result is cached per
 * mod. Resolves with the plugin files, the archives are available with getCachedArchives after that.
 */
export function scanMod(modId: string, dir: string): Promise<string[]> {
  const cached = results.get(modId);
  if (cached !== undefined && cached.dir === dir) {
    return Promise.resolve(cached.plugins);
  }
  const key = `${modId}|${dir}`;
  let running = pending.get(key);
  if (running === undefined) {
    running = scan(dir).then((found) => {
      const result = { dir, ...found };
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

/** Every .omwaddon loads before the .omwscriptss with the same name (ignoring folders and case). */
export function defaultPluginRules(plugins: string[]): { [plugin: string]: string[] } {
  const stem = (plugin: string) => path.parse(pluginBaseName(plugin)).name.toLowerCase();
  const ext = (plugin: string) => path.extname(plugin).toLowerCase();
  const rules: { [plugin: string]: string[] } = {};
  plugins
    .filter((plugin) => SCRIPT_EXTENSION.includes(ext(plugin)))
    .forEach((script) => {
      const addons = plugins.filter((p) => ext(p) === ADDON_EXTENSION && stem(p) === stem(script));
      if (addons.length > 0) {
        rules[script] = addons;
      }
    });
  return rules;
}

/**
 * The plugin files of one mod in load order: the rules saved for the mod, the defaults for plugins
 * that have none saved. Plugins without rules between them stay in alphabetical order.
 */
export function orderPlugins(
  plugins: string[],
  stored: { [plugin: string]: string[] } | undefined,
): string[] {
  const defaults = defaultPluginRules(plugins);
  const base = [...plugins].sort((lhs, rhs) =>
    pluginBaseName(lhs).toLowerCase().localeCompare(pluginBaseName(rhs).toLowerCase()),
  );
  const before = (plugin: string): string[] =>
    (stored?.[plugin] ?? defaults[plugin] ?? []).filter((p) => p !== plugin && plugins.includes(p));

  const done = new Set<string>();
  const ordered: string[] = [];
  while (ordered.length < base.length) {
    const next =
      base.find((p) => !done.has(p) && before(p).every((b) => done.has(b))) ??
      // a cycle in the rules, break it at the first remaining plugin
      base.find((p) => !done.has(p))!;
    done.add(next);
    ordered.push(next);
  }
  return ordered;
}
