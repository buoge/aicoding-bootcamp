import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { navigation, analysisCases } from "../src/lib/content.ts";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
test("all navigation destinations and twelve prototype scenario deep links exist", () => {
  assert.equal(navigation.length, 6);
  for (const page of navigation)
    assert.ok(existsSync(path.join(app, "src/app", page.href, "page.tsx")), page.href);
  const prototype = path.resolve(
    app,
    "../../mai-specs/999-compass-product-course-landing-app/design/prototype/scenarios.js",
  );
  const distributed = path.join(app, "reference/design/prototype/scenarios.js");
  const source = readFileSync(existsSync(distributed) ? distributed : prototype, "utf8");
  for (const [n] of analysisCases)
    assert.ok(source.includes(`S${n}`), `Missing prototype case S${n}`);
});
