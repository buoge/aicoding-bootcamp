import Link from "next/link";
import { notFound } from "next/navigation";
import "./demo.css";
export const dynamic = "force-dynamic";
import { DemoPanel } from "@/components/demo-panel";

export default function Demo() {
  if (process.env.COMPASS_DEMO_ENABLED !== "true") notFound();
  return (
    <main className="demo-page">
      <header>
        <Link href="/" className="brand">
          <span aria-hidden="true">↗</span> Compass
        </Link>
        <span className="badge">开发预览</span>
      </header>
      <section className="intro">
        <p className="eyebrow">COMMERCE INTELLIGENCE</p>
        <h1>
          看清经营，
          <br />
          找到下一步。
        </h1>
        <p className="description">销售、订单与业务变化，从一份清晰的数据概览开始。</p>
      </section>
      <DemoPanel />
      <footer>Compass · 电商经营分析 Agent</footer>
    </main>
  );
}
