import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";
const staticExport = process.env.HOME_STATIC_EXPORT === "1";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const config: NextConfig = {
  poweredByHeader: false,
  output: staticExport ? "export" : process.env.HOME_STANDALONE === "1" ? "standalone" : undefined,
  outputFileTracingRoot: root,
  trailingSlash: staticExport,
  devIndicators: false,
};
export default config;
