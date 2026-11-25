import type { AuditEntry } from "../../platform/application-types";
export type AuditFilter = {
  action?: string;
  actor?: string;
  workspaceId?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit: number;
};
export type AuditScope = { tenantId: string; workspaceIds: string[] | null } | { userId: string };
export type AuditRecord = Omit<AuditEntry, "eventKey"> & { occurredAt: string };
export type AuditPage = { items: AuditRecord[]; total: number; nextCursor: string | null };
export interface AuditStore {
  append(entry: AuditEntry): Promise<void>;
  list(
    scope: AuditScope,
    filter: AuditFilter,
    cursor: { time: string; id: string } | null,
    limit: number,
  ): Promise<{ items: AuditRecord[]; total: number }>;
}
