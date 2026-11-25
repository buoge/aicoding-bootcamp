import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { emitKeypressEvents } from "node:readline";
import { connectManaged, cli } from "./db-common.mjs";
import { encodePassword } from "../src/server/modules/identity/infrastructure/password.ts";

export async function readPassword() {
  if (!process.stdin.isTTY) {
    let value = "";
    for await (const chunk of process.stdin) {
      value += chunk.toString();
      if (Buffer.byteLength(value) > 1024) throw new Error("Password input too large");
    }
    return value.replace(/\r?\n$/, "");
  }
  process.stderr.write("Password (hidden): ");
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (error) => {
      process.stdin.off("keypress", listener);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stderr.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const listener = (text, key) => {
      if (key.name === "return") return finish();
      if (key.ctrl && key.name === "c") return finish(new Error("Cancelled"));
      if (key.name === "backspace") value = [...value].slice(0, -1).join("");
      else if (!key.ctrl && !key.meta && text) value += text;
      if (Buffer.byteLength(value) > 1024) finish(new Error("Password input too large"));
    };
    process.stdin.on("keypress", listener);
    process.stdin.resume();
  });
}

async function safetyEvent(client, userId, action, summary = {}) {
  const id = randomUUID();
  await client.query(
    `INSERT INTO web.audit_event(id,event_key,actor_user_id,action,target_type,target_id,outcome,safe_summary)
     VALUES($1::uuid,$1::uuid::text,NULL,$2,'user',$3,'success',$4)`,
    [id, action, userId, summary],
  );
  await client.query(
    `INSERT INTO web.notification(id,recipient_user_id,event_key,kind,safe_payload)
     VALUES($1,$2,$3,'security',$4)`,
    [randomUUID(), userId, id, { title: "账号安全设置已更新", action }],
  );
}

/** Managed credentials only. Password hashing finishes before taking database locks. */
export async function manage(input) {
  const actions = [
    "create-user",
    "reset-password",
    "set-status",
    "set-platform-admin",
    "cleanup-sessions",
  ];
  if (!actions.includes(input.action)) throw new Error("Unknown management command");
  const needsPassword = ["create-user", "reset-password"].includes(input.action);
  const encoded = needsPassword ? await encodePassword(input.password) : undefined;
  const login = String(input.loginName ?? "")
    .trim()
    .toLowerCase();
  if (input.action !== "cleanup-sessions" && !/^[a-z0-9][a-z0-9._-]{2,63}$/.test(login))
    throw new Error("Invalid login name");
  if (
    input.action === "create-user" &&
    (!input.displayName?.trim() || input.displayName.trim().length > 80)
  )
    throw new Error("Invalid display name");
  if (input.action === "set-status" && !["active", "disabled"].includes(input.status))
    throw new Error("Invalid status");
  if (input.action === "set-platform-admin" && typeof input.platformAdmin !== "boolean")
    throw new Error("Explicit platform administrator value required");
  const client = await connectManaged(input.url);
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(995002)");
    if (input.action === "cleanup-sessions") {
      const result = await client.query(
        "DELETE FROM web.web_session WHERE expires_at < now() - interval '30 days' OR revoked_at < now() - interval '30 days'",
      );
      const id = randomUUID();
      await client.query(
        "INSERT INTO web.audit_event(id,event_key,action,target_type,outcome,safe_summary) VALUES($1::uuid,$1::uuid::text,'session.cleanup','session','success',$2)",
        [id, { count: result.rowCount }],
      );
      await client.query("COMMIT");
      return { count: result.rowCount };
    }
    const {
      rows: [user],
    } = await client.query("SELECT * FROM web.app_user WHERE login_name=$1 FOR UPDATE", [login]);
    if (input.action === "create-user") {
      if (user) throw new Error("Account already exists; no changes made");
      const id = randomUUID();
      await client.query(
        "INSERT INTO web.app_user(id,login_name,password_hash,display_name,is_platform_admin) VALUES($1,$2,$3,$4,$5)",
        [id, login, encoded, input.displayName.trim(), input.platformAdmin === true],
      );
      await safetyEvent(client, id, "user.created");
      await client.query("COMMIT");
      return { id, loginName: login };
    }
    if (!user) throw new Error("Account does not exist");
    const { rows: tenants } = await client.query(
      `SELECT t.id FROM web.tenant t JOIN web.tenant_member m ON m.tenant_id=t.id
       WHERE m.user_id=$1 ORDER BY t.id FOR UPDATE OF t`,
      [user.id],
    );
    const disabling = input.action === "set-status" && input.status === "disabled";
    const removingPlatform = input.action === "set-platform-admin" && !input.platformAdmin;
    if (user.status === "active" && user.is_platform_admin && (disabling || removingPlatform)) {
      const {
        rows: [remaining],
      } = await client.query(
        "SELECT count(*)::int AS n FROM web.app_user WHERE status='active' AND is_platform_admin AND id<>$1",
        [user.id],
      );
      if (!remaining.n) throw new Error("Cannot remove the last active platform administrator");
    }
    if (disabling) {
      for (const tenant of tenants) {
        const {
          rows: [counts],
        } = await client.query(
          `SELECT count(*)::int AS n FROM web.tenant_member m JOIN web.app_user u ON u.id=m.user_id
           WHERE m.tenant_id=$1 AND m.status='active' AND m.role_key='admin' AND u.status='active' AND u.id<>$2`,
          [tenant.id, user.id],
        );
        if (!counts.n) throw new Error("Cannot disable the last active tenant administrator");
      }
    }
    if (input.action === "reset-password")
      await client.query(
        "UPDATE web.app_user SET password_hash=$2,version=version+1,updated_at=now() WHERE id=$1",
        [user.id, encoded],
      );
    if (input.action === "set-status")
      await client.query(
        "UPDATE web.app_user SET status=$2,version=version+1,updated_at=now() WHERE id=$1",
        [user.id, input.status],
      );
    if (input.action === "set-platform-admin")
      await client.query(
        "UPDATE web.app_user SET is_platform_admin=$2,version=version+1,updated_at=now() WHERE id=$1",
        [user.id, input.platformAdmin],
      );
    await client.query(
      "UPDATE web.web_session SET revoked_at=COALESCE(revoked_at,now()) WHERE user_id=$1 AND revoked_at IS NULL",
      [user.id],
    );
    for (const tenant of tenants)
      await client.query("UPDATE web.tenant SET authz_version=authz_version+1 WHERE id=$1", [
        tenant.id,
      ]);
    await safetyEvent(client, user.id, `user.${input.action}`, {
      ...(input.status ? { status: input.status } : {}),
      ...(typeof input.platformAdmin === "boolean" ? { platformAdmin: input.platformAdmin } : {}),
    });
    await client.query("COMMIT");
    return { id: user.id, loginName: login };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  cli(async () => {
    const { values, positionals } = parseArgs({
      allowPositionals: true,
      options: {
        "login-name": { type: "string" },
        "display-name": { type: "string" },
        status: { type: "string" },
        "platform-admin": { type: "string" },
        "password-stdin": { type: "boolean" },
      },
    });
    if (positionals.length !== 1) throw new Error("Specify one management command");
    if (
      values["platform-admin"] !== undefined &&
      !["true", "false"].includes(values["platform-admin"])
    )
      throw new Error("Use --platform-admin true|false");
    const action = positionals[0];
    if (
      ["create-user", "reset-password"].includes(action) &&
      !process.stdin.isTTY &&
      !values["password-stdin"]
    )
      throw new Error("Use --password-stdin for piped password input");
    const password = ["create-user", "reset-password"].includes(action)
      ? await readPassword()
      : undefined;
    console.log(
      JSON.stringify(
        await manage({
          action,
          loginName: values["login-name"],
          displayName: values["display-name"],
          status: values.status,
          platformAdmin:
            values["platform-admin"] === undefined
              ? undefined
              : values["platform-admin"] === "true",
          password,
        }),
      ),
    );
  });
