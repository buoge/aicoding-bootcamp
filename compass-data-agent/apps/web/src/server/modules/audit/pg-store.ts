import "server-only";
import type { SqlClient } from "../../platform/db";
import type { AuditStore, AuditRecord } from "./ports";

export function bindAudit(client: SqlClient): AuditStore {
  return {
    async append(entry) {
      await client.query(
        "INSERT INTO web.audit_event(id,event_key,actor_user_id,tenant_id,workspace_id,action,target_type,target_id,outcome,safe_summary) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)",
        [
          entry.id,
          entry.eventKey,
          entry.actorUserId,
          entry.tenantId,
          entry.workspaceId,
          entry.action,
          entry.targetType,
          entry.targetId,
          entry.outcome,
          JSON.stringify(entry.safeSummary),
        ],
      );
    },
    async list(scope, filter, cursor, limit) {
      const params: unknown[] = [];
      const parameter = (value: unknown) => {
        params.push(value);
        return `$${params.length}`;
      };
      const conditions: string[] = [];
      if ("userId" in scope) {
        const user = parameter(scope.userId);
        conditions.push(
          `(actor_user_id=${user}::uuid OR (actor_user_id IS NULL AND target_type='user' AND target_id=${user}::uuid AND action=ANY(ARRAY['user.created','user.reset-password','user.set-status','user.set-platform-admin'])))`,
          "tenant_id IS NULL",
        );
      } else {
        conditions.push(`tenant_id=${parameter(scope.tenantId)}::uuid`);
        if (scope.workspaceIds !== null)
          conditions.push(`workspace_id=ANY(${parameter(scope.workspaceIds)}::uuid[])`);
      }
      if (filter.workspaceId)
        conditions.push(`workspace_id=${parameter(filter.workspaceId)}::uuid`);
      if (filter.actor) conditions.push(`actor_user_id=${parameter(filter.actor)}::uuid`);
      if (filter.action) conditions.push(`action=${parameter(filter.action)}`);
      if (filter.from) conditions.push(`occurred_at>=${parameter(filter.from)}::timestamptz`);
      if (filter.to) conditions.push(`occurred_at<=${parameter(filter.to)}::timestamptz`);
      const where = conditions.join(" AND ");
      const count = await client.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM web.audit_event WHERE ${where}`,
        params,
      );
      if (cursor)
        conditions.push(
          `(occurred_at,id)<(${parameter(cursor.time)}::timestamptz,${parameter(cursor.id)}::uuid)`,
        );
      const { rows } = await client.query<AuditRecord>(
        `SELECT id,actor_user_id AS "actorUserId",tenant_id AS "tenantId",workspace_id AS "workspaceId",action,target_type AS "targetType",target_id AS "targetId",outcome,safe_summary AS "safeSummary",to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "occurredAt" FROM web.audit_event WHERE ${conditions.join(" AND ")} ORDER BY occurred_at DESC,id DESC LIMIT ${parameter(limit)}`,
        params,
      );
      return { items: rows, total: count.rows[0].total };
    },
  };
}
