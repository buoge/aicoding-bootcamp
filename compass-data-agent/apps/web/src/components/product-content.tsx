"use client";
import type { PagePayload } from "@/contracts/page";
import { OrganizationPages } from "@/features/organization/pages";
import { PersonalPages, GovernancePages } from "@/features/personal/pages";
import { AnalysisComposer } from "./analysis-composer";
import { Blocks } from "lucide-react";
export function ProductContent({ payload }: { payload: PagePayload }) {
  const { page } = payload;
  const content =
    page.section === "analysis" ? (
      <AnalysisComposer payload={payload} />
    ) : page.kind === "placeholder" ? (
      <section className="module-placeholder">
        <div className="placeholder-icon">
          <Blocks size={28} />
        </div>
        <span className="status status-muted">待接入</span>
        <h2>{page.title}</h2>
        <p>
          {page.section === "memory" || page.id === "my-memory"
            ? "记忆、文件上传与处理能力将在后续版本接入。"
            : `${page.title}功能将在后续版本开放。`}
        </p>
        <p className="muted">页面框架已就绪，当前暂无业务内容。</p>
      </section>
    ) : page.section === "organization" ||
      ["platform-tenants", "workspaces", "access"].includes(page.id) ? (
      <OrganizationPages payload={payload} />
    ) : page.section === "personal" ? (
      <PersonalPages payload={payload} />
    ) : page.id === "guide" ? (
      <section className="panel guide">
        <p className="eyebrow">COMPASS DESIGN</p>
        <h2>清晰、克制、有据可循</h2>
        <p>
          从左侧选择工作模块，在二级导航与页签中定位功能。顶部切换工作空间，个人菜单管理资料与会话。
        </p>
        <div className="swatches">
          {["#F8F9F6", "#FFFFFF", "#202B27", "#62716A", "#1C5145", "#E5EEE7"].map((color) => (
            <div key={color}>
              <span style={{ background: color }} />
              {color}
            </div>
          ))}
        </div>
        <h3>快捷操作</h3>
        <p>
          ⌘ / Ctrl + K 搜索页面；方向键选择结果；Esc
          关闭弹层。收起侧栏后，可通过悬停或键盘聚焦预览导航。
        </p>
        <h3>当前可用</h3>
        <p>
          登录会话、工作空间、直接成员、个人权限、资料偏好与 Web
          审计。分析、报告、看板与记忆业务将在后续版本逐步开放。
        </p>
        <div className="actions">
          <button>主要操作</button>
          <button className="secondary">次要操作</button>
          <button disabled>暂不可用</button>
        </div>
      </section>
    ) : (
      <GovernancePages payload={payload} />
    );
  return content;
}
