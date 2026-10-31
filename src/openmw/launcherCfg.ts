import { promises as fs } from "fs";
import path from "path";

export interface IActivePlugins {
  /** the profile named by `currentprofile`, `undefined` if the file doesn't have one */
  profile: string | undefined;
  /** the `<profile>/content=` entries of that profile in the order they appear, without duplicates */
  plugins: string[];
  /** the `<profile>/fallback-archive=` entries of that profile, in order and without duplicates */
  archives: string[];
}

/**
 * Reads the active plugins and archives from the text of launcher.cfg. The file looks like
 *
 *   [Profiles]
 *   currentprofile=Default
 *   Default/content=Morrowind.esm
 *   Default/content=Tribunal.esm
 *
 * Only the entries of the current profile count, any other profile in the file is ignored.
 */
export function parseActivePlugins(text: string): IActivePlugins {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);

  let profile: string | undefined;
  for (const line of lines) {
    const match = /^\s*currentprofile\s*=(.*)$/i.exec(line);
    if (match !== null) {
      profile = match[1]!.trim();
      break;
    }
  }
  if (profile === undefined || profile === "") {
    return { profile: undefined, plugins: [], archives: [] };
  }

  // the values of the entries named `<profile>/<key>`, in order and without duplicates
  const valuesOf = (key: string): string[] => {
    const wanted = `${profile}/${key}`.toLowerCase();
    const values: string[] = [];
    const seen = new Set<string>();
    for (const line of lines) {
      const eq = line.indexOf("=");
      if (eq === -1 || line.slice(0, eq).trim().toLowerCase() !== wanted) continue;
      const value = line.slice(eq + 1).trim();
      if (value !== "" && !seen.has(value.toLowerCase())) {
        seen.add(value.toLowerCase());
        values.push(value);
      }
    }
    return values;
  };

  return { profile, plugins: valuesOf("content"), archives: valuesOf("fallback-archive") };
}

/** Reads the active plugins of the current profile from the launcher.cfg in `settingsDir`. */
export async function readActivePlugins(settingsDir: string): Promise<IActivePlugins> {
  return parseActivePlugins(await fs.readFile(path.join(settingsDir, "launcher.cfg"), "utf8"));
}
