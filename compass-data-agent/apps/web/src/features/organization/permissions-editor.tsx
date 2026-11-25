"use client";
import { useEffect, useRef, useState } from "react";
import type {
  BindingDto,
  ListPage,
  MemberDto,
  PermissionsDto,
  WorkspaceDto,
} from "@/contracts/web";
import { PERMISSION_CATALOG, DEFAULT_TEMPLATES, type Permission } from "@/contracts/authorization";
import { useDocumentSession } from "@/components/shell/session-boundary";
import { Modal } from "@/components/ui/dialog";

export function PermissionsEditor({
  member,
  tenantId,
  onClose,
}: {
  member: MemberDto;
  tenantId: string;
  onClose: () => void;
}) {
  const api = useDocumentSession();
  const [spaces, setSpaces] = useState<WorkspaceDto[]>([]),
    [scope, setScope] = useState(""),
    [value, setValue] = useState<PermissionsDto | null>(null),
    [binding, setBinding] = useState<BindingDto | null>(null),
    [keys, setKeys] = useState<Permission[]>([]),
    [template, setTemplate] = useState("viewer"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirming, setConfirming] = useState(false);
  const sequence = useRef(0),
    createId = useRef(crypto.randomUUID());
  async function load(workspaceId: string, preserveDraft = false) {
    const seq = ++sequence.current;
    setBusy(true);
    setError("");
    setConfirming(false);
    try {
      const tenant = await api.request<PermissionsDto>(
        `tenants/${tenantId}/members/${member.id}/permissions`,
      );
      let next = tenant,
        assignment: BindingDto | null = null;
      if (workspaceId) {
        const found = await api.request<ListPage<BindingDto>>(
          `tenants/${tenantId}/workspaces/${workspaceId}/members?limit=100&q=${encodeURIComponent(member.loginName)}`,
        );
        assignment = found.items.find((row) => row.tenantMemberId === member.id) ?? null;
        if (assignment)
          next = await api.request<PermissionsDto>(
            `tenants/${tenantId}/workspaces/${workspaceId}/members/${assignment.id}/permissions`,
          );
        else
          next = {
            ...tenant,
            scope: { tenantId, workspaceId },
            templateKey: "viewer",
            directPermissionKeys: [],
            inheritedPermissionKeys: tenant.directPermissionKeys.filter((key) =>
              PERMISSION_CATALOG.find((p) => p.id === key)?.scopes.includes("workspace"),
            ),
            effectivePermissionKeys: [],
            version: tenant.version,
          };
      }
      if (seq !== sequence.current) return;
      setValue(next);
      setBinding(assignment);
      if (!preserveDraft) {
        setKeys(next.directPermissionKeys);
        setTemplate(next.templateKey in DEFAULT_TEMPLATES ? next.templateKey : "viewer");
      }
      setBusy(false);
    } catch (e) {
      if (seq === sequence.current) {
        setError(e instanceof Error ? e.message : "无法读取权限。");
        setBusy(false);
      }
    }
  }
  useEffect(() => {
    let alive = true;
    async function initial() {
      try {
        const all: WorkspaceDto[] = [];
        let page = 1,
          total = 0;
        do {
          const result = await api.request<ListPage<WorkspaceDto>>(
            `tenants/${tenantId}/workspaces?limit=100&page=${page++}`,
          );
          all.push(...result.items);
          total = result.total;
        } while (all.length < total && alive);
        if (alive) {
          setSpaces(all);
          await load("");
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "无法读取空间。");
      }
    }
    void initial();
    return () => {
      alive = false;
    };
    // This editor is mounted with a stable member and tenant, and unmounted on document retirement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, tenantId, member.id]);
  const visible = PERMISSION_CATALOG.filter(
    (p) => p.personalGrantable && p.scopes.includes(scope ? "workspace" : "tenant"),
  );
  const added = keys.filter((key) => !value?.directPermissionKeys.includes(key)),
    removed = (value?.directPermissionKeys ?? []).filter((key) => !keys.includes(key));
  function label(key: Permission) {
    return PERMISSION_CATALOG.find((p) => p.id === key)?.label ?? key;
  }
  function close() {
    if (!api.dirty || confirm("放弃未保存的权限修改？")) {
      api.setDirty(false);
      onClose();
    }
  }
  async function save() {
    if (!value || busy) return;
    setBusy(true);
    setError("");
    try {
      if (scope && !binding)
        await api.request(`tenants/${tenantId}/workspaces/${scope}/members`, "POST", {
          id: createId.current,
          tenantMemberId: member.id,
          roleKey: template,
          permissionKeys: keys,
        });
      else if (scope && binding && template !== value.templateKey)
        await api.request(
          `tenants/${tenantId}/workspaces/${scope}/members/${binding.id}`,
          "PATCH",
          {
            roleKey: template,
            permissionKeys: keys,
            expectedVersion: value.version,
            expectedAuthzVersion: value.authzVersion,
          },
        );
      else
        await api.request(
          `tenants/${tenantId}/${scope ? `workspaces/${scope}/members/${binding!.id}` : `members/${member.id}`}/permissions`,
          "PUT",
          {
            permissionKeys: keys,
            expectedVersion: value.version,
            expectedAuthzVersion: value.authzVersion,
          },
        );
      api.setDirty(false);
      api.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败，请重试。");
      setBusy(false);
      setConfirming(false);
    }
  }
  return (
    <Modal
      open
      wide
      title={`配置个人权限 · ${member.displayName}`}
      description="租户权限适用于全部空间；空间权限与租户授予合并。空清单表示本范围没有直接授予。"
      onClose={close}
    >
      <div data-editor>
        <div className="form-grid">
          <label>
            配置范围
            <select
              data-editor-ignore
              value={scope}
              onChange={(event) => {
                if (api.dirty && !confirm("切换范围将放弃当前草稿，是否继续？")) return;
                api.setDirty(false);
                setScope(event.target.value);
                setValue(null);
                createId.current = crypto.randomUUID();
                void load(event.target.value);
              }}
            >
              <option value="">整个租户</option>
              {spaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                  {w.status === "archived" ? "（已归档）" : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="permission-summary">
            <strong>
              {member.roleKey === "admin" ? "租户管理员" : `${keys.length} 项直接权限`}
            </strong>
            <small>状态：{value?.targetStatus ?? "读取中"}</small>
          </div>
        </div>
        {value && !value.editable && (
          <p className="notice">管理员拥有完整管理权限。调整个人权限前，请先修改成员资格。</p>
        )}
        {value?.editable && (
          <div className="template-row">
            <label>
              使用默认模板
              <select value={template} onChange={(e) => setTemplate(e.target.value)}>
                <option value="analyst">分析师</option>
                <option value="viewer">查看者</option>
                <option value="auditor">审计员</option>
              </select>
            </label>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => {
                setKeys([...DEFAULT_TEMPLATES[template as keyof typeof DEFAULT_TEMPLATES]]);
                api.setDirty(true);
                setConfirming(false);
              }}
            >
              填入草稿
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => {
                setKeys([]);
                api.setDirty(true);
                setConfirming(false);
              }}
            >
              清空本范围
            </button>
          </div>
        )}
        {value && (
          <>
            <h3>直接授予</h3>
            <div className="permission-grid">
              {visible.map((permission) => (
                <label className="check-field" key={permission.id}>
                  <input
                    type="checkbox"
                    checked={keys.includes(permission.id)}
                    disabled={!value.editable || busy}
                    onChange={(e) => {
                      setKeys((previous) =>
                        e.target.checked
                          ? [...previous, permission.id]
                          : previous.filter((key) => key !== permission.id),
                      );
                      api.setDirty(true);
                      setConfirming(false);
                    }}
                  />
                  <span>
                    {permission.label}
                    <small>{permission.id}</small>
                  </span>
                </label>
              ))}
            </div>
            {scope && (
              <section className="permission-inherited">
                <h3>租户继承 · 只读</h3>
                {value.inheritedPermissionKeys.length ? (
                  <div className="chips">
                    {value.inheritedPermissionKeys.map((key) => (
                      <span className="chip" key={key}>
                        {label(key)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="muted">无租户继承权限</p>
                )}
              </section>
            )}
            <p className="muted">
              模板仅填入当前草稿，既有成员的权限配置独立保存。管理成员与权限始终由租户管理员负责。
            </p>
          </>
        )}
        {error && (
          <div className="error" role="alert">
            <p>{error}</p>
            <button className="secondary" onClick={() => void load(scope, true)}>
              重新读取并核对
            </button>
            <p>当前草稿保留在此页面。若访问权限已变化，页面将清理并重新加载。</p>
          </div>
        )}
        {confirming && (
          <div className="confirm-panel">
            <h3>确认权限变更</h3>
            <p>新增：{added.map(label).join("、") || "无"}</p>
            <p>移除：{removed.map(label).join("、") || "无"}</p>
            <p>保存后按当前清单生效；停用成员的配置在恢复资格后生效。</p>
          </div>
        )}
        <div className="dialog-actions">
          <button className="secondary" onClick={close}>
            取消
          </button>
          {value?.editable && (
            <button
              disabled={busy || (!added.length && !removed.length && (!scope || !!binding))}
              onClick={() => (confirming ? void save() : setConfirming(true))}
            >
              {busy ? "处理中…" : confirming ? "确认保存" : "核对变更"}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
