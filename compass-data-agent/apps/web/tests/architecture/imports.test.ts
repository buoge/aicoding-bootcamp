import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { it, expect } from "vitest";
const source = fileURLToPath(new URL("../../src/", import.meta.url));
async function files(directory: string): Promise<string[]> {
  return (
    await Promise.all(
      (await readdir(directory, { withFileTypes: true })).map((entry) =>
        entry.isDirectory()
          ? files(path.join(directory, entry.name))
          : [path.join(directory, entry.name)],
      ),
    )
  ).flat();
}
function violation(file: string, dependency: string) {
  const sourceModule = file.match(/^server\/modules\/([^/]+)\//)?.[1];
  const resolved = dependency.startsWith(".")
    ? path.posix.normalize(path.posix.join(path.posix.dirname(file), dependency))
    : dependency.startsWith("@/")
      ? dependency.slice(2)
      : dependency;
  const target = resolved.match(/^server\/modules\/([^/]+)\//)?.[1];
  if (sourceModule && target && sourceModule !== target && !resolved.endsWith("/public"))
    return "cross-module private import";
  if (
    file.includes("/domain/") &&
    (/^(next|pg|server-only|node:)/.test(dependency) ||
      /\/(application|infrastructure|composition)(\/|$)/.test(resolved))
  )
    return "domain depends on framework or adapter";
  if (
    file.includes("/application/") &&
    (/^(next|pg|server-only)/.test(dependency) || resolved.includes("/infrastructure/"))
  )
    return "application depends on adapter";
  if (/^(components|features|client|app)\//.test(file) && resolved.includes("server/modules/"))
    return "UI bypasses composition";
  if (
    /^(components|features)\//.test(file) &&
    file !== "components/shell/app-link.tsx" &&
    dependency === "next/link"
  )
    return "product links must use AppLink for unsaved-change confirmation";
  return null;
}
it("rejects examples that break module boundaries", () => {
  expect(
    violation(
      "server/modules/access/application/service.ts",
      "../../identity/infrastructure/pg-identity",
    ),
  ).toBeTruthy();
  expect(violation("server/modules/access/domain/policy.ts", "pg")).toBeTruthy();
  expect(violation("components/form.tsx", "@/server/modules/access/public")).toBeTruthy();
  expect(violation("features/organization/pages.tsx", "next/link")).toBeTruthy();
  expect(violation("components/shell/app-link.tsx", "next/link")).toBeNull();
  expect(
    violation("server/modules/access/application/service.ts", "../../identity/public"),
  ).toBeNull();
});
it("keeps application rules independent and cross-module dependencies public", async () => {
  const errors: string[] = [];
  for (const absolute of await files(source)) {
    if (!/\.[cm]?[jt]sx?$/.test(absolute) || absolute.includes("/generated/")) continue;
    const file = path.relative(source, absolute).split(path.sep).join("/");
    const text = await readFile(absolute, "utf8");
    for (const match of text.matchAll(/(?:from\s+|import\s*)["']([^"']+)["']/g)) {
      const reason = violation(file, match[1]);
      if (reason) errors.push(`${file}: ${match[1]} (${reason})`);
    }
  }
  expect(errors).toEqual([]);
});
