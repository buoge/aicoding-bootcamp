import type { NotificationWriter, PageQuery, ListPage } from "../../platform/application-types";
export type NotificationRecord = {
  id: string;
  tenantId: string | null;
  kind: string;
  safePayload: Record<string, string>;
  readAt: string | null;
  createdAt: string;
};
export interface NotificationStore extends NotificationWriter {
  list(userId: string, query: PageQuery, read?: boolean): Promise<ListPage<NotificationRecord>>;
  markRead(userId: string, id: string): Promise<boolean>;
}
