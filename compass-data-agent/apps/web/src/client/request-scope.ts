import { sessionSchema } from "../contracts/page-schema";
import type { PagePayload } from "../contracts/page";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export type DocumentPhase = "boot" | "active" | "retired";
const locationKey = () =>
  location.pathname + (location.search ? `?${new URLSearchParams(location.search)}` : "");
export class DocumentSession {
  phase: DocumentPhase = "boot";
  message = "正在确认登录状态和页面权限…";
  private generation = 0;
  private sequence = 0;
  private deadline = 0;
  private csrf = "";
  private controllers = new Set<AbortController>();
  private listeners = new Set<() => void>();
  private urls = new Set<string>();
  private inFlight = false;
  private root: HTMLElement | null = null;
  private channel: BroadcastChannel | null = null;
  private reloading = false;
  private disposed = false;
  dirty = false;
  setDirty(value: boolean) {
    this.dirty = value;
  }
  constructor(
    readonly payload: Pick<PagePayload, "page" | "session" | "viewKey">,
    private navigation?: { push(path: string): void; refresh(): void },
    previousDeadline = 0,
  ) {
    this.deadline = previousDeadline;
  }
  get displayDeadline() {
    return this.deadline;
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => `${this.phase}:${this.message}`;
  serverSnapshot = () => "boot:正在确认登录状态和页面权限…";
  attach(root: HTMLElement | null) {
    this.root = root;
  }
  private emit() {
    for (const listener of this.listeners) listener();
  }
  retire(message: string, destination?: string) {
    if (this.disposed) return;
    if (this.phase !== "retired") {
      // Hide synchronously, before React schedules the unmount or any pending callback runs.
      if (this.root) {
        this.root.hidden = true;
        this.root.inert = true;
      }
      this.phase = "retired";
      document.querySelectorAll<HTMLElement>("[data-sensitive-portal]").forEach((element) => {
        element.hidden = true;
        element.inert = true;
      });
      this.generation++;
      this.csrf = "";
      this.dirty = false;
      this.message = message;
      for (const controller of this.controllers) controller.abort();
      this.controllers.clear();
      for (const url of this.urls) URL.revokeObjectURL(url);
      this.urls.clear();
      this.emit();
    }
    if (destination) this.recover(destination);
  }
  reload(destination = locationKey()) {
    if (this.disposed) return;
    if (this.phase === "retired" || !this.navigation) return this.recover(destination);
    if (destination === locationKey()) this.navigation.refresh();
    else this.navigate(destination);
  }
  confirmNavigation() {
    if (this.dirty && !window.confirm("离开当前页面并放弃未保存的修改？")) return false;
    this.dirty = false;
    return true;
  }
  navigate(destination: string) {
    if (this.disposed || !this.confirmNavigation()) return;
    const target = new URL(destination, location.href);
    if (target.origin !== location.origin) throw new Error("Invalid navigation target");
    const path = target.pathname + target.search + target.hash;
    if (this.navigation) this.navigation.push(path);
    else this.recover(path);
  }
  private recover(destination: string) {
    if (this.disposed) return;
    if (this.reloading) return;
    this.reloading = true;
    location.replace(destination);
  }
  private current(generation: number, allowBoot = false) {
    return (
      generation === this.generation &&
      locationKey() === this.payload.viewKey &&
      (this.phase === "active"
        ? performance.now() < this.deadline
        : allowBoot && this.phase === "boot")
    );
  }
  private assertCurrent(generation: number) {
    if (this.disposed || generation !== this.generation)
      throw new DOMException("页面已切换。", "AbortError");
    if (this.phase === "boot") throw new ApiError(409, "页面正在加载，请稍候。");
    if (!this.current(generation)) {
      this.retire("页面授权校验已失效，请重新加载。");
      throw new ApiError(401, "页面已关闭，请重新加载。");
    }
  }
  async probe() {
    if (this.disposed || this.inFlight || this.phase === "retired") return;
    this.inFlight = true;
    const generation = this.generation,
      sequence = ++this.sequence,
      sentAt = performance.now();
    const controller = new AbortController();
    this.controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const params = new URLSearchParams({
        ...this.payload.session.scope,
        pageId: this.payload.page.id,
      });
      const response = await fetch(`/api/web/v1/session?${params}`, {
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
      });
      const body = await response.json();
      if (!this.current(generation, true) || sequence !== this.sequence) return;
      if (!response.ok) {
        this.retire(
          response.status === 401 ? "登录已失效，请重新登录。" : "暂时无法确认页面访问权限。",
          this.phase === "active" && response.status === 401 ? "/login" : undefined,
        );
        return;
      }
      const view = sessionSchema.safeParse(
        Object.fromEntries(Object.entries(body).filter(([key]) => key !== "csrfToken")),
      );
      if (
        !view.success ||
        typeof body.csrfToken !== "string" ||
        body.csrfToken.length !== 43 ||
        response.headers.get("X-Compass-View-Revision") !== body.viewRevision
      ) {
        this.retire("页面响应校验失败，请重新加载。");
        return;
      }
      if (
        view.data.viewRevision !== this.payload.session.viewRevision ||
        view.data.sessionId !== this.payload.session.sessionId
      ) {
        const wasActive = this.phase === "active";
        this.retire("访问权限已更新，请重新加载。", wasActive ? locationKey() : undefined);
        return;
      }
      this.deadline = Math.min(
        sentAt + 30000,
        performance.now() + Math.max(0, Date.parse(view.data.expiresAt) - Date.now()),
      );
      if (performance.now() >= this.deadline) {
        this.retire("登录已过期，请重新登录。");
        return;
      }
      this.csrf = body.csrfToken;
      this.phase = "active";
      this.emit();
    } catch {
      if (generation === this.generation && !this.snapshot().startsWith("retired:"))
        this.retire("连接暂时不可用，页面内容已收起。请恢复连接后重新加载。");
    } finally {
      clearTimeout(timeout);
      this.controllers.delete(controller);
      this.inFlight = false;
    }
  }
  start() {
    void this.probe();
    const heartbeat = setInterval(() => void this.probe(), 15000);
    const deadline = setInterval(() => {
      if (this.deadline > 0 && this.phase !== "retired" && performance.now() >= this.deadline)
        this.retire("权限确认已超时，请重新加载。");
    }, 250);
    const visibility = () => {
      if (document.visibilityState === "hidden")
        this.retire("页面已离开前台，返回后将重新确认权限。");
      else if (this.phase === "retired") this.reload();
    };
    const pagehide = () => this.retire("页面已关闭。");
    const pageshow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        this.retire("正在重新加载页面。");
        this.reload();
      }
    };
    const offline = () => this.retire("网络已断开，页面内容已收起。");
    const online = () => {
      if (this.phase === "retired") this.reload();
    };
    const beforeunload = (event: BeforeUnloadEvent) => {
      if (this.dirty && this.phase === "active") {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", pagehide);
    window.addEventListener("pageshow", pageshow);
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    window.addEventListener("beforeunload", beforeunload);
    this.channel =
      typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("compass-identity");
    if (this.channel)
      this.channel.onmessage = () => this.retire("登录身份已变化，正在重新确认。", locationKey());
    return () => {
      clearInterval(heartbeat);
      this.generation++;
      this.inFlight = false;
      clearInterval(deadline);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", pagehide);
      window.removeEventListener("pageshow", pageshow);
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
      window.removeEventListener("beforeunload", beforeunload);
      this.channel?.close();
      for (const controller of this.controllers) controller.abort();
      for (const url of this.urls) URL.revokeObjectURL(url);
      this.urls.clear();
    };
  }
  dispose() {
    this.disposed = true;
    this.generation++;
    this.dirty = false;
    this.root = null;
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.urls.clear();
  }
  async request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    const generation = this.generation;
    this.assertCurrent(generation);
    const controller = new AbortController();
    this.controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`/api/web/v1/${path}`, {
        method,
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
        headers:
          method === "GET" ? {} : { "Content-Type": "application/json", "X-CSRF-Token": this.csrf },
        ...(method === "GET" ? {} : { body: JSON.stringify(body ?? {}) }),
      });
      this.assertCurrent(generation);
      if (!response.ok) {
        const error = await response.json();
        this.assertCurrent(generation);
        if (response.status === 401) this.retire("登录已失效。", "/login");
        if (response.status === 403 || response.status === 404)
          this.retire("访问范围已变化，请重新加载。", locationKey());
        throw new ApiError(response.status, error.error?.message ?? "操作失败，请重试。");
      }
      if (response.headers.get("X-Compass-View-Revision") !== this.payload.session.viewRevision) {
        this.retire("权限配置已更新，正在重新加载。", locationKey());
        throw new ApiError(409, "页面正在重新加载。");
      }
      const value =
        response.status === 204
          ? undefined
          : response.headers.get("content-type")?.includes("text/csv")
            ? await response.blob()
            : await response.json();
      this.assertCurrent(generation);
      return value as T;
    } finally {
      clearTimeout(timeout);
      this.controllers.delete(controller);
    }
  }
  download(blob: Blob) {
    this.assertCurrent(this.generation);
    const url = URL.createObjectURL(blob);
    this.urls.add(url);
    const a = document.createElement("a");
    a.href = url;
    a.download = "compass-audit.csv";
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      this.urls.delete(url);
    }, 1000);
  }
  async logout() {
    const csrf = this.csrf;
    this.retire("正在退出登录…");
    try {
      const response = await fetch("/api/web/v1/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: "{}",
      });
      if (!response.ok) throw new Error();
      this.channel?.postMessage("logout");
      this.reload("/login");
    } catch {
      this.message = "退出请求尚未确认，请重新加载后重试。";
      this.emit();
    }
  }
}
