/** Plugins of the base game, always the first external ones whatever launcher.cfg says. */
export const DEFAULT_PLUGINS = ["Morrowind.esm", "Tribunal.esm", "Bloodmoon.esm"];

/** Archives of the base game, always the first ones whatever launcher.cfg says. */
export const DEFAULT_ARCHIVES = ["Morrowind.bsa", "Tribunal.bsa", "Bloodmoon.bsa"];

export const isDefault = (defaults: string[], name: string): boolean =>
  defaults.some((def) => def.toLowerCase() === name.toLowerCase());

/** The defaults followed by the rest of the list, without the entries that are a default. */
export function withDefaults(defaults: string[], list: string[]): string[] {
  return [...defaults, ...list.filter((name) => !isDefault(defaults, name))];
}
