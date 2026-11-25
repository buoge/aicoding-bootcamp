import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authConfiguration } from "@/server/platform/config";
import { execute } from "@/server/composition";
export const dynamic = "force-dynamic";
export default async function Home() {
  let destination = "/login";
  try {
    const token = (await cookies()).get(authConfiguration().cookieName)?.value;
    if (token)
      destination = (await execute(token, "query", ({ queries }) => queries.resolveRedirect(token)))
        .value;
  } catch (error) {
    if ((error as { code?: string }).code !== "unauthenticated")
      return (
        <main className="safe-state">
          <h1>工作台暂不可用</h1>
          <p>请稍后重新加载。</p>
          <a className="button" href="/">
            重试
          </a>
        </main>
      );
  }
  redirect(destination);
}
