import type { Permission } from "../contracts/authorization";

export type PageSpec = {
  id: string;
  title: string;
  section: string;
  sectionTitle: string;
  path: string;
  scopeKind: "tenant" | "workspace" | "self" | "platform";
  permission?: Permission;
  readPermission?: Permission;
  aggregate?: boolean;
  kind: "placeholder" | "implemented";
};
const pages: PageSpec[] = [];
function group(
  section: string,
  sectionTitle: string,
  scopeKind: PageSpec["scopeKind"],
  permission: Permission | undefined,
  entries: readonly (readonly [string, string, string, PageSpec["kind"]?])[],
) {
  for (const [id, title, path, kind = "placeholder"] of entries)
    pages.push({ id, title, path, section, sectionTitle, scopeKind, permission, kind });
}
group("analysis", "分析", "workspace", "module.analysis", [
  ["analysis-new", "新建分析", "analysis"],
]);
group("reports", "报告空间", "workspace", "module.reports", [
  ["reports-all", "全部产物", "reports"],
  ["reports-documents", "分析报告", "reports/reports"],
  ["reports-charts", "图表与视图", "reports/charts"],
  ["reports-data", "数据结果", "reports/data"],
]);
group("plugins", "插件", "workspace", "module.plugins", [
  ["plugins-all", "全部插件", "plugins"],
  ["plugins-skills", "Skill", "plugins/skills"],
  ["plugins-prompts", "Prompt", "plugins/prompts"],
  ["plugins-agents", "Agent", "plugins/agents"],
  ["plugins-templates", "报告模板", "plugins/report-templates"],
  ["plugins-datasets", "数据集", "plugins/datasets"],
]);
group("automations", "定时任务", "workspace", "module.automations", [
  ["automations-all", "全部任务", "automations"],
  ["automations-new", "新建定时任务", "automations/new"],
  ["automations-history", "执行记录", "automations/history"],
]);
group("boards", "看板", "workspace", "module.boards", [
  ["boards-overview", "经营总览", "boards/overview"],
  ["boards-channels", "渠道表现", "boards/channels"],
  ["boards-inventory", "库存健康", "boards/inventory"],
]);
group("admin-overview", "控制总览", "tenant", "module.admin.overview", [
  ["admin-overview", "控制总览", "admin/overview", "implemented"],
]);
group("data", "数据与语义", "workspace", "module.admin.data", [
  ["data-sources", "数据连接", "admin/data/sources"],
  ["data-catalog", "数据目录", "admin/data/catalog"],
  ["data-metrics", "指标口径", "admin/data/metrics"],
  ["data-queries", "可信查询", "admin/data/queries"],
  ["data-quality", "数据质量", "admin/data/quality"],
  ["data-documents", "知识文档", "admin/data/documents"],
]);
group("capabilities", "Agent 与能力", "workspace", "module.admin.capabilities", [
  ["capabilities-agent", "主 Agent", "admin/capabilities/agent"],
  ["capabilities-tools", "工具策略", "admin/capabilities/tools"],
  ["capabilities-skills", "Skill 与流程", "admin/capabilities/skills"],
  ["capabilities-models", "模型路由", "admin/capabilities/models"],
  ["capabilities-sandbox", "代码环境", "admin/capabilities/sandbox"],
  ["capabilities-hitl", "协同策略", "admin/capabilities/hitl"],
]);
group("runs", "运行与调度", "workspace", "module.admin.runs", [
  ["runs-tasks", "运行任务", "admin/runs/tasks"],
  ["runs-queue", "配额与队列", "admin/runs/queue"],
  ["runs-budget", "预算与成本", "admin/runs/budget"],
  ["runs-schedules", "定时与投递", "admin/runs/schedules"],
  ["runs-triggers", "主动监控", "admin/runs/triggers"],
]);
group("quality", "质量与发布", "workspace", "module.admin.quality", [
  ["quality-evaluations", "质量门禁", "admin/quality/evaluations"],
  ["quality-datasets", "评测集", "admin/quality/datasets"],
  ["quality-releases", "组合发布", "admin/quality/releases"],
  ["quality-experiments", "受控实验", "admin/quality/experiments"],
]);
group("security", "安全与审计", "tenant", "module.admin.security", [
  ["security-traces", "执行追踪", "admin/security/traces"],
  ["security-audit", "审计日志", "admin/security/audit", "implemented"],
  ["security-policies", "安全策略", "admin/security/policies", "implemented"],
  ["security-alerts", "健康与预警", "admin/security/alerts"],
]);
group("memory", "记忆与资产", "workspace", "module.admin.memory", [
  ["memory-memories", "记忆治理", "admin/memory/memories"],
  ["memory-artifacts", "产物与传播", "admin/memory/artifacts"],
  ["memory-templates", "模板复用", "admin/memory/templates"],
  ["memory-files", "文件", "admin/memory/files"],
  ["memory-processing", "处理记录", "admin/memory/processing"],
  ["memory-candidates", "记忆候选", "admin/memory/candidates"],
]);
group("organization", "组织设置", "tenant", "module.admin.organization", [
  ["organization-members", "成员与组", "admin/organization/members", "implemented"],
  ["organization-roles", "角色与权限", "admin/organization/roles", "implemented"],
  ["organization-identity", "企业身份", "admin/organization/identity", "implemented"],
  ["organization-workspaces", "租户与工作区", "admin/organization/workspaces", "implemented"],
]);
group("personal", "个人设置", "self", undefined, [
  ["profile", "个人信息", "settings/profile", "implemented"],
  ["sessions", "本人会话", "settings/sessions", "implemented"],
  ["notifications", "通知与偏好", "settings/notifications", "implemented"],
  ["my-memory", "我的记忆", "settings/memory"],
]);
group("guide", "体验指南", "self", undefined, [
  ["guide", "设计体系与体验指南", "guide", "implemented"],
]);
group("workspaces", "工作空间", "self", undefined, [
  ["workspaces", "选择工作空间", "workspaces", "implemented"],
  ["access", "访问说明", "access", "implemented"],
]);
group("platform", "平台管理", "platform", undefined, [
  ["platform-tenants", "平台租户管理", "platform/tenants", "implemented"],
]);
for (const page of pages) {
  if (page.section === "security" || page.id === "admin-overview") page.aggregate = true;
  if (page.id === "organization-members") page.readPermission = "members.read";
  if (page.id === "organization-roles") page.readPermission = "roles.read";
  if (page.id === "security-audit") page.readPermission = "audit.read";
  if (page.id === "admin-overview") page.readPermission = "overview.read";
}
export const PAGE_CATALOG: readonly PageSpec[] = pages;
export const PRIMARY_SECTIONS = ["analysis", "reports", "plugins", "automations", "boards"];
export const ADMIN_SECTIONS = [
  "admin-overview",
  "data",
  "capabilities",
  "runs",
  "quality",
  "security",
  "memory",
  "organization",
];
export type PageScope = { tenantId?: string; workspaceId?: string };
export function pageUrl(
  page: PageSpec,
  scope: PageScope & { tenantSlug?: string; workspaceSlug?: string },
): string | null {
  if (page.scopeKind === "self" || page.scopeKind === "platform") return `/${page.path}`;
  if (!scope.tenantId) return null;
  if (page.scopeKind === "workspace")
    return scope.workspaceId
      ? `/t/${scope.tenantSlug ?? scope.tenantId}/w/${scope.workspaceSlug ?? scope.workspaceId}/${page.path}`
      : null;
  return `/t/${scope.tenantSlug ?? scope.tenantId}/${page.path}`;
}
const idPattern = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
export function matchPage(path: string): { page: PageSpec; scope: PageScope } | null {
  if (!path.startsWith("/") || path.includes("\\") || path.includes("%") || path.includes("//"))
    return null;
  const refPattern = `(?:${idPattern}|[a-z][a-z0-9-]{1,31})`;
  const workspace = path.match(new RegExp(`^/t/(${refPattern})/w/(${refPattern})/(.+)$`, "i"));
  const tenant = path.match(new RegExp(`^/t/(${refPattern})/(.+)$`, "i"));
  const scope: PageScope = workspace
    ? { tenantId: workspace[1].toLowerCase(), workspaceId: workspace[2].toLowerCase() }
    : tenant
      ? { tenantId: tenant[1].toLowerCase() }
      : {};
  const kind = workspace ? "workspace" : tenant ? "tenant" : undefined;
  const route = workspace?.[3] ?? tenant?.[2] ?? path.slice(1);
  const page = pages.find(
    (p) =>
      p.path === route &&
      (kind ? p.scopeKind === kind : p.scopeKind === "self" || p.scopeKind === "platform"),
  );
  return page ? { page, scope } : null;
}
export function safeReturnPath(value?: string): string | null {
  if (
    !value ||
    value.length > 2048 ||
    /[\\%\u0000-\u0020]/.test(value) ||
    !value.startsWith("/") ||
    value.startsWith("//")
  )
    return null;
  const url = new URL(value, "https://compass.invalid");
  return url.origin === "https://compass.invalid" && matchPage(url.pathname)
    ? url.pathname + url.search
    : null;
}
