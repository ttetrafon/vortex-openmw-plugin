import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const projectDir = path.resolve(path.dirname(process.argv[1] ?? "."), "..");
const sourceDir = path.join(projectDir, "dist", "src");
const REQUIRED = ["index.js", "info.json"];
const EXCLUDED = ["*.d.ts", "*.map"];

function main() {
  const packageJson = JSON.parse(fs.readFileSync(path.join(projectDir, "package.json"), "utf8"));
  const archive = path.join(projectDir, "dist", `${packageJson.name}-v${packageJson.version}.7z`);

  const missing = REQUIRED.filter((file) => !fs.existsSync(path.join(sourceDir, file)));
  if (missing.length > 0) {
    throw new Error(
      `${missing.join(" and ")} missing in ${sourceDir}, run 'pnpm build' and 'pnpm build-info' first`,
    );
  }

  // the version of info.json is the one Vortex shows, and it has to be the one entered at Nexus
  const info = JSON.parse(fs.readFileSync(path.join(sourceDir, "info.json"), "utf8"));
  if (info.version !== packageJson.version) {
    throw new Error(
      `info.json has version ${info.version}, package.json has ${packageJson.version}, run 'pnpm build-info' first`,
    );
  }

  // 7z adds to an archive that exists, which would keep files that are gone from dist/src
  fs.rmSync(archive, { force: true });

  // run in dist/src with "*" (7z expands that itself), otherwise the archive would have dist/src as
  // a folder in it
  const excludes = EXCLUDED.map((pattern) => `-xr!${pattern}`);
  const result = spawnSync("7z", ["a", "-t7z", "-mx=9", ...excludes, archive, "*"], {
    cwd: sourceDir,
    stdio: "inherit",
  });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(`7z failed${result.error ? `: ${result.error.message}` : ` with code ${result.status}`}`);
  }

  const size = fs.statSync(archive).size;
  console.log(`\n${archive}\n${(size / 1024).toFixed(1)} KB, version ${info.version}`);
}

try {
  main();
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
}
