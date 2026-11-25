import { provision } from "./db-provision.mjs";
import { migrate } from "./db-migrate.mjs";
import { cli } from "./db-common.mjs";
cli(async () => {
  console.log(JSON.stringify(await provision()));
  console.log(JSON.stringify(await migrate({ mode: "native" })));
});
