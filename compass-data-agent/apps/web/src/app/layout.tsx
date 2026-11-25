import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Compass · 电商经营分析",
  description: "从经营数据出发，看清每一步。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
