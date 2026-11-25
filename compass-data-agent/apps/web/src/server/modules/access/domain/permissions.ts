import { reject } from "../../../platform/errors.ts";

export const PERMISSION_CATALOG_VERSION = "1";
export type GrantScope = "tenant" | "workspace";
const entries = [
  ["module.analysis", "分析入口", "both"],
  ["module.reports", "报告入口", "both"],
  ["module.plugins", "插件入口", "both"],
  ["module.automations", "定时任务入口", "both"],
  ["module.boards", "看板入口", "both"],
  ["module.admin.overview", "控制总览入口", "both"],
  ["module.admin.data", "数据与语义入口", "both"],
  ["module.admin.capabilities", "Agent 与能力入口", "both"],
  ["module.admin.runs", "运行与调度入口", "both"],
  ["module.admin.quality", "质量与发布入口", "both"],
  ["module.admin.security", "安全与审计入口", "both"],
  ["module.admin.memory", "记忆与资产入口", "both"],
  ["module.admin.organization", "组织设置入口", "tenant"],
  ["workspaces.read", "查看空间", "both"],
  ["workspaces.write", "管理空间", "tenant"],
  ["members.read", "查看成员", "tenant"],
  ["members.write", "管理成员与权限（管理员保留）", "reserved"],
  ["settings.read", "查看租户设置", "tenant"],
  ["settings.write", "修改租户设置", "tenant"],
  ["roles.read", "查看权限目录与模板", "tenant"],
  ["overview.read", "查看总览数据", "both"],
  ["audit.read", "读取审计", "both"],
  ["audit.export", "导出审计", "both"],
] as const;

export type Permission = (typeof entries)[number][0];
export const PERMISSION_IDS = entries.map(([id]) => id);
export const PERMISSION_CATALOG = entries.map(([id, label, scope]) => ({
  id,
  label,
  scopes: (scope === "both" ? ["tenant", "workspace"] : ["tenant"]) as GrantScope[],
  personalGrantable: scope !== "reserved",
}));
export const PERMISSION_BY_ID = new Map(PERMISSION_CATALOG.map((rule) => [rule.id, rule]));
export type TenantRole = "admin" | "member";
export type WorkspaceRole = "analyst" | "viewer" | "auditor";
export const DEFAULT_TEMPLATES: Record<WorkspaceRole, readonly Permission[]> = {
  analyst: [
    "module.analysis",
    "module.reports",
    "module.plugins",
    "module.automations",
    "module.boards",
    "workspaces.read",
  ],
  viewer: ["module.reports", "module.boards", "workspaces.read"],
  auditor: [
    "module.admin.overview",
    "module.admin.security",
    "workspaces.read",
    "overview.read",
    "audit.read",
  ],
};

export function normalizePermissions(input: readonly string[], scope: GrantScope): Permission[] {
  if (input.length > PERMISSION_IDS.length) reject("validation_failed", "权限数量超过目录上限。");
  for (const id of input) {
    const rule = PERMISSION_BY_ID.get(id as Permission);
    if (!rule?.personalGrantable || !rule.scopes.includes(scope)) {
      reject("validation_failed", "权限不存在、属于其他范围或保留给管理员。");
    }
  }
  return [...new Set(input)].sort() as Permission[];
}
