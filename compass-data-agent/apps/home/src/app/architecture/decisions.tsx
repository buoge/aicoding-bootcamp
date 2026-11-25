import Image from "next/image";
import { ArrowRight, Lightbulb, ArrowUpRight, GitBranch, Layers3 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Disclosure } from "@/components/ui/disclosure";
import s from "@/components/engineering-story.module.css";
import d from "./decisions.module.css";

const reasons = [
  {
    title: "开放问题，需要动态探索",
    tag: "业务适配",
    image: "exploration",
    text: (
      <>
        {" "}
        销售下滑可能跨渠道、商品、库存与履约。Agent{" "}
        <strong className="emphasis-strong">根据新证据选择方向、调整计划</strong>
        ，处理难以提前穷举的分析路径。
      </>
    ),
    implication: "目标驱动 · 观察反馈 · 持续重规划",
  },
  {
    title: "企业交付，需要确定性保障",
    tag: "工程可控",
    image: "guardrails",
    text: (
      <>
        {" "}
        指标口径、权限、预算与证据校验<strong className="emphasis-strong">由工程机制执行</strong>
        ；高风险动作经过授权与核验，让自主分析具备可靠的交付边界。
      </>
    ),
    implication: "自主分析 + 受控执行",
  },
  {
    title: "多类任务，需要复用稳定能力",
    tag: "产品扩展",
    image: "reuse",
    text: (
      <>
        {" "}
        不同岗位和任务共享指标查询、库存核验与报告生成。
        <strong className="emphasis-strong">将稳定 Workflow 沉淀为工具</strong>，由 Skill
        描述用法，按需组合企业能力。
      </>
    ),
    implication: "Workflow 下沉 · Tool / Skill 复用",
  },
  {
    title: "持续演进，需要吸收智能增量",
    tag: "课程理念",
    image: "evolution",
    text: (
      <>
        {" "}
        为更好的规划、工具选择与重规划保留空间；
        <strong className="emphasis-strong">通过评测逐步调整自主范围</strong>
        ，把成熟的重复路径固化为 Workflow，降低探索成本。
      </>
    ),
    implication: "模型能力演进 · 能力资产沉淀 · 评测验证",
  },
] as const;

function AuthorityDiagram() {
  return (
    <figure className={s.architectureFigure}>
      <a
        href="/resources/agent-authority-architecture.png"
        target="_blank"
        rel="noreferrer"
        aria-label="查看 Agent 决策权架构原图（新窗口）"
      >
        <Image
          src="/resources/agent-authority-architecture.png"
          width={1672}
          height={941}
          unoptimized
          alt="Autonomous First 的 Hybrid 架构：自主主控 Agent 按任务组合 Plan and Execute、ReAct 与 Multi-agent；按需调用下沉为 Tool / Skill 的局部 Workflow，接收结果与证据并重规划。权限、预算、证据校验与恢复贯穿执行。"
        />
      </a>
      <figcaption>
        <span>自主主控 · 混合执行 · 稳定能力复用</span>
        <a href="/resources/agent-authority-architecture.png" target="_blank" rel="noreferrer">
          查看原图 <ArrowUpRight size={16} aria-hidden="true" />
        </a>
      </figcaption>
    </figure>
  );
}

const stackChoices = [
  {
    name: "仓库组织",
    alternatives: "多仓库 / 多语言 Monorepo",
    choice: "Monorepo · Turborepo + pnpm + uv",
    reason: "同一需求的前端、后端、契约与测试一起变更；两种语言分别管理依赖。",
    cost: "维护跨语言任务图与依赖边界；各 App 保持独立构建、部署。",
  },
  {
    name: "语言与接入",
    alternatives: "TypeScript 全栈 / Python 全栈 / 双语言分工",
    choice: "TypeScript + Next.js BFF / Python 后端",
    reason: "Web 与 BFF 一起承载交互、会话和聚合；Python 复用分析、模型与评测生态。",
    cost: "增加接口契约和一次服务调用；领域授权与 Agent 长任务由后端负责。",
  },
  {
    name: "API 框架",
    alternatives: "FastAPI / Django / Flask",
    choice: "FastAPI + Pydantic",
    reason: "契合 API 服务边界，通过类型、校验和 OpenAPI 衔接 TypeScript 契约。",
    cost: "应用自行组织领域逻辑、权限与迁移；按接口演进维护契约兼容。",
  },
  {
    name: "Agent 框架",
    alternatives: "原生 SDK / 完整 Agent SDK / LangGraph",
    choice: "自有薄 Harness + PydanticAI Direct",
    reason: "显式实现多范式循环、状态与停止条件；Direct 收敛模型适配，便于课程实验。",
    cost: "自行承担工具执行、输出校验、策略重试与循环测试；框架类型留在适配层。",
  },
  {
    name: "可靠执行",
    alternatives: "进程内 Runner / 队列加自建状态 / 持久执行引擎",
    choice: "长任务阶段引入 Temporal",
    reason: "承载持久步骤、人工等待与中断恢复；由 Harness 决定分析动作。",
    cost: "增加服务运维与工作流版本管理；I/O 进入 Activity，副作用单独保证幂等。",
  },
] as const;

export function ArchitectureDecisions() {
  return (
    <section
      id="decisions"
      data-chapter
      className={`${s.screen} ${s.sage} ${d.screen}`}
      aria-labelledby="decisions-title"
    >
      <div className={s.inner}>
        <header className={`${s.heading} ${d.heading}`}>
          <p className={s.kicker}>架构选型 · 范式、理由与实现</p>
          <h2 id="decisions-title">
            先明确谁来决策，<em>再选择实现底座。</em>
          </h2>
          <p className={s.lead}>
            自主主控、混合执行、稳定能力复用，共同组成 Autonomous First 的 Hybrid 架构。
          </p>
        </header>
        <Tabs defaultValue="authority" className={d.tabsRoot}>
          <TabsList variant="line" className={d.tabs} aria-label="架构选型内容">
            <TabsTrigger value="authority">
              <GitBranch aria-hidden="true" />
              Agent 决策权架构
            </TabsTrigger>
            <TabsTrigger value="reasons">
              <Lightbulb aria-hidden="true" />
              四大选型理由
            </TabsTrigger>
            <TabsTrigger value="stack">
              <Layers3 aria-hidden="true" />
              技术栈与框架
            </TabsTrigger>
          </TabsList>
          <TabsContent value="authority" className={d.panel}>
            <AuthorityDiagram />
          </TabsContent>
          <TabsContent value="reasons" className={d.panel}>
            <div className={d.reasons}>
              {reasons.map((reason, index) => (
                <article key={reason.tag}>
                  <Image
                    className={d.reasonArt}
                    src={`/resources/architecture-reason-${reason.image}.png`}
                    width={1254}
                    height={1254}
                    alt=""
                    unoptimized
                  />
                  <div className={d.reasonCopy}>
                    <div className={d.reasonLabel}>
                      <span>0{index + 1}</span>
                      <strong>{reason.tag}</strong>
                    </div>
                    <h3>{reason.title}</h3>
                    <p>{reason.text}</p>
                    <div className={d.implication}>{reason.implication}</div>
                  </div>
                </article>
              ))}
            </div>
            <p className={d.reasonNote}>
              第二课的选型理念：按任务结构分配决策权，让稳定流程成为可调用能力，通过评测决定如何演进。
            </p>
          </TabsContent>
          <TabsContent value="stack" className={d.panel}>
            <table className={d.table}>
              <caption className="sr-only">Compass 工程与框架的备选、选择理由和代价</caption>
              <thead>
                <tr>
                  <th scope="col">决策点与备选</th>
                  <th scope="col">本项目的选择与理由</th>
                  <th scope="col">代价与边界</th>
                </tr>
              </thead>
              <tbody>
                {stackChoices.map((row) => (
                  <tr key={row.name}>
                    <th scope="row">
                      <strong>{row.name}</strong>
                      <span>{row.alternatives}</span>
                    </th>
                    <td>
                      <span className={d.mobileLabel}>选择与理由</span>
                      <strong>{row.choice}</strong>
                      <p>{row.reason}</p>
                    </td>
                    <td>
                      <span className={d.mobileLabel}>代价与边界</span>
                      {row.cost}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Disclosure title="Agent 框架的进一步对比与职责边界" className={d.details}>
              <div className={d.frameworks}>
                <article>
                  <h3>完整 Agent SDK</h3>
                  <p>
                    以 PydanticAI Agent 为例，高层 API
                    集成工具执行、重试与结构化输出；采用它时，需要理解并接入框架的循环语义。本课程选择
                    Direct，由项目显式实现这些行为。
                  </p>
                  <a
                    href="https://pydantic.dev/docs/ai/core-concepts/direct/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Direct 与 Agent 的官方说明 <ArrowUpRight aria-hidden="true" />
                  </a>
                </article>
                <article>
                  <h3>LangGraph</h3>
                  <p>
                    支持确定性步骤和模型决策混合编排，并提供持久化与人工介入。Compass 选择薄 Harness
                    来展开讲解机制；未来引入图编排时，要与 Temporal 划清状态和恢复职责。
                  </p>
                  <a
                    href="https://docs.langchain.com/oss/python/langgraph/overview"
                    target="_blank"
                    rel="noreferrer"
                  >
                    LangGraph 官方概览 <ArrowUpRight aria-hidden="true" />
                  </a>
                </article>
                <article>
                  <h3>Temporal</h3>
                  <p>
                    通过执行历史恢复工作流，承载长任务的运行生命周期。分析动作由 Harness
                    选择，模型与工具 I/O 放入 Activity；持久执行能力与 Agent 决策权分别设计。
                  </p>
                  <a href="https://docs.temporal.io/workflows" target="_blank" rel="noreferrer">
                    Temporal Workflow 官方说明 <ArrowUpRight aria-hidden="true" />
                  </a>
                </article>
              </div>
              <p className={d.note}>
                以上选择基于本项目的教学、分析生态与可验证性需求；框架本身的能力与项目的取舍分别评估。
              </p>
            </Disclosure>
            <div className={d.sources} aria-label="工程选型参考">
              <span>工程参考</span>
              <a
                href="https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository"
                target="_blank"
                rel="noreferrer"
              >
                Turborepo 工作区 <ArrowUpRight aria-hidden="true" />
              </a>
              <a
                href="https://nextjs.org/docs/app/guides/backend-for-frontend"
                target="_blank"
                rel="noreferrer"
              >
                Next.js BFF <ArrowUpRight aria-hidden="true" />
              </a>
              <a href="https://fastapi.tiangolo.com/features/" target="_blank" rel="noreferrer">
                FastAPI 与契约 <ArrowUpRight aria-hidden="true" />
              </a>
            </div>
          </TabsContent>
        </Tabs>
        <div className={d.foot}>
          <p>
            当前已具备 Monorepo、Web / BFF、FastAPI 与数据库基线；多范式 Agent Loop、Worker 与
            Temporal 按后续课程建设。
          </p>
          <a className="ghost-control" href="#architecture">
            查看完整架构图 <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}
