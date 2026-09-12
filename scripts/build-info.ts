import * as fs from "fs";

const packageJson = JSON.parse(fs.readFileSync("./package.json", "utf8"));

const info: object = {
  name: packageJson.name,
  version: packageJson.version,
  author: packageJson.author,
  description: packageJson.description
};

fs.writeFileSync(
  "./dist/src/info.json",
  JSON.stringify(info, undefined, 2)
);
