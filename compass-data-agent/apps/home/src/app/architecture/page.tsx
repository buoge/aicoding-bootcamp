import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Blocks,
  Building2,
  ChartNoAxesCombined,
  Clock3,
  Database,
  FileCheck2,
  Gauge,
  GitBranch,
  Layers3,
  ListChecks,
  LockKeyhole,
  ScanSearch,
  Settings2,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import { StoryPage } from "@/components/story-page";
import { DataScaleDetails } from "@/components/data-scale";
import { BusinessData } from "@/components/business-data";
import { SystemData } from "@/components/system-data";
import { ArchitectureDecisions } from "./decisions";
import s from "@/components/engineering-story.module.css";

export const metadata: Metadata = {
  title: "技术架构",
  description:
    "从架构挑战、业务数据与架构目标出发，理解 Autonomous First 的 Hybrid 架构与技术选型，并按领域查看 Compass DataAgent 系统的完整数据结构。",
};
const chapters = [
  ["challenges", "架构挑战"],
  ["business-data", "业务数据结构"],
  ["goals", "架构目标"],
  ["decisions", "架构选型"],
  ["architecture", "架构方案"],
  ["system-data", "系统数据结构"],
] as const;
const challenges = [
  {
    icon: Database,
    title: "数据量",
    metric: "111,055 笔订单",
    detail:
      "已生成 156,180 条订单明细、170,839 个商品单件，跨 36 个月做同期比较、退款回溯与商品下钻。",
  },
  {
    icon: Layers3,
    title: "多源关联",
    metric: "8 类模拟数据来源",
    detail: "订单头 / 行、支付、库存、退款、成本与渠道费用，需统一 SKU、时间口径与关联键。",
  },
  {
    icon: Building2,
    title: "多租户",
    metric: "3 家独立企业",
    detail: "行野运动 + 2 家小型企业，合计 36,000 名会员；租户隔离与企业内授权分开处理。",
  },
  {
    icon: Workflow,
    title: "并发任务",
    metric: "临时追问 + 定时监测",
    detail: "经营分析、周期报表与库存监测争用模型、查询和计算资源，需按租户排队与限额。",
  },
  {
    icon: Clock3,
    title: "异步任务",
    metric: "数据晚到，分析仍可续跑",
    detail: "渠道日报未到齐先等待；报告发出前等授权；进程中断后恢复已提交的步骤。",
  },
  {
    icon: ScanSearch,
    title: "循证归因",
    metric: "从销量下降查到补货记录",
    detail: "缺码与销量同降只说明相关；要解释补货延迟，必须核对到货、签收与库存流水。",
  },
  {
    icon: ListChecks,
    title: "上下文工程",
    metric: "805,572 条行为事件",
    detail: "会话、浏览、加购与订单先过滤聚合；每一步只装入相关指标、样本和可回查的证据。",
  },
  {
    icon: LockKeyhole,
    title: "权限隔离",
    metric: "查得到，还要有权看",
    detail: "区域经理限定到本区域，渠道负责人限定到本渠道；查询列、计算快照、报告分享逐次校验。",
  },
];
const goals = [
  {
    icon: Gauge,
    title: "大小模型分流",
    text: "分类、结构化抽取优先小模型；复杂规划与归因按能力和评测结果选择更强模型。",
  },
  {
    icon: Settings2,
    title: "资产按版本生效",
    text: "发布 Prompt、Skill 与报告模板，Run 记录配置版本；可回查生成报告时所用的方法。",
  },
  {
    icon: FileCheck2,
    title: "结论可回到原始证据",
    text: "渠道贡献关联销售、商品成本和费用计算；无法验证的原因列入待补证清单。",
  },
  {
    icon: GitBranch,
    title: "长任务可恢复",
    text: "关页面不取消任务；人工决定后继续，重试前核对已提交步骤与行动回执。",
  },
  {
    icon: ShieldCheck,
    title: "授权贯穿执行与分享",
    text: "查询限定当前租户与经营范围，Sandbox 只读授权快照，分享报告复核接收人权限。",
  },
  {
    icon: ChartNoAxesCombined,
    title: "质量与成本可度量",
    text: "每次 Run 记录模型用量、耗时和失败步骤；用固定案例对比答案、证据与恢复结果。",
  },
];

export default function ArchitecturePage() {
  return (
    <StoryPage chapters={chapters} label="技术架构章节">
      <section
        id="challenges"
        data-chapter
        className={`${s.screen} ${s.mist} ${s.challengeScreen}`}
        aria-labelledby="challenges-title"
      >
        <div className={s.inner}>
          <header className={s.heading}>
            <p className={s.kicker}>技术架构 · 架构挑战</p>
            <h1 id="challenges-title">
              11.1 万笔订单，
              <br />
              <em>753.9 万条业务记录。</em>
            </h1>
            <p className={s.lead}>
              已交付 71 张关系表、160 个 SPU、1,280 个 SKU，覆盖 2023–2025 年经营历史。
              <br />
              一次经营诊断，要跨来源、跨时间，也要守住数据权限。
            </p>
          </header>
          <div className={s.challengeGrid}>
            {challenges.map(({ icon: Icon, title, metric, detail }) => (
              <article key={title}>
                <Icon aria-hidden="true" />
                <span className={s.challengeLabel}>{title}</span>
                <h2>{metric}</h2>
                <p>{detail}</p>
              </article>
            ))}
          </div>
          <DataScaleDetails />
          <p className={s.footnote}>
            数据规模来自 2026-10-23 正式交付的合成业务包，共 7,538,707 条记录；售后尾期延续至
            2026-03-31。并发、时延与成本仍需独立压测。
          </p>
        </div>
      </section>
      <BusinessData />
      <section
        id="goals"
        data-chapter
        className={`${s.screen} ${s.dark}`}
        aria-labelledby="goals-title"
      >
        <div className={s.inner}>
          <header className={s.heading}>
            <p className={s.kicker}>架构目标</p>
            <h2 id="goals-title">
              底座稳定复用，<em>业务灵活生长。</em>
            </h2>
            <p className={s.lead}>
              更换分析领域，优先调整领域策略、指标与资产；通用运行能力保持稳定。
            </p>
          </header>
          <div className={s.runtimeDiagram} aria-label="业务 Harness 通过稳定契约复用通用 Runtime">
            <div className={s.harnessBand}>
              <Blocks aria-hidden="true" />
              <div>
                <h3>
                  Harness <span>业务强相关</span>
                </h3>
                <p>领域规划 · 指标语义 · 取证方法 · 验证与停止条件</p>
              </div>
              <span className={s.domainLabel}>电商经营分析</span>
            </div>
            <div className={s.contractBridge}>
              <span>显式状态与能力契约</span>
              <ArrowDown size={18} aria-hidden="true" />
              <span>数据源与资产可替换</span>
            </div>
            <div className={s.runtimeBand}>
              <Workflow aria-hidden="true" />
              <div>
                <h3>
                  Runtime <span>业务无关</span>
                </h3>
                <p>模型调用 · 任务调度 · 预算与重试 · 事件与产物契约</p>
              </div>
              <span className={s.domainLabel}>跨分析场景复用</span>
            </div>
          </div>
          <div className={s.goalGrid}>
            {goals.map(({ icon: Icon, title, text }) => (
              <article key={title}>
                <Icon size={20} aria-hidden="true" />
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </article>
            ))}
          </div>
          <p className={s.footnote}>
            240 门店 × 3,000 个经营 SKU × 365 天 ≈ 2.63
            亿条库存快照。明细在计算侧处理，上下文保留结果与证据引用。
          </p>
        </div>
      </section>
      <ArchitectureDecisions />
      <section
        id="architecture"
        data-chapter
        className={`${s.screen} ${s.white} ${s.architectureScreen}`}
        aria-labelledby="architecture-title"
      >
        <div className={s.inner}>
          <header className={s.heading}>
            <p className={s.kicker}>架构方案</p>
            <h2 id="architecture-title">
              每一层，<em>各司其职。</em>
            </h2>
            <p className={s.lead}>
              将 Autonomous First 的 Hybrid 架构与技术选型落到各层，安全治理与可观测评测贯穿全程。
            </p>
          </header>
          <figure className={s.architectureFigure}>
            <a
              href="/resources/system-architecture.png"
              target="_blank"
              rel="noreferrer"
              aria-label="查看完整系统架构图（新窗口）"
            >
              <Image
                src="/resources/system-architecture.png"
                width={1402}
                height={1122}
                unoptimized
                alt="DataAgent 企业级 Agent 分层架构：应用体验、接入与 BFF、领域服务、持久调度、Agent Runtime、能力接入与隔离、数据与存储、部署基础设施，以及跨层的安全治理与可观测评测。"
              />
            </a>
            <figcaption>
              <span>目标系统架构 · 分阶段建设</span>
              <a href="/resources/system-architecture.png" target="_blank" rel="noreferrer">
                查看原图 <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            </figcaption>
          </figure>
          <div className={s.next}>
            <p>从可运行的工程基线开始，逐步实现这些能力。</p>
            <Link href="/scaffold">
              了解项目脚手架 <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
      <SystemData />
    </StoryPage>
  );
}
