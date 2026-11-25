"use client";
import { AppLink } from "@/components/shell/app-link";
import { useState } from "react";
import type { PagePayload } from "@/contracts/page";
import type {
  BindingDto,
  ListPage,
  MemberDto,
  WorkspaceDto,
  TenantDto,
  PermissionsDto,
} from "@/contracts/web";
import { PERMISSION_CATALOG, DEFAULT_TEMPLATES } from "@/contracts/authorization";
import { useDocumentSession } from "@/components/shell/session-boundary";
import {
  ActionButton,
  EditDialog,
  Empty,
  ListFilter,
  Pagination,
  Status,
} from "@/components/ui/entity";
import { Modal } from "@/components/ui/dialog";
import { PermissionsEditor } from "./permissions-editor";

export function OrganizationPages({ payload }: { payload: PagePayload }) {
  const { page, pageData, session, query } = payload;
  if (page.id === "platform-tenants") return <TenantPage payload={payload} />;
  if (page.id === "organization-members" || page.id === "organization-roles")
    return (
      <>
        {page.id === "organization-roles" && (
          <>
            <div className="card-grid">
              {Object.entries(pageData.templates ?? DEFAULT_TEMPLATES).map(([key, permissions]) => (
                <section className="panel" key={key}>
                  <h3>{{ analyst: "分析师", viewer: "查看者", auditor: "审计员" }[key] ?? key}</h3>
                  <p className="muted">默认模板 · {permissions.length} 项</p>
                  <ul className="plain-list">
                    {permissions.map((p) => (
                      <li key={p}>{PERMISSION_CATALOG.find((rule) => rule.id === p)?.label}</li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
            <p className="notice">
              每位成员可单独配置权限。模板为初始建议，后续修改模板不会追改既有成员。
            </p>
          </>
        )}
        {pageData.members && <MemberTable payload={payload} />}
        <section className="panel muted">
          <h3>{page.id === "organization-members" ? "成员组" : "自定义角色"}</h3>
          <p>后续版本接入。当前通过直接成员与个人权限完成协作管理。</p>
        </section>
      </>
    );
  if (page.id === "organization-workspaces")
    return (
      <>
        {pageData.settings && (
          <TenantSettings
            value={pageData.settings}
            editable={session.tenantCapabilities.includes("settings.write")}
          />
        )}
        {pageData.workspaces ? (
          <WorkspaceTable list={pageData.workspaces} payload={payload} />
        ) : (
          <p className="notice">当前账号没有查看工作空间的权限。</p>
        )}
      </>
    );
  if (page.id === "organization-identity")
    return (
      <>
        <section className="panel">
          <h2>本地账号登录</h2>
          <p>
            账号由管理员受管创建；忘记密码时联系管理员重置。重置或停用账号后，已有登录会话会失效。
          </p>
          <p className="muted">当前登录：{session.user.loginName}</p>
        </section>
        <div className="card-grid">
          <section className="panel">
            <span className="status status-muted">待接入</span>
            <h3>企业 SSO</h3>
            <p>企业统一登录将在后续版本提供。</p>
          </section>
          <section className="panel">
            <span className="status status-muted">待接入</span>
            <h3>服务身份</h3>
            <p>服务账号和自动化凭据将在后续版本提供。</p>
          </section>
        </div>
      </>
    );
  if (page.id === "workspaces" || page.id === "access")
    return (
      <>
        <section className="panel">
          <h2>选择工作空间</h2>
          <p className="muted">
            选择可访问的租户，再进入工作空间。无可用入口时，请联系管理员配置权限。
          </p>
          {pageData.tenants && (
            <>
              <form method="get" className="list-filter">
                <select
                  aria-label="选择租户"
                  name="tenantId"
                  defaultValue={
                    pageData.workspaces?.items[0]?.tenantId ?? pageData.tenants.items[0]?.id
                  }
                >
                  {pageData.tenants.items.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <button className="secondary">查看空间</button>
              </form>
              <Pagination list={pageData.tenants} />
            </>
          )}
          {pageData.workspaces && (
            <div className="workspace-grid">
              {pageData.workspaces.items.map((w) => (
                <WorkspaceCard key={w.id} workspace={w} />
              ))}
            </div>
          )}
          {!pageData.workspaces?.items.length && (
            <>
              <Empty>暂无可访问的工作空间</Empty>
              {pageData.tenants?.items.map((t) => (
                <p key={t.id}>
                  <AppLink href={`/t/${t.slug}/admin/organization/workspaces`}>
                    查看 {t.name} 的工作区设置
                  </AppLink>
                </p>
              ))}
            </>
          )}
          {pageData.workspaces && <Pagination list={pageData.workspaces} />}
        </section>
        <AppLink className="button secondary" href="/settings/profile">
          个人设置
        </AppLink>
      </>
    );
  return (
    <>
      <ListFilter q={query.q} />
      <Empty />
    </>
  );
}
function WorkspaceCard({ workspace }: { workspace: WorkspaceDto }) {
  const api = useDocumentSession();
  const [error, setError] = useState("");
  async function enter() {
    if (api.dirty && !confirm("离开当前页面并放弃未保存的修改？")) return;
    try {
      const result = await api.request<{ redirectTo: string }>("context", "POST", {
        tenantId: workspace.tenantId,
        workspaceId: workspace.id,
      });
      api.setDirty(false);
      api.navigate(result.redirectTo);
    } catch (e) {
      setError(e instanceof Error ? e.message : "切换失败。");
    }
  }
  return (
    <article className="workspace-card">
      <div className="workspace-icon">◇</div>
      <h3>{workspace.name}</h3>
      <p className="muted">{workspace.description || "协作工作空间"}</p>
      <Status value={workspace.status} />
      <button className="secondary" onClick={enter}>
        进入空间
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}
function TenantPage({ payload }: { payload: PagePayload }) {
  const api = useDocumentSession(),
    list = payload.pageData.tenants!;
  const [edit, setEdit] = useState<TenantDto | "new" | null>(null);
  const [id] = useState(() => crypto.randomUUID());
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <h2>租户管理</h2>
          <p className="muted">管理租户生命周期与首位管理员。</p>
        </div>
        <button onClick={() => setEdit("new")}>创建租户</button>
      </div>
      <ListFilter {...payload.query} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>名称</th>
              <th>时区</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {list.items.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td>{t.timezone}</td>
                <td>
                  <Status value={t.status} />
                </td>
                <td>
                  <button className="secondary compact" onClick={() => setEdit(t)}>
                    编辑
                  </button>{" "}
                  <ActionButton
                    confirmation={`确认${t.status === "active" ? "停用" : "恢复"}租户「${t.name}」？`}
                    action={() =>
                      api.request(`platform/tenants/${t.id}`, "PATCH", {
                        status: t.status === "active" ? "disabled" : "active",
                        expectedVersion: t.version,
                      })
                    }
                  >
                    {t.status === "active" ? "停用" : "恢复"}
                  </ActionButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!list.items.length && <Empty />}
      <Pagination list={list} />
      {edit && (
        <EditDialog
          title={edit === "new" ? "创建租户" : "编辑租户"}
          fields={
            edit === "new"
              ? [
                  { name: "name", label: "租户名称" },
                  {
                    name: "slug",
                    label: "地址短标识",
                    hint: "2–32 位小写字母、数字或连字符，以字母开头；创建后保持不变。",
                  },
                  { name: "timezone", label: "时区", value: "Asia/Shanghai" },
                  {
                    name: "initialAdminLoginName",
                    label: "首管理员登录名",
                    value: payload.session.user.loginName,
                    hint: "需为已创建且启用的账号。",
                  },
                ]
              : [{ name: "name", label: "租户名称", value: edit.name }]
          }
          onClose={() => setEdit(null)}
          onSubmit={async (values) => {
            await api.request(
              edit === "new" ? "platform/tenants" : `platform/tenants/${edit.id}`,
              edit === "new" ? "POST" : "PATCH",
              edit === "new" ? { ...values, id } : { ...values, expectedVersion: edit.version },
            );
          }}
        />
      )}
    </section>
  );
}
function TenantSettings({ value, editable }: { value: TenantDto; editable: boolean }) {
  const api = useDocumentSession(),
    [open, setOpen] = useState(false);
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <h2>{value.name}</h2>
          <p className="muted">租户时区 · {value.timezone}</p>
        </div>
        {editable && (
          <button className="secondary" onClick={() => setOpen(true)}>
            编辑租户设置
          </button>
        )}
      </div>
      {open && (
        <EditDialog
          title="租户设置"
          fields={[
            { name: "name", label: "租户名称", value: value.name },
            { name: "timezone", label: "时区", value: value.timezone },
          ]}
          onClose={() => setOpen(false)}
          onSubmit={async (values) => {
            await api.request(`tenants/${value.id}/settings`, "PATCH", {
              ...values,
              expectedVersion: value.version,
            });
          }}
        />
      )}
    </section>
  );
}
function WorkspaceTable({ list, payload }: { list: ListPage<WorkspaceDto>; payload: PagePayload }) {
  const api = useDocumentSession(),
    tenantId = payload.session.tenant!.id,
    canWrite = payload.session.tenantCapabilities.includes("workspaces.write"),
    canMembers = payload.session.tenantCapabilities.includes("members.read");
  const [edit, setEdit] = useState<WorkspaceDto | "new" | null>(null),
    [members, setMembers] = useState<WorkspaceDto | null>(null),
    [id] = useState(() => crypto.randomUUID());
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>工作空间</h2>
        {canWrite && <button onClick={() => setEdit("new")}>创建空间</button>}
      </div>
      <ListFilter {...payload.query} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>名称</th>
              <th>描述</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {list.items.map((w) => (
              <tr key={w.id}>
                <td>{w.name}</td>
                <td className="muted">{w.description || "—"}</td>
                <td>
                  <Status value={w.status} />
                </td>
                <td className="actions">
                  {canWrite && (
                    <>
                      {w.status === "active" && (
                        <button className="secondary compact" onClick={() => setEdit(w)}>
                          编辑
                        </button>
                      )}
                      <ActionButton
                        confirmation={`确认${w.status === "active" ? "归档" : "恢复"}「${w.name}」？成员授权配置将保留。`}
                        action={() =>
                          api.request(`tenants/${tenantId}/workspaces/${w.id}`, "PATCH", {
                            status: w.status === "active" ? "archived" : "active",
                            expectedVersion: w.version,
                          })
                        }
                      >
                        {w.status === "active" ? "归档" : "恢复"}
                      </ActionButton>
                    </>
                  )}
                  {canMembers && (
                    <button className="secondary compact" onClick={() => setMembers(w)}>
                      成员分配
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!list.items.length && <Empty />}
      <Pagination list={list} />
      {edit && (
        <EditDialog
          title={edit === "new" ? "创建空间" : "编辑空间"}
          fields={[
            { name: "name", label: "空间名称", value: edit === "new" ? "" : edit.name },
            ...(edit === "new"
              ? [{ name: "slug", label: "地址短标识", hint: "例如 huadong；创建后保持不变。" }]
              : []),
            {
              name: "description",
              label: "描述",
              type: "textarea",
              value: edit === "new" ? "" : edit.description,
            },
          ]}
          onClose={() => setEdit(null)}
          onSubmit={async (values) => {
            await api.request(
              `tenants/${tenantId}/workspaces${edit === "new" ? "" : `/${edit.id}`}`,
              edit === "new" ? "POST" : "PATCH",
              edit === "new" ? { ...values, id } : { ...values, expectedVersion: edit.version },
            );
          }}
        />
      )}
      {members && (
        <WorkspaceMembers
          workspace={members}
          canWrite={payload.session.tenantCapabilities.includes("members.write")}
          onClose={() => setMembers(null)}
        />
      )}
    </section>
  );
}
function MemberTable({ payload }: { payload: PagePayload }) {
  const api = useDocumentSession(),
    tenantId = payload.session.tenant!.id,
    list = payload.pageData.members!,
    canWrite = payload.session.tenantCapabilities.includes("members.write");
  const [edit, setEdit] = useState<MemberDto | "new" | null>(null),
    [permissions, setPermissions] = useState<MemberDto | null>(null),
    [id] = useState(() => crypto.randomUUID());
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <h2>直接成员</h2>
          <p className="muted">按精确登录名添加已有账号，配置租户资格与空间权限。</p>
        </div>
        {canWrite && <button onClick={() => setEdit("new")}>添加成员</button>}
      </div>
      <ListFilter {...payload.query} placeholder="搜索成员姓名或登录名" />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>成员</th>
              <th>租户角色</th>
              <th>成员状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {list.items.map((member) => (
              <tr key={member.id}>
                <td>
                  <strong>{member.displayName}</strong>
                  <small className="table-sub">{member.loginName}</small>
                </td>
                <td>{member.roleKey === "admin" ? "管理员" : "普通成员"}</td>
                <td>
                  <Status value={member.status} />
                  {member.userStatus !== "active" && (
                    <small className="table-sub">账号已停用</small>
                  )}
                </td>
                <td className="actions">
                  {canWrite && (
                    <>
                      <button className="secondary compact" onClick={() => setPermissions(member)}>
                        配置权限
                      </button>
                      <button className="secondary compact" onClick={() => setEdit(member)}>
                        成员资格
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!list.items.length && <Empty />}
      <Pagination list={list} />
      {edit && (
        <EditDialog
          title={edit === "new" ? "添加已有账号" : "修改成员资格"}
          description={
            edit === "new"
              ? "普通成员初始租户权限为空，保存后可配置个人权限。"
              : "停用会保留空间配置；恢复前请核对。管理员降级时清空租户直接清单，既有空间关系保留。"
          }
          fields={[
            ...(edit === "new" ? [{ name: "loginName", label: "精确登录名" }] : []),
            {
              name: "roleKey",
              label: "租户角色",
              type: "select",
              value: edit === "new" ? "member" : edit.roleKey,
              options: [
                { value: "member", label: "普通成员" },
                { value: "admin", label: "管理员" },
              ],
            },
            ...(edit === "new"
              ? []
              : [
                  {
                    name: "status",
                    label: "成员状态",
                    type: "select" as const,
                    value: edit.status,
                    options: [
                      { value: "active", label: "启用" },
                      { value: "disabled", label: "停用" },
                    ],
                  },
                ]),
          ]}
          submitLabel="确认保存"
          onClose={() => setEdit(null)}
          onSubmit={async (values) => {
            if (edit === "new")
              await api.request(`tenants/${tenantId}/members`, "POST", {
                ...values,
                id,
                permissionKeys: [],
              });
            else {
              const current = await api.request<PermissionsDto>(
                `tenants/${tenantId}/members/${edit.id}/permissions`,
              );
              await api.request(`tenants/${tenantId}/members/${edit.id}`, "PATCH", {
                ...values,
                permissionKeys:
                  values.roleKey === "admin" || edit.roleKey === "admin"
                    ? []
                    : current.directPermissionKeys,
                expectedVersion: edit.version,
                expectedAuthzVersion: edit.authzVersion,
              });
            }
          }}
        />
      )}
      {permissions && (
        <PermissionsEditor
          key={permissions.id}
          member={permissions}
          tenantId={tenantId}
          onClose={() => setPermissions(null)}
        />
      )}
    </section>
  );
}
function WorkspaceMembers({
  workspace,
  canWrite,
  onClose,
}: {
  workspace: WorkspaceDto;
  canWrite: boolean;
  onClose: () => void;
}) {
  const api = useDocumentSession();
  const [list, setList] = useState<ListPage<BindingDto> | null>(null),
    [error, setError] = useState(""),
    [query, setQuery] = useState("");
  async function load(page = 1) {
    try {
      setList(
        await api.request(
          `tenants/${workspace.tenantId}/workspaces/${workspace.id}/members?page=${page}&q=${encodeURIComponent(query)}`,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "读取失败。");
    }
  }
  return (
    <Modal
      open
      title={`${workspace.name} · 成员分配`}
      description="通过成员页的“配置权限”选择此空间，可创建分配或调整已有个人权限。"
      onClose={onClose}
    >
      <form
        className="list-filter"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <input
          aria-label="搜索空间成员"
          placeholder="成员姓名或登录名"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="secondary">读取成员</button>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {list && (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>成员</th>
                  <th>模板来源</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((b) => (
                  <tr key={b.id}>
                    <td>
                      {b.displayName}
                      <small className="table-sub">{b.loginName}</small>
                    </td>
                    <td>{b.roleKey}</td>
                    <td>
                      {canWrite && (
                        <ActionButton
                          confirmation={`解除 ${b.displayName} 在此空间的直接分配？租户继承权限仍保留。`}
                          action={() =>
                            api.request(
                              `tenants/${workspace.tenantId}/workspaces/${workspace.id}/members/${b.id}`,
                              "DELETE",
                              { expectedVersion: b.version },
                            )
                          }
                        >
                          解除分配
                        </ActionButton>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!list.items.length && <Empty />}
          <div className="pagination">
            <span>共 {list.total} 条</span>
            <div className="actions">
              {list.page > 1 && (
                <button className="secondary" onClick={() => void load(list.page - 1)}>
                  上一页
                </button>
              )}
              {list.page * list.limit < list.total && (
                <button className="secondary" onClick={() => void load(list.page + 1)}>
                  下一页
                </button>
              )}
            </div>
          </div>
        </>
      )}
      <AppLink
        href={
          api.payload.session.navigation.find((entry) => entry.id === "organization-members")
            ?.href ?? "/workspaces"
        }
        className="button secondary"
      >
        前往成员权限配置
      </AppLink>
    </Modal>
  );
}
