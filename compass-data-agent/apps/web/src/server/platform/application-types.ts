export type Version = string;
export type PageQuery = { page: number; limit: number; q: string; sort: "name" | "createdAt" };
export type ListPage<T> = { items: T[]; total: number; page: number; limit: number };
export type MutationResult = { resourceId: string; version: string | null };
export type Actor = {
  userId: string;
  sessionId: string;
  isPlatformAdmin: boolean;
  expiresAt: string;
};
export type Preferences = {
  sidebarPinned?: boolean;
  pageSize?: 20 | 50 | 100;
  lastTenantId?: string | null;
  lastWorkspaceId?: string | null;
  authorizationNotifications?: boolean;
};
export type AuditEntry = {
  id: string;
  eventKey: string;
  actorUserId: string | null;
  tenantId: string | null;
  workspaceId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  outcome: "success" | "denied" | "failed" | "generated";
  safeSummary: Record<string, string | number | boolean | null | string[]>;
};
export type AuditWriter = { append(entry: AuditEntry): Promise<void> };
export type NotificationWriter = {
  add(event: AuditEntry, recipientUserId: string, security?: boolean): Promise<void>;
};
export type Transactions<C> = {
  query<T>(work: (context: C) => Promise<T>): Promise<T>;
  command<T>(work: (context: C) => Promise<T>): Promise<T>;
};
