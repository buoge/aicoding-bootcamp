"use client";
import { AppLink } from "./app-link";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type PointerEvent,
} from "react";
import { DropdownMenu, Dialog } from "radix-ui";
import { ChevronDown, ArrowRight, UserRound, ShieldCheck } from "lucide-react";
import {
  NavigationIcon,
  primaryIcons,
  governanceIcons,
  secondaryIcons,
  type NavigationIconName,
} from "./navigation-icons";
import type { PagePayload, NavigationEntry } from "@/contracts/page";
import { PRIMARY_SECTIONS, ADMIN_SECTIONS } from "@/lib/page-catalog";
import type { ListPage, NotificationDto } from "@/contracts/web";
import { useDocumentSession } from "./session-boundary";
import { Modal } from "../ui/dialog";

const compactQuery = "(max-width: 900px)";
const subscribeCompact = (listener: () => void) => {
  const query = window.matchMedia(compactQuery);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
};
const getCompact = () => window.matchMedia(compactQuery).matches;
const serverCompact = () => false;
const descriptions: Record<string, string> = {
  reports: "沉淀每一次分析的成果",
  plugins: "把好方法，带进每一次分析",
  boards: "同一份口径，持续观察经营",
  automations: "按计划刷新，持续追踪变化",
  admin: "配置、运行与治理",
};
export function AppShell({
  payload,
  children,
  busy = false,
}: {
  payload: PagePayload;
  children: ReactNode;
  busy?: boolean;
}) {
  const api = useDocumentSession(),
    { page, session } = payload;
  const pinned = session.user.preferences.sidebarPinned !== false;
  const compact = useSyncExternalStore(subscribeCompact, getCompact, serverCompact);
  const floating = !pinned || compact;
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const railRef = useRef<HTMLElement>(null);
  const [savingPin, setSavingPin] = useState(false),
    [pinError, setPinError] = useState("");
  const [preview, setPreview] = useState<string | null>(null),
    [mobile, setMobile] = useState(false);
  const [search, setSearch] = useState(false),
    [notifications, setNotifications] = useState<ListPage<NotificationDto> | null>(null),
    [notificationError, setNotificationError] = useState("");
  const [renderedPayload, setRenderedPayload] = useState(payload);
  if (renderedPayload !== payload) {
    setRenderedPayload(payload);
    setPreview(null);
    setMobile(false);
    setSearch(false);
    setNotifications(null);
    setNotificationError("");
    setSavingPin(false);
    setPinError("");
  }
  const [conversationOrder, setConversationOrder] = useState("time");
  const sidebarRef = useRef<HTMLElement>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const isAdmin = ADMIN_SECTIONS.includes(page.section),
    currentSection = isAdmin ? "admin" : page.section,
    section = preview ?? currentSection;
  const navigation = session.navigation;
  const primary = PRIMARY_SECTIONS.flatMap((key) => {
    const entry = navigation.find((p) => p.section === key);
    return entry ? [entry] : [];
  });
  const adminEntries = ADMIN_SECTIONS.flatMap((key) => {
    const entry = navigation.find((p) => p.section === key);
    return entry ? [entry] : [];
  });
  const entries =
    section === "admin" ? adminEntries : navigation.filter((p) => p.section === section);
  const sidebarTitle =
    section === "admin"
      ? "管理与治理"
      : section === "analysis"
        ? "分析空间"
        : (entries[0]?.sectionTitle ?? "工作台");
  function clearTimers() {
    clearTimeout(hoverTimer.current);
    clearTimeout(leaveTimer.current);
  }
  function enterNavigation() {
    clearTimeout(leaveTimer.current);
  }
  function leaveNavigation(event: PointerEvent<HTMLElement>) {
    if (event.pointerType === "touch") return;
    if (
      event.relatedTarget instanceof Element &&
      event.relatedTarget.closest("[data-navigation-region]")
    )
      return;
    clearTimers();
    leaveTimer.current = setTimeout(() => {
      if (!sidebarRef.current?.contains(document.activeElement)) setPreview(null);
    }, 240);
  }
  useEffect(
    () => () => {
      clearTimers();
    },
    [payload, compact, mobile],
  );
  useEffect(() => {
    const query = window.matchMedia(compactQuery);
    const change = () => {
      clearTimers();
      setPreview(null);
      if (!query.matches) setMobile(false);
    };
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    const outside = (event: Event) => {
      if (event.target instanceof Element && !event.target.closest("[data-navigation-region]")) {
        clearTimers();
        setPreview(null);
      }
    };
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearch(true);
      }
      if (e.key === "Escape" && preview && !document.querySelector('[role="dialog"]')) {
        clearTimers();
        railRef.current?.querySelector<HTMLAnchorElement>(`[data-nav-group="${preview}"]`)?.focus();
        setPreview(null);
      }
    };
    window.addEventListener("keydown", key);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    return () => {
      window.removeEventListener("keydown", key);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
    };
  }, [preview]);
  async function togglePinned() {
    if (savingPin) return;
    if (compact || mobile) {
      clearTimers();
      setPreview(null);
      setMobile(false);
      mobileTriggerRef.current?.focus();
      return;
    }
    const next = !pinned;
    const target = next && preview && preview !== currentSection ? entries[0]?.href : null;
    if (target && !api.confirmNavigation()) return;
    setSavingPin(true);
    setPinError("");
    try {
      await api.request("me", "PATCH", {
        preferences: { sidebarPinned: next },
        expectedVersion: session.user.version,
      });
      if (target) api.navigate(target);
      else api.reload();
      if (!next) document.getElementById("main-content")?.focus();
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setSavingPin(false);
      setPinError("侧栏偏好未保存，请重试。");
    }
  }
  async function showNotifications() {
    setNotificationError("");
    try {
      setNotifications(await api.request<ListPage<NotificationDto>>("me/notifications?limit=5"));
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setNotificationError(e instanceof Error ? e.message : "通知加载失败。");
    }
  }
  function railItem(entry: NavigationEntry, icon: NavigationIconName, key = entry.section) {
    return (
      <AppLink
        key={key}
        href={entry.href}
        className={`rail-item ${currentSection === key ? "active" : ""}`}
        aria-label={
          key === "admin"
            ? "管理与治理"
            : key === "guide"
              ? "设计体系与体验指南"
              : entry.sectionTitle
        }
        aria-current={currentSection === key ? "page" : undefined}
        data-nav-group={key}
        aria-controls={mobile ? "mobile-secondary-sidebar" : "secondary-sidebar"}
        aria-expanded={
          mobile ? section === key : (!floating || Boolean(preview)) && section === key
        }
        onPointerEnter={(event) => {
          if (event.pointerType === "touch" || !floating || mobile) return;
          clearTimers();
          hoverTimer.current = setTimeout(() => {
            if (!document.querySelector('[role="dialog"]')) setPreview(key);
          }, 120);
        }}
        onPointerLeave={leaveNavigation}
        onFocus={() => {
          if (floating && !mobile) {
            clearTimers();
            setPreview(key);
          }
        }}
        onClick={(event) => {
          if (!mobile && floating && currentSection === key) {
            event.preventDefault();
            clearTimers();
            setPreview(key);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") {
            e.preventDefault();
            clearTimers();
            if (floating || mobile) setPreview(key);
            requestAnimationFrame(() =>
              document
                .getElementById(mobile ? "mobile-secondary-sidebar" : "secondary-sidebar")
                ?.querySelector<HTMLElement>("a,button:not(:disabled)")
                ?.focus(),
            );
          }
        }}
      >
        <NavigationIcon name={icon} size={21} />
        <span className="rail-tooltip" role="tooltip">
          {key === "admin"
            ? "管理与治理"
            : key === "guide"
              ? "设计体系与体验指南"
              : entry.sectionTitle}
        </span>
      </AppLink>
    );
  }
  function profileMenu() {
    return (
      <DropdownMenu.Root>
        <DropdownMenu.Trigger className="rail-profile" aria-label="个人菜单">
          {session.user.displayName.slice(0, 1)}
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="dropdown"
            side="right"
            sideOffset={12}
            data-sensitive-portal
          >
            <div className="menu-caption">
              {session.user.displayName}
              <small>{session.user.loginName}</small>
            </div>
            {navigation
              .filter((p) => p.section === "personal" || p.section === "platform")
              .map((p) => (
                <DropdownMenu.Item key={p.id} asChild>
                  <AppLink href={p.href}>{p.title}</AppLink>
                </DropdownMenu.Item>
              ))}
            <DropdownMenu.Separator />
            <DropdownMenu.Item onSelect={() => void api.logout()}>
              <NavigationIcon name="logout" size={15} />
              退出登录
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    );
  }
  function sidebar() {
    return (
      <>
        <div className="secondary-header">
          {section === "analysis" ? (
            <AppLink className="secondary-brand" href="/">
              Compass<span>分析空间</span>
            </AppLink>
          ) : (
            <h2 className="secondary-brand secondary-module-title">{sidebarTitle}</h2>
          )}
          <div className="secondary-header-actions">
            {section === "analysis" && (
              <button
                className="icon-button"
                title="搜索页面和工作空间 · ⌘ / Ctrl K"
                aria-label="搜索页面和工作空间"
                onClick={() => setSearch(true)}
              >
                <NavigationIcon name="search" size={17} />
              </button>
            )}
            <button
              className="icon-button pin-control"
              aria-label={compact || mobile ? "关闭导航" : pinned ? "收起侧栏" : "固定侧栏"}
              disabled={savingPin}
              aria-busy={savingPin}
              onClick={togglePinned}
            >
              <NavigationIcon name={compact || mobile ? "close" : "menu"} size={17} />
            </button>
          </div>
        </div>
        {pinError && (
          <p role="alert" className="sidebar-note">
            {pinError}
          </p>
        )}
        <div className="secondary-content">
          {section === "automations" && entries.some((entry) => entry.id === "automations-new") && (
            <AppLink
              className="sidebar-create-button"
              href={entries.find((entry) => entry.id === "automations-new")!.href}
            >
              <NavigationIcon name="plus" />
              新建定时任务
            </AppLink>
          )}
          {descriptions[section] && (
            <p className="secondary-description">{descriptions[section]}</p>
          )}
          {section !== "analysis" && (
            <nav
              className={`secondary-links ${section === "admin" || section === "automations" ? "secondary-links-roomy" : ""}`}
              aria-label="二级导航"
            >
              {entries
                .filter((entry) => entry.id !== "automations-new")
                .map((entry) => {
                  const icon =
                    section === "admin" ? governanceIcons[entry.section] : secondaryIcons[entry.id];
                  const selected =
                    section === "admin" ? entry.section === page.section : entry.id === page.id;
                  return (
                    <AppLink
                      key={entry.id}
                      href={entry.href}
                      className={`nav-item ${selected ? "active" : ""}`}
                      aria-current={selected ? "page" : undefined}
                    >
                      <NavigationIcon name={icon} />
                      <span>{section === "admin" ? entry.sectionTitle : entry.title}</span>
                    </AppLink>
                  );
                })}
            </nav>
          )}
          {section === "analysis" && (
            <>
              <button
                className="sidebar-create-button new-analysis-button"
                onClick={() => {
                  const target = entries.find((entry) => entry.id === "analysis-new")?.href;
                  if (!target) return;
                  if (page.id === "analysis-new") {
                    if (api.confirmNavigation()) api.reload();
                  } else api.navigate(target);
                }}
              >
                <NavigationIcon name="plus" />
                新建分析
              </button>
              <div className="conversation-order" role="group" aria-label="会话分组方式">
                <button
                  aria-pressed={conversationOrder === "time"}
                  onClick={() => setConversationOrder("time")}
                >
                  按时间
                </button>
                <button
                  aria-pressed={conversationOrder === "topic"}
                  onClick={() => setConversationOrder("topic")}
                >
                  按主题
                </button>
              </div>
              <div
                className="conversation-list"
                aria-live="polite"
                data-group-by={conversationOrder}
              >
                <p className="conversation-empty">
                  {conversationOrder === "time" ? "暂无分析会话" : "暂无主题会话"}
                </p>
              </div>
            </>
          )}
          {section === "reports" && (
            <p className="sidebar-note">
              最近产物
              <br />
              <small>暂无已生成的报告。</small>
            </p>
          )}
          <div className="sidebar-spacer" />
          <AppLink className="nav-item" href="/workspaces">
            <NavigationIcon name="grid" />
            <span>切换工作空间</span>
          </AppLink>
        </div>
        <div className="secondary-foot">
          <span className="workspace-dot" />
          <span>{session.tenant?.name ?? "个人工作台"}</span>
          <small>工作空间</small>
        </div>
      </>
    );
  }
  return (
    <div
      className={`application ${!pinned ? "sidebar-collapsed" : ""} ${preview ? "nav-preview" : ""}`}
    >
      <nav
        ref={railRef}
        className="primary-rail"
        aria-label="一级导航"
        data-navigation-region
        onPointerEnter={enterNavigation}
        onPointerLeave={leaveNavigation}
      >
        <AppLink className="rail-logo" href="/" aria-label="Compass 首页">
          <NavigationIcon name="compass" size={29} />
        </AppLink>
        <div className="rail-main">
          {primary.map((entry) => railItem(entry, primaryIcons[entry.section]))}
          {adminEntries[0] && (
            <>
              <div className="rail-divider" />
              {railItem(adminEntries[0], "shield", "admin")}
            </>
          )}
        </div>
        <div className="rail-bottom">
          {navigation.find((entry) => entry.id === "guide") &&
            railItem(
              navigation.find((entry) => entry.id === "guide")!,
              "grid",
              "guide",
            )}
          {profileMenu()}
        </div>
      </nav>
      <aside
        id="secondary-sidebar"
        ref={sidebarRef}
        className="secondary-sidebar"
        data-navigation-region
        inert={floating && !preview}
        aria-hidden={floating && !preview}
        onPointerEnter={enterNavigation}
        onPointerLeave={leaveNavigation}
      >
        {sidebar()}
      </aside>
      <div className="shell">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-toggle"
              ref={mobileTriggerRef}
              aria-label="展开导航"
              aria-expanded={mobile}
              aria-controls="mobile-secondary-sidebar"
              onClick={() => setMobile(true)}
            >
              <NavigationIcon name="menu" size={20} />
            </button>
            <div className="breadcrumb">
              {isAdmin ? "管理与治理" : page.sectionTitle}
              <span> / </span>
              <strong>{page.title}</strong>
            </div>
          </div>
          <div className="topbar-right">
            <AppLink className="context-switch" href="/workspaces">
              {session.workspace?.name ?? session.tenant?.name ?? "选择工作空间"}
              <ChevronDown size={14} />
            </AppLink>
            <button className="icon-button" aria-label="全局搜索" onClick={() => setSearch(true)}>
              <NavigationIcon name="search" />
            </button>
            <button className="icon-button" aria-label="通知" onClick={showNotifications}>
              <NavigationIcon name="bell" />
            </button>
            <AppLink className="icon-button" href="/settings/profile" aria-label="个人设置">
              <UserRound size={18} />
            </AppLink>
          </div>
        </header>
        <main
          className={`main ${page.section === "analysis" ? "analysis-main" : ""}`}
          id="main-content"
          tabIndex={-1}
          aria-busy={busy}
        >
          <div className={page.section === "analysis" ? "sr-only" : "page-heading"}>
            <div>
              <p className="eyebrow">
                {isAdmin ? "工作台管理" : (session.workspace?.name ?? "COMPASS")}
              </p>
              <h1>{isAdmin ? page.sectionTitle : page.title}</h1>
              <p className="muted">
                {isAdmin
                  ? "管理当前访问范围内的工作空间、配置与协作。"
                  : "从经营数据出发，看清每一步。"}
              </p>
            </div>
            {session.workspace?.status === "archived" && (
              <span className="status status-muted">空间已归档</span>
            )}
          </div>
          {isAdmin && navigation.filter((entry) => entry.section === page.section).length > 1 && (
            <nav className="route-tabs" aria-label="管理页签">
              {navigation
                .filter((p) => p.section === page.section)
                .map((p) => (
                  <AppLink
                    key={p.id}
                    href={p.href}
                    className={p.id === page.id ? "active" : ""}
                    aria-current={p.id === page.id ? "page" : undefined}
                  >
                    {p.title}
                  </AppLink>
                ))}
            </nav>
          )}
          {children}
        </main>
      </div>
      <Dialog.Root open={mobile} onOpenChange={setMobile}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" data-sensitive-portal />
          <Dialog.Content
            className="mobile-nav"
            data-sensitive-portal
            aria-describedby={undefined}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              mobileTriggerRef.current?.focus();
            }}
          >
            <Dialog.Title className="sr-only">导航</Dialog.Title>
            <nav className="mobile-primary" aria-label="一级导航" data-navigation-region>
              <AppLink className="rail-logo" href="/" aria-label="Compass 首页">
                <NavigationIcon name="compass" size={29} />
              </AppLink>
              <div className="rail-main">
                {primary.map((entry) => railItem(entry, primaryIcons[entry.section]))}
                {adminEntries[0] && (
                  <>
                    <div className="rail-divider" />
                    {railItem(adminEntries[0], "shield", "admin")}
                  </>
                )}
              </div>
              <div className="rail-bottom">
                {navigation.find((entry) => entry.id === "guide") &&
                  railItem(
                    navigation.find((entry) => entry.id === "guide")!,
                    "grid",
                    "guide",
                  )}
                {profileMenu()}
              </div>
            </nav>
            <div id="mobile-secondary-sidebar" data-navigation-region>
              {sidebar()}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {search && <NavigationSearch onClose={() => setSearch(false)} payload={payload} />}
      {notificationError && (
        <p role="alert" className="toast error">
          {notificationError}
        </p>
      )}
      {notifications && (
        <Modal open title="站内通知" onClose={() => setNotifications(null)}>
          <div className="notification-list">
            {notifications.items.length ? (
              notifications.items.map((n) => (
                <article key={n.id}>
                  <ShieldCheck size={18} />
                  <div>
                    <strong>{String(n.safePayload.title ?? "配置更新")}</strong>
                    <p>{new Date(n.createdAt).toLocaleString("zh-CN")}</p>
                  </div>
                  {!n.readAt && <span className="unread-dot" />}
                </article>
              ))
            ) : (
              <p className="muted">暂无通知</p>
            )}
          </div>
          <AppLink href="/settings/notifications" className="button secondary">
            查看全部通知
          </AppLink>
        </Modal>
      )}
    </div>
  );
}
function NavigationSearch({ onClose, payload }: { onClose: () => void; payload: PagePayload }) {
  const api = useDocumentSession();
  const [query, setQuery] = useState(""),
    [items, setItems] = useState<{ id: string; title: string; href: string; kind: string }[]>([]),
    [error, setError] = useState(""),
    [selected, setSelected] = useState(0);
  const sequence = useRef(0);
  async function search(q: string) {
    setQuery(q);
    const seq = ++sequence.current;
    try {
      const result = await api.request<{ items: typeof items }>(
        `search?${new URLSearchParams({ ...payload.session.scope, q, limit: "20" })}`,
      );
      if (seq !== sequence.current) return;
      setItems(result.items);
      setSelected(0);
      setError("");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (seq === sequence.current) setError(e instanceof Error ? e.message : "搜索失败。");
    }
  }
  return (
    <Modal
      open
      title="搜索页面与工作空间"
      description="按名称查找当前可访问的页面、成员和工作空间。"
      onClose={onClose}
    >
      <input
        autoFocus
        aria-label="搜索关键词"
        placeholder="输入名称…"
        value={query}
        maxLength={80}
        onChange={(e) => void search(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelected((i) => Math.min(i + 1, items.length - 1));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelected((i) => Math.max(0, i - 1));
          }
          if (e.key === "Enter" && items[selected]) api.navigate(items[selected].href);
        }}
      />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="search-results">
        {items.map((item, i) => (
          <AppLink
            key={`${item.kind}-${item.id}`}
            className={i === selected ? "selected" : ""}
            href={item.href}
          >
            <NavigationIcon name="search" size={16} />
            <span>
              {item.title}
              <small>
                {item.kind === "page" ? "页面" : item.kind === "workspace" ? "工作空间" : "成员"}
              </small>
            </span>
            <ArrowRight size={16} />
          </AppLink>
        ))}
      </div>
      <p className="muted">↑ ↓ 选择 · Enter 打开 · Esc 关闭</p>
    </Modal>
  );
}
