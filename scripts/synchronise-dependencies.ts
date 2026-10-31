/**
 * Makes the dependencies of this plugin match the ones of the installed Vortex.
 *
 *   pnpm synchronise-dependencies [--vortex <folder or Vortex.exe>] [--dry-run]
 *
 * 1. Finds resources/app.asar of the Vortex installation (default C:\Games\Vortex, or the
 *    VORTEX_PATH environment variable, or the --vortex argument).
 * 2. Deletes ./app-extracted and extracts the app there again, so it always holds the files of the
 *    installed Vortex (the bundled plugins and so on, to look things up in). With --dry-run nothing
 *    is extracted or changed, the package.json is just read from the archive and the changes are
 *    printed.
 * 3. Sets the versions in dependencies and devDependencies of ./package.json to the ones in the
 *    package.json of Vortex. Versions are written exactly (no ^ or ~), like they are pinned here.
 *    Packages Vortex doesn't have are left as they are, @types/* are only changed when the major
 *    version of their package differs from the one in Vortex.
 *
 * 4. Sets engines.vortex to the version of Vortex, keeping the operator that is there (>=2.9.1).
 *
 * Run `pnpm install` afterwards to get the new versions.
 */
import * as asar from "@electron/asar";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const DEFAULT_VORTEX = "C:\\Games\\Vortex";
const SECTIONS = ["dependencies", "devDependencies"] as const;

// the folder above scripts/, found from the path of the script (import.meta isn't available when
// tsc compiles the scripts folder as CommonJS)
const projectDir = path.resolve(path.dirname(process.argv[1] ?? "."), "..");
const extractedDir = path.join(projectDir, "app-extracted");
const packageFile = path.join(projectDir, "package.json");

type Dependencies = { [name: string]: string };

function parseArguments(argv: string[]): { vortex: string; dryRun: boolean } {
  let vortex = process.env["VORTEX_PATH"] ?? DEFAULT_VORTEX;
  let dryRun = false;
  for (let i = 0; i < argv.length; ++i) {
    if (argv[i] === "--dry-run") dryRun = true;
    else if (argv[i] === "--vortex") vortex = argv[++i] ?? vortex;
    else throw new Error(`Unknown argument '${argv[i]}'`);
  }
  // the path of Vortex.exe works as well as the one of its folder
  if (path.extname(vortex).toLowerCase() === ".exe") vortex = path.dirname(vortex);
  return { vortex, dryRun };
}

/**
 * A plain version from what package.json of Vortex says. That is the version as it is, apart from
 * the peer dependencies pnpm adds in brackets (react-bootstrap@0.33.1(react@18.3.1)) and range
 * characters. `undefined` for anything that isn't a version (a link, a git url, a range).
 */
function plainVersion(spec: string): string | undefined {
  const version = spec.replace(/\(.*$/, "").replace(/^[\^~=v]+/, "").trim();
  return /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version) ? version : undefined;
}

const major = (version: string): number => parseInt(version.split(".")[0] ?? "0", 10);

/** Highest version of a package at npm within a major version, `undefined` if that can't be found. */
function latestWithinMajor(name: string, majorVersion: number): string | undefined {
  const result = spawnSync("npm", ["view", `${name}@${majorVersion}`, "version", "--json"], {
    encoding: "utf8",
    shell: true,
  });
  if (result.status !== 0 || result.stdout.trim() === "") return undefined;
  const found: string | string[] = JSON.parse(result.stdout);
  const versions = (Array.isArray(found) ? found : [found]).filter((v) => !v.includes("-"));
  const numeric = (v: string) => v.split(".").map((n) => parseInt(n, 10));
  versions.sort((lhs, rhs) => {
    const [a, b] = [numeric(lhs), numeric(rhs)];
    return (a[0]! - b[0]!) || (a[1]! - b[1]!) || (a[2]! - b[2]!);
  });
  return versions[versions.length - 1];
}

function main() {
  const { vortex, dryRun } = parseArguments(process.argv.slice(2));
  const archive = path.join(vortex, "resources", "app.asar");
  if (!fs.existsSync(archive)) {
    throw new Error(`Can't find ${archive}, use --vortex <folder of Vortex> or set VORTEX_PATH`);
  }
  console.log(`Vortex: ${vortex}`);

  let vortexPackage: { version?: string } & { [section: string]: unknown };
  if (dryRun) {
    vortexPackage = JSON.parse(asar.extractFile(archive, "package.json").toString("utf8"));
  } else {
    // only ever deletes the folder of the extracted app inside of this project
    if (path.basename(extractedDir) !== "app-extracted") throw new Error("Unexpected folder");
    console.log(`Extracting ${archive} to ${extractedDir} ...`);
    fs.rmSync(extractedDir, { recursive: true, force: true });
    asar.extractAll(archive, extractedDir);
    vortexPackage = JSON.parse(fs.readFileSync(path.join(extractedDir, "package.json"), "utf8"));
  }
  console.log(`Vortex version: ${vortexPackage.version}\n`);

  // what Vortex has, the dependencies first as they are what is installed
  const vortexVersions: Dependencies = {};
  for (const section of ["devDependencies", "peerDependencies", "optionalDependencies", "dependencies"]) {
    Object.assign(vortexVersions, (vortexPackage[section] as Dependencies | undefined) ?? {});
  }

  const raw = fs.readFileSync(packageFile, "utf8");
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const indent = /^(\s+)"/m.exec(raw)?.[1] ?? "  ";
  const ours = JSON.parse(raw);

  const changes: string[] = [];
  const notes: string[] = [];
  for (const section of SECTIONS) {
    const dependencies: Dependencies = ours[section] ?? {};
    for (const [name, current] of Object.entries(dependencies)) {
      const spec = vortexVersions[name];
      let wanted: string | undefined;

      if (spec !== undefined) {
        wanted = plainVersion(spec);
        if (wanted === undefined) notes.push(`${name}: Vortex has '${spec}', which isn't a version, left as it is`);
      } else if (name.startsWith("@types/") && vortexVersions[name.slice(7)] !== undefined) {
        // the types of a package Vortex has: they need the same major version
        const target = plainVersion(vortexVersions[name.slice(7)]!);
        const own = plainVersion(current);
        if (target !== undefined && own !== undefined && major(target) !== major(own)) {
          wanted = latestWithinMajor(name, major(target));
          if (wanted === undefined) {
            notes.push(`${name}: needs a ${major(target)}.x version for ${name.slice(7)} ${target}, none found (offline?)`);
          }
        }
      } else if (name !== "@nexusmods/vortex-api") {
        notes.push(`${name}: not used by Vortex, left as it is`);
      }

      if (wanted !== undefined && wanted !== plainVersion(current)) {
        changes.push(`${section}: ${name} ${current} -> ${wanted}`);
        dependencies[name] = wanted;
      }
    }
  }

  // the version of Vortex the plugin needs, the same operator as before (">=" if there was none)
  if (typeof vortexPackage.version === "string") {
    const current: string | undefined = ours.engines?.vortex;
    const operator = (current !== undefined ? /^[^\d]*/.exec(current)?.[0] : "") || ">=";
    const wanted = `${operator}${vortexPackage.version}`;
    if (wanted !== current) {
      changes.push(`engines: vortex ${current ?? "(none)"} -> ${wanted}`);
      ours.engines = { ...ours.engines, vortex: wanted };
    }
  } else {
    notes.push("engines: package.json of Vortex has no version, left as it is");
  }

  console.log(changes.length > 0 ? `Changes:\n  ${changes.join("\n  ")}` : "Everything is up to date.");
  if (notes.length > 0) console.log(`\nNotes:\n  ${notes.join("\n  ")}`);

  if (changes.length === 0) return;
  if (dryRun) {
    console.log("\nDry run, package.json wasn't changed.");
    return;
  }
  fs.writeFileSync(
    packageFile,
    JSON.stringify(ours, undefined, indent).replace(/\n/g, eol) + (raw.endsWith("\n") ? eol : ""),
  );
  console.log("\npackage.json updated, run `pnpm install` to get the new versions.");
}

main();
