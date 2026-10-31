import { promises as fs } from "fs";
import path from "path";

export interface IActivePlugins {
  /** the profile named by `currentprofile`, `undefined` if the file doesn't have one */
  profile: string | undefined;
  /** the `<profile>/content=` entries of that profile in the order they appear, without duplicates */
  plugins: string[];
  /** the `<profile>/fallback-archive=` entries of that profile, in order and without duplicates */
  archives: string[];
  /** the `<profile>/data=` entries of that profile exactly as written (paths, maybe quoted), in order */
  data: string[];
}

/**
 * Reads the active plugins and archives from the text of launcher.cfg. The file looks like
 *
 *   [Profiles]
 *   currentprofile=Default
 *   Default/data=C:\Games\Steam\steamapps\common\Morrowind\Data Files
 *   Default/content=Morrowind.esm
 *   Default/content=Tribunal.esm
 *
 * Only the entries of the current profile count, any other profile in the file is ignored.
 */
export function parseActivePlugins(text: string): IActivePlugins {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);

  let profile: string | undefined;
  for (const line of lines) {
    const match = /^\s*currentprofile\s*=(.*)$/i.exec(line);
    if (match !== null) {
      profile = match[1]!.trim();
      break;
    }
  }
  if (profile === undefined || profile === "") {
    return { profile: undefined, plugins: [], archives: [], data: [] };
  }

  // the values of the entries named `<profile>/<key>`, in order. Values aren't changed when
  // `exact` is set, otherwise they are trimmed and repeated ones are left out.
  const valuesOf = (key: string, exact = false): string[] => {
    const wanted = `${profile}/${key}`.toLowerCase();
    const values: string[] = [];
    const seen = new Set<string>();
    for (const line of lines) {
      const eq = line.indexOf("=");
      if (eq === -1 || line.slice(0, eq).trim().toLowerCase() !== wanted) continue;
      if (exact) {
        values.push(line.slice(eq + 1));
        continue;
      }
      const value = line.slice(eq + 1).trim();
      if (value !== "" && !seen.has(value.toLowerCase())) {
        seen.add(value.toLowerCase());
        values.push(value);
      }
    }
    return values;
  };

  return {
    profile,
    plugins: valuesOf("content"),
    archives: valuesOf("fallback-archive"),
    data: valuesOf("data", true),
  };
}

/** Reads the active plugins of the current profile from the launcher.cfg in `settingsDir`. */
export async function readActivePlugins(settingsDir: string): Promise<IActivePlugins> {
  return parseActivePlugins(await fs.readFile(path.join(settingsDir, "launcher.cfg"), "utf8"));
}

/** What a profile of launcher.cfg is made of. */
export interface IProfileContent {
  /** `data=` values, written as they are */
  data: string[];
  archives: string[];
  plugins: string[];
}

/**
 * Returns the text of launcher.cfg with the profile `name` (re)written from `content` and made the
 * current profile. Everything else in the file stays as it is, apart from an older version of that
 * profile, which is replaced. The profile is written where the other profiles are, after the last
 * entry of the `[Profiles]` section.
 */
export function writeProfile(text: string, name: string, content: IProfileContent): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const hadBom = text.startsWith("\uFEFF");
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const endsWithEol = lines.length > 0 && lines[lines.length - 1] === "";
  if (endsWithEol) lines.pop();

  const prefix = `${name}/`.toLowerCase();
  const kept = lines.filter((line) => {
    const eq = line.indexOf("=");
    return !(eq !== -1 && line.slice(0, eq).trim().toLowerCase().startsWith(prefix));
  });

  const block = [
    ...content.archives.map((archive) => `${name}/fallback-archive=${archive}`),
    ...content.data.map((data) => `${name}/data=${data}`),
    ...content.plugins.map((plugin) => `${name}/content=${plugin}`),
  ];

  const header = kept.findIndex((line) => /^\s*\[profiles\]\s*$/i.test(line));
  if (header === -1) {
    // no profiles yet, add the section at the end
    if (kept.length > 0 && kept[kept.length - 1]!.trim() !== "") kept.push("");
    kept.push("[Profiles]", `currentprofile=${name}`, ...block);
  } else {
    let end = header + 1;
    let lastEntry = header;
    while (end < kept.length && !/^\s*\[/.test(kept[end]!)) {
      if (kept[end]!.trim() !== "") lastEntry = end;
      ++end;
    }
    kept.splice(lastEntry + 1, 0, ...block);

    const current = kept.findIndex(
      (line, idx) => idx > header && idx < end + block.length && /^\s*currentprofile\s*=/i.test(line),
    );
    if (current !== -1) {
      kept[current] = kept[current]!.replace(/=.*$/, `=${name}`);
    } else {
      kept.splice(header + 1, 0, `currentprofile=${name}`);
    }
  }

  return (hadBom ? "\uFEFF" : "") + kept.join(eol) + (endsWithEol ? eol : "");
}

/** Whether launcher.cfg has any entry of the profile `name`. */
export function hasProfile(text: string, name: string): boolean {
  const prefix = `${name}/`.toLowerCase();
  return text.split(/\r?\n/).some((line) => {
    const eq = line.indexOf("=");
    return eq !== -1 && line.slice(0, eq).trim().toLowerCase().startsWith(prefix);
  });
}

/**
 * Returns the text of launcher.cfg without any entry of the profile `name`. If that profile is the
 * current one, `fallback` becomes the current profile, otherwise the current profile isn't touched.
 */
export function removeProfile(text: string, name: string, fallback: string): string {
  const prefix = `${name}/`.toLowerCase();
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const isCurrent = new RegExp(`^\\s*currentprofile\\s*=\\s*${escaped}\\s*$`, "i");
  return text
    .split(/(?<=\n)/) // every line keeps its own line ending
    .filter((line) => {
      const eq = line.indexOf("=");
      return !(eq !== -1 && line.slice(0, eq).trim().toLowerCase().startsWith(prefix));
    })
    .map((line) =>
      isCurrent.test(line.replace(/\r?\n$/, "")) ? line.replace(/=[^\r\n]*/, `=${fallback}`) : line,
    )
    .join("");
}
