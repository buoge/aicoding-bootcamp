import { parseArgs } from "node:util";
import { provision } from "./db-provision.mjs";
import { migrate } from "./db-migrate.mjs";
import { seedTeaching } from "./db-seed.mjs";
import { cli } from "./db-common.mjs";
cli(async () => {
  const { values } = parseArgs({ options: { fixture: { type: "string" } } });
  for (const key of ["WEB_TEST_DATABASE_URL", "WEB_TEST_MIGRATION_DATABASE_URL"]) {
    if (
      !process.env[key] ||
      !/^\/compass_web_test_[a-z0-9_]+$/.test(new URL(process.env[key]).pathname)
    )
      throw new Error(`Dedicated ${key} required`);
  }
  if (!process.env.WEB_TEST_ADMIN_URL) throw new Error("WEB_TEST_ADMIN_URL required");
  if (values.fixture && values.fixture !== "teaching") throw new Error("Unknown test fixture");
  if (values.fixture && !process.env.WEB_TEST_PASSWORD)
    throw new Error("WEB_TEST_PASSWORD required for explicit teaching fixture");
  process.env.WEB_DATABASE_URL = process.env.WEB_TEST_DATABASE_URL;
  process.env.WEB_MIGRATION_DATABASE_URL = process.env.WEB_TEST_MIGRATION_DATABASE_URL;
  process.env.WEB_PROVISION_DATABASE_URL = process.env.WEB_TEST_ADMIN_URL;
  console.log(await provision());
  console.log(await migrate());
  if (values.fixture) console.log(await seedTeaching(process.env.WEB_TEST_PASSWORD));
});
