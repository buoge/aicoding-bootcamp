"use client";
import { useState, type FormEvent } from "react";
export function LoginForm({ returnPath }: { returnPath?: string }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/web/v1/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loginName: form.get("loginName"),
          password: form.get("password"),
          ...(returnPath ? { returnPath } : {}),
        }),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error?.message ?? "登录失败，请重试。");
      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel("compass-identity");
        channel.postMessage("login");
        channel.close();
      }
      location.replace(value.redirectTo);
    } catch (error) {
      // A lost response can follow a committed login. Read the session before allowing a retry.
      try {
        const session = await fetch("/api/web/v1/session", {
          cache: "no-store",
          credentials: "same-origin",
          signal: AbortSignal.timeout(5000),
        });
        if (session.ok) {
          location.replace("/");
          return;
        }
      } catch {
        /* Keep the explicit retry available; never replay the password automatically. */
      }
      setError(error instanceof Error ? error.message : "连接暂时不可用。请重试。");
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="login-form">
      <label>
        登录名
        <input name="loginName" autoComplete="username" required autoFocus maxLength={64} />
      </label>
      <label>
        密码
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={512}
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy}>
        {busy ? "正在登录…" : "登录 Compass"}
      </button>
      <p className="muted">使用管理员分配的账号。忘记密码请联系管理员重置。</p>
    </form>
  );
}
