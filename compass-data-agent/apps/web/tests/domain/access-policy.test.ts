import { describe, it, expect } from "vitest";
import {
  allowed,
  allowedWorkspaceIds,
  effectivePermissions,
  requireRemainingAdministrator,
  type CurrentAccess,
} from "../../src/server/modules/access/domain/access-policy";
import {
  normalizePermissions,
  DEFAULT_TEMPLATES,
} from "../../src/server/modules/access/domain/permissions";
import { safeReturnPath, PAGE_CATALOG, matchPage, pageUrl } from "../../src/lib/page-catalog";
const access: CurrentAccess = {
  tenantId: "tenant",
  memberId: "member",
  role: "member",
  authzVersion: "1",
  tenantPermissions: ["module.reports"],
  workspacePermissions: new Map([
    ["A", ["audit.read"]],
    ["B", ["audit.export"]],
  ]),
};
describe("personal permission rules", () => {
  it("uses explicit allow lists and never combines export grants from different spaces", () => {
    expect(
      allowed(access, "module.reports", { tenantId: "tenant", workspaceId: "new-space" }),
    ).toBe(true);
    expect(allowedWorkspaceIds(access, ["audit.read", "audit.export"])).toEqual([]);
    expect(allowed(access, "audit.read", { tenantId: "other", workspaceId: "A" })).toBe(false);
    expect(
      effectivePermissions(
        { ...access, tenantPermissions: [], workspacePermissions: new Map([["A", []]]) },
        { tenantId: "tenant", workspaceId: "A" },
      ),
    ).toEqual([]);
    expect(DEFAULT_TEMPLATES.analyst).toContain("module.analysis");
  });
  it("normalizes bounded grants and reserves administrator operations", () => {
    expect(
      normalizePermissions(["audit.read", "module.analysis", "audit.read"], "workspace"),
    ).toEqual(["audit.read", "module.analysis"]);
    for (const input of [["members.write"], ["settings.write"], ["future.execute"]])
      expect(() => normalizePermissions(input, "workspace")).toThrow();
    expect(allowed(access, "members.write", { tenantId: "tenant" })).toBe(false);
    expect(allowed({ ...access, role: "admin" }, "members.write", { tenantId: "tenant" })).toBe(
      true,
    );
    expect(
      allowed({ ...access, role: "admin" }, "members.write", {
        tenantId: "tenant",
        workspaceId: "A",
      }),
    ).toBe(false);
    expect(() => requireRemainingAdministrator(0)).toThrow();
    expect(() => requireRemainingAdministrator(1)).not.toThrow();
  });
  it("registers every prototype tab and rejects external or ambiguous return paths", () => {
    expect(new Set(PAGE_CATALOG.map((p) => p.id)).size).toBe(PAGE_CATALOG.length);
    const scope = {
      tenantId: "99500000-0000-4000-8000-000000000010",
      workspaceId: "99500000-0000-4000-8000-000000000020",
    };
    for (const page of PAGE_CATALOG) {
      const url = pageUrl(page, scope)!;
      expect(matchPage(url)?.page.id).toBe(page.id);
    }
    for (const path of [
      "https://evil.invalid",
      "//evil.invalid",
      "/\\evil",
      "/%2f%2fevil",
      "/auth/callback",
      "/settings/profile\n",
    ])
      expect(safeReturnPath(path)).toBeNull();
    expect(safeReturnPath("/settings/profile")).toBe("/settings/profile");
  });
});
