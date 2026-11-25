"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import type { PagePayload } from "@/contracts/page";
import { DocumentSession } from "@/client/request-scope";
import { ProductContent } from "../product-content";
import { AppShell } from "./app-shell";

export type PageFailure = { title: string; message: string; path: string };
type Presentation = { payload: PagePayload } | { failure: PageFailure };
type Frame = { payload: PagePayload; session: DocumentSession; previous: PagePayload | null };
const PagePresenter = createContext<((page: Presentation) => void) | null>(null);
const SessionContext = createContext<DocumentSession | null>(null);
export function usePagePresenter() {
  const present = useContext(PagePresenter);
  if (!present) throw new Error("Product layout required");
  return present;
}
export function useDocumentSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("Session boundary required");
  return value;
}

// The route group owns this component. RSC pages only publish payloads; they never own the shell.
export function ProductApplication({ children }: { children: ReactNode }) {
  const router = useRouter();
  const current = useRef<Frame | null>(null);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [failure, setFailure] = useState<PageFailure | null>(null);
  const present = useCallback(
    (page: Presentation) => {
      const old = current.current;
      if ("failure" in page) {
        old?.session.dispose();
        current.current = null;
        setFrame(null);
        setFailure(page.failure);
        return;
      }
      if (old?.payload === page.payload || old?.session.phase === "retired") return;
      const previous = old?.session.phase === "active" ? old.payload : (old?.previous ?? null);
      const compatible =
        previous?.session.sessionId === page.payload.session.sessionId &&
        previous.session.viewRevision === page.payload.session.viewRevision;
      const session = new DocumentSession(
        page.payload,
        router,
        compatible ? old?.session.displayDeadline : 0,
      );
      old?.session.dispose();
      const next = { payload: page.payload, session, previous: compatible ? previous : null };
      current.current = next;
      setFailure(null);
      setFrame(next);
    },
    [router],
  );
  return (
    <PagePresenter.Provider value={present}>
      {children}
      {frame ? (
        <SessionBoundary frame={frame} />
      ) : (
        <main className="safe-state" role="status">
          <div className="brand-mark">C</div>
          <h1>{failure?.title ?? "Compass"}</h1>
          <p>{failure?.message ?? "正在打开工作台…"}</p>
          {failure && (
            <div className="actions">
              <button onClick={() => router.push("/workspaces")}>选择工作空间</button>
              <button className="secondary" onClick={() => router.refresh()}>
                重新加载
              </button>
            </div>
          )}
        </main>
      )}
      <noscript>
        <p className="safe-state">请启用 JavaScript 以使用工作台。</p>
      </noscript>
    </PagePresenter.Provider>
  );
}
function SessionBoundary({ frame }: { frame: Frame }) {
  const { session, payload, previous } = frame;
  useSyncExternalStore(session.subscribe, session.snapshot, session.serverSnapshot);
  useEffect(() => session.start(), [session]);
  const active = session.phase === "active";
  const visibleShell = active ? payload : session.phase === "boot" ? previous : null;
  function submit(event: FormEvent<HTMLDivElement>) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.getAttribute("method")?.toLowerCase() !== "get")
      return;
    event.preventDefault();
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form))
      if (typeof value === "string") params.append(key, value);
    session.navigate(`${location.pathname}?${params}`);
  }
  return (
    <SessionContext.Provider value={session}>
      {!visibleShell && (
        <main className="safe-state" role="status">
          <div className="brand-mark">C</div>
          <h1>Compass</h1>
          <p>{session.message}</p>
          {session.phase === "retired" && (
            <div className="actions">
              <button onClick={() => session.reload()}>重新加载</button>
              <a className="button secondary" href="/login">
                重新登录
              </a>
            </div>
          )}
        </main>
      )}
      <div
        data-protected-root
        ref={(element) => session.attach(element)}
        hidden={!visibleShell}
        inert={!visibleShell}
        onSubmitCapture={submit}
        onInputCapture={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest("[data-editor]") && !target.closest("[data-editor-ignore]"))
            session.setDirty(true);
        }}
      >
        {visibleShell && (
          <AppShell payload={visibleShell} busy={!active}>
            {active ? (
              <ProductContent key={payload.viewKey} payload={payload} />
            ) : (
              <p className="content-loading" role="status">
                正在加载页面…
              </p>
            )}
          </AppShell>
        )}
      </div>
    </SessionContext.Provider>
  );
}
