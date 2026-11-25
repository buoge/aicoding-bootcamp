import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { cli, connectManaged } from "./db-common.mjs";
import { encodePassword } from "../src/server/modules/identity/infrastructure/password.ts";
import { DEFAULT_TEMPLATES } from "../src/server/modules/access/domain/permissions.ts";

// Stable, explicitly requested teaching data. Never resets an existing account or grant.
export const fixtureId = (n) => `99500000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export async function seedTeaching(password, url) {
  const encoded = await encodePassword(password);
  const client = await connectManaged(url);
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(995002)");
    const { rows } = await client.query("SELECT id FROM web.app_user WHERE id=$1", [fixtureId(1)]);
    if (rows.length) {
      await client.query("COMMIT");
      return { status: "already_seeded" };
    }
    const names = ["platform", "admin", "analyst", "viewer", "auditor", "outsider"];
    for (let i = 0; i < names.length; i++)
      await client.query(
        "INSERT INTO web.app_user(id,login_name,password_hash,display_name,is_platform_admin) VALUES($1,$2,$3,$4,$5)",
        [
          fixtureId(i + 1),
          `teaching.${names[i]}`,
          encoded,
          ["平台管理员", "租户管理员", "经营分析师", "业务查看者", "审计员", "其他租户成员"][i],
          i === 0,
        ],
      );
    for (const [n, name, slug] of [
      [10, "远山零售", "yuanshan"],
      [11, "星河商贸", "xinghe"],
    ])
      await client.query(
        "INSERT INTO web.tenant(id,name,timezone,slug) VALUES($1,$2,'Asia/Shanghai',$3)",
        [fixtureId(n), name, slug],
      );
    for (const [n, tenant, name, slug] of [
      [20, 10, "经营总部", "zongbu"],
      [21, 10, "华东区域", "huadong"],
      [22, 11, "电商运营", "dianshang"],
    ])
      await client.query(
        "INSERT INTO web.workspace(id,tenant_id,name,description,slug) VALUES($1,$2,$3,'教学演示空间',$4)",
        [fixtureId(n), fixtureId(tenant), name, slug],
      );
    for (const [n, tenant, user, role] of [
      [30, 10, 2, "admin"],
      [31, 10, 3, "member"],
      [32, 10, 4, "member"],
      [33, 10, 5, "member"],
      [34, 11, 6, "admin"],
    ])
      await client.query(
        "INSERT INTO web.tenant_member(id,tenant_id,user_id,role_key) VALUES($1,$2,$3,$4)",
        [fixtureId(n), fixtureId(tenant), fixtureId(user), role],
      );
    for (const [n, member, role, workspace] of [
      [40, 31, "analyst", 20],
      [41, 31, "analyst", 21],
      [42, 32, "viewer", 20],
      [43, 33, "auditor", 20],
    ])
      await client.query(
        "INSERT INTO web.workspace_member(id,tenant_id,workspace_id,tenant_member_id,role_key,permission_keys) VALUES($1,$2,$3,$4,$5,$6)",
        [
          fixtureId(n),
          fixtureId(10),
          fixtureId(workspace),
          fixtureId(member),
          role,
          DEFAULT_TEMPLATES[role],
        ],
      );
    const eventId = randomUUID();
    await client.query(
      "INSERT INTO web.audit_event(id,event_key,action,target_type,outcome,safe_summary) VALUES($1,'fixture:teaching','fixture.created','fixture','success','{}')",
      [eventId],
    );
    await client.query("COMMIT");
    return { status: "seeded", users: names.map((n) => `teaching.${n}`) };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  cli(async () => {
    const { values } = parseArgs({ options: { fixture: { type: "string" } } });
    if (!values.fixture) {
      console.log("Web seed skipped: request --fixture teaching explicitly.");
      return;
    }
    if (values.fixture !== "teaching") throw new Error("Unknown fixture");
    if (!process.env.WEB_FIXTURE_PASSWORD) throw new Error("WEB_FIXTURE_PASSWORD is required");
    console.log(JSON.stringify(await seedTeaching(process.env.WEB_FIXTURE_PASSWORD)));
  });
