"use client";
import { AppLink } from "@/components/shell/app-link";
import { useState } from "react";
import type { PagePayload, AuditPage } from "@/contracts/page";
import { useDocumentSession } from "@/components/shell/session-boundary";
import { ActionButton, EditDialog, Empty, Pagination, Status } from "@/components/ui/entity";

export function PersonalPages({ payload }: { payload: PagePayload }) {
  const { page, pageData, session } = payload,
    api = useDocumentSession();
  const [editing, setEditing] = useState(false);
  if (page.id === "profile")
    return (
      <section className="panel narrow-panel">
        <div className="section-heading">
          <h2>个人信息</h2>
          <button className="secondary" onClick={() => setEditing(true)}>
            编辑资料
          </button>
        </div>
        <dl className="details">
          <dt>显示名</dt>
          <dd>{session.user.displayName}</dd>
          <dt>登录名</dt>
          <dd>{session.user.loginName}</dd>
          <dt>侧栏偏好</dt>
          <dd>{session.user.preferences.sidebarPinned === false ? "默认收起" : "默认固定"}</dd>
          <dt>列表每页数量</dt>
          <dd>{session.user.preferences.pageSize ?? 20} 条</dd>
        </dl>
        <p className="muted">登录名与安全资格由管理员维护。</p>
        {editing && (
          <EditDialog
            title="编辑个人信息"
            fields={[
              { name: "displayName", label: "显示名", value: session.user.displayName },
              {
                name: "pageSize",
                label: "默认每页数量",
                type: "select",
                value: String(session.user.preferences.pageSize ?? 20),
                options: [20, 50, 100].map((n) => ({ value: String(n), label: `${n} 条` })),
              },
              {
                name: "sidebarPinned",
                label: "侧栏偏好",
                type: "select",
                value: String(session.user.preferences.sidebarPinned !== false),
                options: [
                  { value: "true", label: "默认固定" },
                  { value: "false", label: "默认收起" },
                ],
              },
            ]}
            onClose={() => setEditing(false)}
            onSubmit={async (values) => {
              await api.request("me", "PATCH", {
                displayName: values.displayName,
                preferences: {
                  pageSize: Number(values.pageSize),
                  sidebarPinned: values.sidebarPinned === "true",
                },
                expectedVersion: session.user.version,
              });
            }}
          />
        )}
      </section>
    );
  if (page.id === "notifications")
    return (
      <>
        <section className="panel">
          <div className="section-heading">
            <h2>通知偏好</h2>
            <ActionButton
              action={() =>
                api.request("me", "PATCH", {
                  preferences: {
                    authorizationNotifications:
                      session.user.preferences.authorizationNotifications === false,
                  },
                  expectedVersion: session.user.version,
                })
              }
            >
              {session.user.preferences.authorizationNotifications === false
                ? "开启成员与权限通知"
                : "关闭成员与权限通知"}
            </ActionButton>
          </div>
          <p className="muted">安全通知始终保留，成员与权限通知可单独关闭。</p>
        </section>
        <section className="panel">
          <h2>站内通知</h2>
          <div className="notification-list">
            {pageData.notifications?.items.map((n) => (
              <article key={n.id}>
                <span className={n.readAt ? "read-dot" : "unread-dot"} />
                <div>
                  <strong>{String(n.safePayload.title ?? "配置更新")}</strong>
                  <p className="muted">{new Date(n.createdAt).toLocaleString("zh-CN")}</p>
                </div>
                {!n.readAt && (
                  <ActionButton
                    action={() => api.request(`me/notifications/${n.id}`, "PATCH", { read: true })}
                  >
                    标为已读
                  </ActionButton>
                )}
              </article>
            ))}
          </div>
          {!pageData.notifications?.items.length && <Empty>暂无通知</Empty>}
          {pageData.notifications && <Pagination list={pageData.notifications} />}
        </section>
      </>
    );
  if (page.id === "sessions")
    return (
      <>
        <section className="panel">
          <h2>本人会话</h2>
          <p className="muted">
            会话固定到期。发现不熟悉的设备可立即撤销；密码重置会撤销全部会话。
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>设备</th>
                  <th>创建时间</th>
                  <th>到期时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {pageData.sessions?.items.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <span className="device-label">{s.deviceLabel}</span>
                      {s.id === session.sessionId && <span className="status">当前会话</span>}
                    </td>
                    <td>{new Date(s.createdAt).toLocaleString("zh-CN")}</td>
                    <td>{new Date(s.expiresAt).toLocaleString("zh-CN")}</td>
                    <td>
                      {s.revokedAt ? (
                        <span className="muted">已撤销</span>
                      ) : (
                        <ActionButton
                          confirmation="确认撤销此会话？该设备需要重新登录。"
                          action={async () => {
                            await api.request(`me/sessions/${s.id}`, "DELETE");
                            if (s.id === session.sessionId)
                              api.retire("当前会话已撤销。", "/login");
                          }}
                        >
                          撤销
                        </ActionButton>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pageData.sessions && <Pagination list={pageData.sessions} />}
        </section>
        {pageData.audit && (
          <section className="panel">
            <h2>本人安全记录</h2>
            <AuditTable data={pageData.audit} />
          </section>
        )}
      </>
    );
  return null;
}
export function AuditTable({ data }: { data: AuditPage }) {
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>动作</th>
              <th>对象</th>
              <th>结果</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((event) => (
              <tr key={event.id}>
                <td>{new Date(event.occurredAt).toLocaleString("zh-CN")}</td>
                <td>{event.action}</td>
                <td>
                  <span className="mono muted">
                    {event.targetId?.slice(0, 8) ?? event.targetType}
                  </span>
                </td>
                <td>
                  <Status value={event.outcome} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!data.items.length && <Empty>暂无审计记录</Empty>}
      <div className="pagination">
        <span>共 {data.total} 条</span>
        {data.nextCursor && (
          <AppLink
            className="button secondary"
            href={`?${(() => {
              const q = new URLSearchParams(typeof location === "undefined" ? "" : location.search);
              q.set("cursor", data.nextCursor);
              return q;
            })()}`}
          >
            下一页
          </AppLink>
        )}
      </div>
    </>
  );
}
export function GovernancePages({ payload }: { payload: PagePayload }) {
  const { page, pageData, session } = payload,
    api = useDocumentSession();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function exportCsv() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams(location.search);
      const body = Object.fromEntries(
        [...params].filter(
          ([key, value]) => value && ["action", "actor", "workspaceId", "from", "to"].includes(key),
        ),
      );
      for (const key of ["from", "to"])
        if (params.get(`${key}Local`))
          body[key] = new Date(params.get(`${key}Local`)!).toISOString();
      const blob = await api.request<Blob>(
        `tenants/${session.tenant!.id}/audit/export`,
        "POST",
        body,
      );
      api.download(blob);
    } catch (e) {
      setError(e instanceof Error ? e.message : "导出失败。");
    } finally {
      setBusy(false);
    }
  }
  if (page.id === "admin-overview")
    return (
      <>
        <div className="card-grid">
          <section className="panel metric">
            <p>可访问工作空间</p>
            <strong>{pageData.overview?.workspaceCount ?? "—"}</strong>
          </section>
          <section className="panel metric">
            <p>租户成员</p>
            <strong>{pageData.overview?.memberCount ?? "—"}</strong>
          </section>
          <section className="panel">
            <span className="status status-muted">待接入</span>
            <h3>Agent 运行指标</h3>
            <p className="muted">分析、报告与运行统计将在后续版本提供。</p>
          </section>
        </div>
        <section className="panel">
          <h2>近期操作</h2>
          <AuditTable
            data={{
              items: pageData.overview?.recent ?? [],
              total: pageData.overview?.recent.length ?? 0,
              nextCursor: null,
            }}
          />
        </section>
      </>
    );
  if (page.id === "security-audit")
    return (
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Web 审计日志</h2>
            <p className="muted">当前获权范围内的身份、成员、空间与配置变更。</p>
          </div>
          {pageData.canExportAudit && (
            <button className="secondary" disabled={busy} onClick={exportCsv}>
              {busy ? "正在生成…" : "导出 CSV"}
            </button>
          )}
        </div>
        <form method="get" className="audit-filters">
          <label>
            动作
            <input name="action" placeholder="例如 member.updated" maxLength={80} />
          </label>
          <label>
            开始时间
            <input type="datetime-local" name="fromLocal" />
          </label>
          <label>
            结束时间
            <input type="datetime-local" name="toLocal" />
          </label>
          <button className="secondary">筛选</button>
          <AppLink href={payload.viewKey.split("?")[0]}>清除</AppLink>
        </form>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {pageData.audit && <AuditTable data={pageData.audit} />}
      </section>
    );
  if (page.id === "security-policies")
    return (
      <section className="panel">
        <h2>会话与访问策略</h2>
        <dl className="details">
          <dt>登录方式</dt>
          <dd>本地账号与密码</dd>
          <dt>会话策略</dt>
          <dd>固定到期、不自动续期；支持撤销本人会话。</dd>
          <dt>授权策略</dt>
          <dd>每次访问核验当前租户资格与个人权限；管理员拥有本租户完整权限。</dd>
          <dt>权限变更</dt>
          <dd>失权页面会收起内容并重新确认访问资格。</dd>
        </dl>
        <AppLink className="button secondary" href="/settings/sessions">
          查看本人会话
        </AppLink>
      </section>
    );
  return null;
}
