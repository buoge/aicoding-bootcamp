import { mkdir, readdir, copyFile, rm, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseBusinessSchema } from "./business-schema.mjs";
import { parseSystemSchema } from "./system-schema.mjs";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distributedSource = path.join(app, "reference");
const feature = existsSync(distributedSource)
  ? distributedSource
  : path.resolve(app, "../../mai-specs/999-compass-product-course-landing-app");
// A derived distribution copy. The Feature remains the editable canonical source.
const prototype = path.join(app, "public/prototype");
const entries = await readdir(path.join(feature, "design/prototype"), { withFileTypes: true });
await rm(prototype, { recursive: true, force: true });
await mkdir(prototype, { recursive: true });
for (const entry of entries) {
  if (entry.isFile() && /\.(html|css|js)$/.test(entry.name)) {
    await copyFile(
      path.join(feature, "design/prototype", entry.name),
      path.join(prototype, entry.name),
    );
  }
}
const resources = path.join(app, "public/resources");
await mkdir(resources, { recursive: true });
await copyFile(
  path.join(feature, "context/dataagent-tech-stack/visuals/system-architecture.png"),
  path.join(resources, "system-architecture.png"),
);
const businessDesign = existsSync(distributedSource)
  ? path.join(distributedSource, "business-data")
  : path.resolve(app, "../../mai-specs/998-business-data-seeding-tool/design");
const [sql, design] = await Promise.all([
  readFile(path.join(businessDesign, "business-schema.sql"), "utf8"),
  readFile(path.join(businessDesign, "TECH_DESIGN.md"), "utf8"),
]);
await writeFile(
  path.join(resources, "business-schema.json"),
  JSON.stringify(parseBusinessSchema(sql, design)),
);
const systemDesign = await readFile(path.join(feature, "design/data-model.md"), "utf8");
await writeFile(
  path.join(resources, "system-schema.json"),
  JSON.stringify(parseSystemSchema(systemDesign)),
);
await writeFile(path.join(resources, "system-data-model.md"), systemDesign);
console.log(
  "Prepared prototype, architecture image and canonical business/system schema distribution copies.",
);
