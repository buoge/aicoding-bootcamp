"use client";

import { useState } from "react";
import { parseOverview, type DemoOverview } from "@/lib/overview";

export function DemoPanel() {
  const [overview, setOverview] = useState<DemoOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function load() {
    setLoading(true);
    setError("");
    setOverview(null);
    try {
      const response = await fetch("/api/demo/overview", { cache: "no-store" });
      if (!response.ok) throw new Error("示例数据暂不可用，请稍后重试。");
      setOverview(parseOverview(await response.json()));
    } catch {
      setError("示例数据暂不可用，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }
  return (
    <section className="overview" aria-labelledby="overview-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">示例工作空间</p>
          <h2 id="overview-title">经营概览</h2>
        </div>
        <button onClick={load} disabled={loading}>
          {loading ? "正在读取…" : "查看示例数据 ↗"}
        </button>
      </div>
      <p className="caption">使用合成数据演示；金额与订单均为虚构，无真实店铺接入。</p>
      <div aria-live="polite" aria-busy={loading}>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {overview ? (
          <>
            <p className="period">
              {overview.start_date} — {overview.end_date}
            </p>
            <dl className="metrics">
              <div>
                <dt>销售额</dt>
                <dd>
                  {new Intl.NumberFormat("zh-CN", {
                    style: "currency",
                    currency: overview.currency,
                    maximumFractionDigits: 0,
                  }).format(overview.revenue_minor / 100)}
                </dd>
              </div>
              <div>
                <dt>订单数</dt>
                <dd>
                  {overview.orders.toLocaleString("zh-CN")}
                  <small>笔</small>
                </dd>
              </div>
              <div>
                <dt>统计周期</dt>
                <dd>
                  {overview.days}
                  <small>天</small>
                </dd>
              </div>
            </dl>
          </>
        ) : (
          !error && <p className="empty">点击上方按钮，查看示例店铺的经营数据。</p>
        )}
      </div>
    </section>
  );
}
