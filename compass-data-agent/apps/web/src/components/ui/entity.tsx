"use client";
import { AppLink } from "../shell/app-link";
import { useState, type ReactNode, type FormEvent } from "react";
import type { ListPage } from "@/contracts/web";
import { useDocumentSession } from "../shell/session-boundary";
import { Modal } from "./dialog";

export function Status({ value }: { value: string }) {
  return (
    <span
      className={`status ${["disabled", "archived", "failed", "denied"].includes(value) ? "status-muted" : ""}`}
    >
      {(
        {
          active: "启用",
          disabled: "停用",
          archived: "已归档",
          success: "成功",
          generated: "已生成",
          failed: "失败",
          denied: "已拒绝",
        } as Record<string, string>
      )[value] ?? value}
    </span>
  );
}
export function Empty({ children = "暂无记录" }: { children?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-symbol" aria-hidden>
        ◇
      </div>
      <h3>{children}</h3>
      <p>当前访问范围内暂无可显示的内容。</p>
    </div>
  );
}
export function Pagination({
  list,
}: {
  list: Pick<ListPage<unknown>, "page" | "limit" | "total">;
}) {
  const session = useDocumentSession();
  function href(page: number) {
    const params = new URLSearchParams(session.payload.viewKey.split("?")[1] ?? "");
    params.set("page", String(page));
    return `?${params}`;
  }
  return (
    <div className="pagination">
      <span>
        共 {list.total} 条 · 第 {list.page} 页
      </span>
      <div className="actions">
        {list.page > 1 && (
          <AppLink className="button secondary" href={href(list.page - 1)}>
            上一页
          </AppLink>
        )}
        {list.page * list.limit < list.total && (
          <AppLink className="button secondary" href={href(list.page + 1)}>
            下一页
          </AppLink>
        )}
      </div>
    </div>
  );
}
export function ListFilter({
  q = "",
  limit = 20,
  placeholder = "搜索名称",
}: {
  q?: string;
  limit?: number;
  placeholder?: string;
}) {
  return (
    <form className="list-filter" method="get">
      <input
        name="q"
        defaultValue={q}
        maxLength={80}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      <select name="limit" defaultValue={limit} aria-label="每页数量">
        <option value="20">20 条 / 页</option>
        <option value="50">50 条 / 页</option>
        <option value="100">100 条 / 页</option>
      </select>
      <button className="secondary" type="submit">
        搜索
      </button>
    </form>
  );
}
export type Field = {
  name: string;
  label: string;
  value?: string;
  type?: "text" | "textarea" | "select";
  options?: { value: string; label: string }[];
  required?: boolean;
  maxLength?: number;
  hint?: string;
};
export function EditDialog({
  title,
  description,
  fields,
  submitLabel = "保存",
  onSubmit,
  onClose,
}: {
  title: string;
  description?: string;
  fields: Field[];
  submitLabel?: string;
  onSubmit: (value: Record<string, string>) => Promise<void>;
  onClose: () => void;
}) {
  const session = useDocumentSession();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    setBusy(true);
    setError("");
    try {
      await onSubmit(data);
      session.setDirty(false);
      session.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败，请重试。");
      setBusy(false);
    }
  }
  function close() {
    if (!session.dirty || confirm("放弃未保存的修改？")) {
      session.setDirty(false);
      onClose();
    }
  }
  return (
    <Modal open title={title} description={description} onClose={close}>
      <form data-editor onSubmit={submit}>
        {fields.map((field) => (
          <label key={field.name}>
            {field.label}
            {field.type === "select" ? (
              <select name={field.name} defaultValue={field.value}>
                {field.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : field.type === "textarea" ? (
              <textarea
                name={field.name}
                defaultValue={field.value}
                maxLength={field.maxLength ?? 500}
              />
            ) : (
              <input
                name={field.name}
                defaultValue={field.value}
                required={field.required ?? true}
                maxLength={field.maxLength ?? 80}
              />
            )}{" "}
            {field.hint && <small>{field.hint}</small>}
          </label>
        ))}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={close}>
            取消
          </button>
          <button disabled={busy} type="submit">
            {busy ? "正在保存…" : submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function ActionButton({
  children,
  action,
  confirmation,
}: {
  children: ReactNode;
  action: () => Promise<void>;
  confirmation?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const session = useDocumentSession();
  async function run() {
    if (busy || (confirmation && !confirm(confirmation))) return;
    setBusy(true);
    try {
      await action();
      session.setDirty(false);
      session.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败。");
      setBusy(false);
    }
  }
  return (
    <>
      <button className="secondary compact" disabled={busy} onClick={run}>
        {busy ? "处理中…" : children}
      </button>
      {error && (
        <span className="error" role="alert">
          {error}
        </span>
      )}
    </>
  );
}
