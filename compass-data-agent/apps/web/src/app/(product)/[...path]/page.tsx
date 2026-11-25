import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { execute } from "@/server/composition";
import { authConfiguration } from "@/server/platform/config";
import { ApplicationError } from "@/server/platform/errors";
import { pagePayloadSchema } from "@/contracts/page-schema";
import { pageQuery, auditFilter, uuid } from "@/contracts/web";
import { ProductPage, ProductError } from "@/components/product-page";
import type { PagePayload } from "@/contracts/page";
import { matchPage } from "@/lib/page-catalog";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ path: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const path = `/${(await params).path.join("/")}`,
    search = await searchParams;
  if (/\/analysis\/(conversations|scenarios|decisions)$/.test(path))
    redirect(path.replace(/\/(conversations|scenarios|decisions)$/, ""));
  let payload: PagePayload | undefined;
  let token = "",
    login = false,
    destination: string | undefined;
  try {
    token = (await cookies()).get(authConfiguration().cookieName)?.value ?? "";
    if (!token) login = true;
    else if (!matchPage(path)) {
      const root = path.match(
        /^\/t\/([a-z0-9-]{2,36})(?:\/w\/([a-z0-9-]{2,36}))?\/(boards|admin(?:\/[a-z-]+)?)$/,
      );
      if (root) {
        const view = await execute(token, "query", ({ queries }) =>
          queries.sessionForRoute(token, {
            tenantId: root[1],
            workspaceId: root[2],
          }),
        );
        destination = view.value.navigation.find((p) => p.path.startsWith(`${root[3]}/`))?.href;
        if (!destination) throw new ApplicationError("forbidden", "当前账号无权访问此模块。");
      } else notFound();
    } else {
      const pairs = Object.entries(search).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      );
      if (Object.values(search).some(Array.isArray))
        throw new ApplicationError("validation_failed", "页面参数无效。");
      const allowed = new Set([
        "page",
        "limit",
        "q",
        "sort",
        "tenantId",
        "action",
        "actor",
        "workspaceId",
        "from",
        "to",
        "cursor",
        "fromLocal",
        "toLocal",
      ]);
      if (pairs.some(([key]) => !allowed.has(key)))
        throw new ApplicationError("validation_failed", "页面参数无效。");
      const query = pageQuery.parse(
        Object.fromEntries(pairs.filter(([key]) => ["page", "limit", "q", "sort"].includes(key))),
      );
      const filter = Object.fromEntries(
        pairs.filter(
          ([key, value]) =>
            value &&
            ["action", "actor", "workspaceId", "from", "to", "cursor", "limit"].includes(key),
        ),
      );
      for (const key of ["from", "to"])
        if (typeof search[`${key}Local`] === "string" && search[`${key}Local`])
          filter[key] = new Date(search[`${key}Local`] as string).toISOString();
      const result = await execute(token, "query", async ({ queries, identity }) => {
        if (!search.limit) query.limit = (await identity.profile(token)).preferences.pageSize ?? 20;
        return queries.page(
          token,
          path,
          query,
          auditFilter.parse(filter),
          search.tenantId ? uuid.parse(search.tenantId) : undefined,
        );
      });
      const viewKey = path + (pairs.length ? `?${new URLSearchParams(pairs)}` : "");
      payload = pagePayloadSchema.parse({ ...result.value, viewKey });
    }
  } catch (error) {
    if (error instanceof Error && "digest" in error) throw error;
    if (error instanceof ApplicationError && error.code === "unauthenticated") login = true;
    else
      return (
        <ProductError
          failure={{
            path,
            title:
              error instanceof ApplicationError && error.code === "forbidden"
                ? "暂无访问权限"
                : "暂时无法打开页面",
            message:
              error instanceof ApplicationError
                ? error.message
                : "请稍后重新加载，或返回工作空间选择入口。",
          }}
        />
      );
  }
  if (payload) {
    const canonical = payload.session.navigation.find(
      (entry) => entry.id === payload.page.id,
    )?.href;
    if (canonical && canonical !== path) redirect(canonical + payload.viewKey.slice(path.length));
    return <ProductPage payload={payload} />;
  }
  if (login) redirect(`/login?returnPath=${encodeURIComponent(path)}`);
  if (destination) redirect(destination);
  notFound();
}
