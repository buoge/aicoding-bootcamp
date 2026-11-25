import { LoginForm } from "@/components/login-form";
import { safeReturnPath } from "@/lib/page-catalog";
import { Compass, ArrowUpRight } from "lucide-react";
export const dynamic = "force-dynamic";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const path = typeof query.returnPath === "string" ? safeReturnPath(query.returnPath) : null;
  return (
    <main className="login-page">
      <section className="login-visual">
        <a className="login-brand" href="/">
          <Compass size={30} />
          Compass
        </a>
        <div className="login-statement">
          <p>COMMERCE INTELLIGENCE</p>
          <h1>
            看清经营，
            <br />
            找到下一步。
          </h1>
          <p>让每一次判断，都有数据可循。</p>
        </div>
        <div className="login-lines" aria-hidden />
        <footer>
          Compass · 电商经营分析 Agent <ArrowUpRight size={16} />
        </footer>
      </section>
      <section className="login-panel">
        <div>
          <p className="eyebrow">欢迎回来</p>
          <h2>登录工作台</h2>
          <p className="muted">进入你的经营分析与协作空间。</p>
          <LoginForm returnPath={path ?? undefined} />
        </div>
        <footer>企业级 Agent 工程 · Compass</footer>
      </section>
    </main>
  );
}
