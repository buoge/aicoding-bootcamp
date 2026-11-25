import "server-only";
import { randomUUID } from "node:crypto";
import type { SqlClient } from "../../platform/db";
import type { NotificationStore, NotificationRecord } from "./ports";

const visible = `(n.tenant_id IS NULL OR EXISTS (SELECT 1 FROM web.tenant_member tm JOIN web.tenant t ON t.id=tm.tenant_id WHERE tm.user_id=n.recipient_user_id AND tm.tenant_id=n.tenant_id AND tm.status='active' AND t.status='active'))`;
export function bindNotifications(
  client: SqlClient,
  authorizationNotifications: (userId: string) => Promise<boolean>,
): NotificationStore {
  return {
    async add(event, userId, security = false) {
      if (!security && !(await authorizationNotifications(userId))) return;
      await client.query(
        "INSERT INTO web.notification(id,recipient_user_id,tenant_id,event_key,kind,safe_payload) VALUES ($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT(event_key,recipient_user_id,kind) DO NOTHING",
        [
          randomUUID(),
          userId,
          event.tenantId,
          event.eventKey,
          security ? "security" : "authorization",
          JSON.stringify({
            title: security ? "账号安全状态已更新" : "成员或权限配置已更新",
            action: event.action,
          }),
        ],
      );
    },
    async list(userId, query, read) {
      const where = `n.recipient_user_id=$1 AND ${visible} AND ($2::boolean IS NULL OR (n.read_at IS NOT NULL)=$2)`;
      const count = await client.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM web.notification n WHERE ${where}`,
        [userId, read ?? null],
      );
      const { rows } = await client.query<
        Omit<NotificationRecord, "readAt" | "createdAt"> & { readAt: Date | null; createdAt: Date }
      >(
        `SELECT n.id,n.tenant_id AS "tenantId",n.kind,n.safe_payload AS "safePayload",n.read_at AS "readAt",n.created_at AS "createdAt" FROM web.notification n WHERE ${where} ORDER BY n.created_at DESC,n.id DESC LIMIT $3 OFFSET $4`,
        [userId, read ?? null, query.limit, (query.page - 1) * query.limit],
      );
      return {
        items: rows.map((row) => ({
          ...row,
          readAt: row.readAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
        })),
        total: count.rows[0].total,
        page: query.page,
        limit: query.limit,
      };
    },
    async markRead(userId, id) {
      const { rows } = await client.query(
        `SELECT n.id FROM web.notification n WHERE n.recipient_user_id=$1 AND n.id=$2 AND ${visible}`,
        [userId, id],
      );
      if (!rows.length) return false;
      await client.query(
        "UPDATE web.notification SET read_at=now() WHERE id=$1 AND recipient_user_id=$2 AND read_at IS NULL",
        [id, userId],
      );
      return true;
    },
  };
}
