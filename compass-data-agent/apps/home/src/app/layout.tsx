import type { Metadata } from "next";
import "./globals.css";
import { SiteHeader, SiteFooter } from "@/components/site-shell";
import { PageScroll } from "@/components/page-scroll";

export const metadata: Metadata = {
  title: { default: "Compass · 电商经营分析 Agent", template: "%s · Compass" },
  description:
    "Compass 面向电商团队，通过对话查询数据、诊断经营变化并生成带证据的报告。查看产品原型、系统架构与企业级Agent工程架构实战营的项目任务。",
  applicationName: "Compass",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <SiteHeader />
        <PageScroll />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
