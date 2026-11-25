import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Authentication/recovery links intentionally reload; product navigation uses AppLink.
      "@next/next/no-html-link-for-pages": "off",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/agent/**", "**/memory/**", "**/worker/**"],
              message: "Apps communicate through HTTP contracts.",
            },
          ],
        },
      ],
    },
  },
  prettier,
  globalIgnores([".next/**", "next-env.d.ts", "src/generated/**"]),
]);
