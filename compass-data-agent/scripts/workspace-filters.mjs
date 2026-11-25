import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";

// pnpm owns workspace discovery, including custom globs and excluded directories.
export function workspacePackages(root) {
  const result = spawnSync("pnpm", ["--recursive", "list", "--depth", "-1", "--json"], {
    cwd: root,
    encoding: "utf8",
    timeout: 15000,
  });
  if (result.status !== 0)
    throw new Error(
      "Cannot discover workspace packages; run pnpm install and check pnpm-workspace.yaml.",
    );
  const packages = JSON.parse(result.stdout);
  if (!Array.isArray(packages)) throw new Error("Invalid pnpm workspace package list.");
  const workspaceRoot = realpathSync(root);
  return packages.filter(
    (pkg) =>
      typeof pkg.name === "string" &&
      typeof pkg.path === "string" &&
      realpathSync(pkg.path) !== workspaceRoot,
  );
}

export function resolveWorkspaceFilters(args, getPackages) {
  let packages;
  function resolve(selector) {
    // Leave paths, scopes, globs and compound Turbo selectors untouched.
    const match = /^(!?)([a-zA-Z0-9][a-zA-Z0-9_-]*(?:\.[a-zA-Z0-9_-]+)*)$/.exec(selector);
    if (!match) return selector;
    const [, exclude, name] = match;
    packages ??= getPackages();
    const matches = packages.filter((pkg) => pkg.name.split("/").at(-1) === name);
    if (matches.length === 0)
      throw new Error(
        `Unknown workspace short name '${name}'. Check the package name or use a full package name/path.`,
      );
    if (matches.length > 1)
      throw new Error(
        `Ambiguous workspace short name '${name}': ${matches.map((pkg) => pkg.name).join(", ")}. Use a full package name; new apps must have unique short names.`,
      );
    return exclude + matches[0].name;
  }

  const resolved = [...args];
  for (let i = 0; i < resolved.length; i++) {
    const arg = resolved[i];
    if (arg === "--") break; // Everything after this belongs to the app.
    if (arg === "-F" || arg === "--filter") {
      if (resolved[i + 1] !== undefined && !resolved[i + 1].startsWith("-")) {
        i += 1;
        resolved[i] = resolve(resolved[i]);
      }
    } else if (arg.startsWith("--filter=")) {
      resolved[i] = "--filter=" + resolve(arg.slice("--filter=".length));
    } else if (arg.startsWith("-F=")) {
      resolved[i] = "-F=" + resolve(arg.slice(3));
    } else if (arg.startsWith("-F") && arg.length > 2) {
      resolved[i] = "-F" + resolve(arg.slice(2));
    }
  }
  return resolved;
}
