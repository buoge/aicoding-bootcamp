import "server-only";
import { createHash } from "node:crypto";
import type { SqlClient } from "../../../platform/db";
import type { Actor } from "../../../platform/application-types";
import { reject, assertVersion } from "../../../platform/errors";
import type { IdentityStore, UserRecord, Profile, SessionSummary } from "../application/ports";
import { sessionIsLive } from "../domain/session";

const userColumns =
  'id, login_name AS "loginName", display_name AS "displayName", password_hash AS "passwordHash", status, is_platform_admin AS "isPlatformAdmin", preferences, version::text';
export const tokenHash = (token: string) => createHash("sha256").update(token).digest();
export function bindIdentity(client: SqlClient): IdentityStore {
  async function user(id: string): Promise<UserRecord> {
    const { rows } = await client.query<UserRecord>(
      `SELECT ${userColumns} FROM web.app_user WHERE id=$1`,
      [id],
    );
    if (!rows[0]) reject("not_found");
    return rows[0];
  }
  function profileOf(row: UserRecord): Profile {
    return {
      id: row.id,
      loginName: row.loginName,
      displayName: row.displayName,
      preferences: row.preferences,
      version: row.version,
    };
  }
  return {
    async findUserSummary(login) {
      const { rows } = await client.query<{ id: string; status: string }>(
        "SELECT id,status FROM web.app_user WHERE login_name=$1",
        [login],
      );
      return rows[0] ?? null;
    },
    async findByLogin(login) {
      const { rows } = await client.query<UserRecord>(
        `SELECT ${userColumns} FROM web.app_user WHERE login_name=$1`,
        [login],
      );
      return rows[0] ?? null;
    },
    async locateSessionUser(token) {
      if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
      const { rows } = await client.query<{ user_id: string }>(
        "SELECT user_id FROM web.web_session WHERE token_hash=$1",
        [tokenHash(token)],
      );
      return rows[0]?.user_id ?? null;
    },
    async lockUsers(ids) {
      const unique = [...new Set(ids)].sort();
      const { rows } = await client.query<{ id: string; status: string }>(
        "SELECT id,status FROM web.app_user WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE",
        [unique],
      );
      return new Map(rows.map((row) => [row.id, { status: row.status }]));
    },
    async requireActor(token, lock = false): Promise<Actor> {
      if (!/^[A-Za-z0-9_-]{43}$/.test(token)) reject("unauthenticated");
      const { rows } = await client.query<{
        user_id: string;
        id: string;
        status: string;
        is_platform_admin: boolean;
        expires_at: Date;
        revoked_at: Date | null;
      }>(
        `SELECT s.id,s.user_id,u.status,u.is_platform_admin,s.expires_at,s.revoked_at FROM web.web_session s JOIN web.app_user u ON u.id=s.user_id WHERE s.token_hash=$1${lock ? " FOR UPDATE OF s" : ""}`,
        [tokenHash(token)],
      );
      const row = rows[0];
      if (!row || !sessionIsLive(row.status, row.expires_at, row.revoked_at, new Date()))
        reject("unauthenticated");
      return {
        userId: row.user_id,
        sessionId: row.id,
        isPlatformAdmin: row.is_platform_admin,
        expiresAt: row.expires_at.toISOString(),
      };
    },
    user,
    async profile(id) {
      return profileOf(await user(id));
    },
    async createSession(input) {
      await client.query(
        "INSERT INTO web.web_session(id,user_id,token_hash,expires_at,device_label) VALUES ($1,$2,$3,$4,$5)",
        [input.id, input.userId, input.tokenHash, input.expiresAt, input.deviceLabel],
      );
    },
    async revokeSession(userId, id) {
      const result = await client.query(
        "UPDATE web.web_session SET revoked_at=now() WHERE user_id=$1 AND id=$2 AND revoked_at IS NULL RETURNING id",
        [userId, id],
      );
      return result.rowCount === 1;
    },
    async sessions(userId, query) {
      const { rows } = await client.query<{
        id: string;
        deviceLabel: string;
        createdAt: Date;
        expiresAt: Date;
        revokedAt: Date | null;
      }>(
        'SELECT id,device_label AS "deviceLabel",created_at AS "createdAt",expires_at AS "expiresAt",revoked_at AS "revokedAt" FROM web.web_session WHERE user_id=$1 ORDER BY created_at DESC,id LIMIT $2 OFFSET $3',
        [userId, query.limit, (query.page - 1) * query.limit],
      );
      const count = await client.query<{ total: number }>(
        "SELECT count(*)::int AS total FROM web.web_session WHERE user_id=$1",
        [userId],
      );
      const items: SessionSummary[] = rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        revokedAt: row.revokedAt?.toISOString() ?? null,
      }));
      return { items, total: count.rows[0].total, page: query.page, limit: query.limit };
    },
    async updateProfile(userId, patch, expectedVersion) {
      const { rows } = await client.query<UserRecord>(
        `UPDATE web.app_user SET display_name=COALESCE($2,display_name),preferences=preferences || $3::jsonb,version=version+1,updated_at=now() WHERE id=$1 AND version=$4::bigint RETURNING ${userColumns}`,
        [
          userId,
          patch.displayName ?? null,
          JSON.stringify(patch.preferences ?? {}),
          expectedVersion,
        ],
      );
      if (!rows[0]) {
        assertVersion((await user(userId)).version, expectedVersion);
        reject("conflict");
      }
      return profileOf(rows[0]);
    },
  };
}
