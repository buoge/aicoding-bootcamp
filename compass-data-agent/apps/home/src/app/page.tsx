import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CircleHelp,
  FileCheck2,
  FileText,
  Fingerprint,
  GitBranch,
  Layers3,
  Radar,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HeroBackground } from "@/components/hero-background";
import { courseName, prototypeUrl } from "@/lib/content";
import { Investigation } from "./investigation";
import styles from "./home.module.css";

export const metadata: Metadata = {
  title: { absolute: "Compass · 把经营问题，追查到有据可依" },
  description:
    "面向品牌与零售企业，懂业务、会追查、讲证据的 AI 经营分析师。探索自主调查、业务口径、证据核验、成果复用与持续跟进的产品体验原型。",
};
const methods = [
  {
    question: "下个季度，备多少货？",
    name: "预测与情景模拟",
    description: "用历史回测检验方法，用预测区间和情景假设支持备货判断。",
    checks: ["历史基线", "滚动回测", "预测区间"],
    scenario: "S07",
  },
  {
    question: "新详情页，值得上线吗？",
    name: "随机实验评估",
    description: "先核对分流与样本，再结合效果区间、风险指标和采纳标准。",
    checks: ["分流检查", "效果区间", "风险护栏"],
    scenario: "S08",
  },
  {
    question: "这次涨价，影响了留存吗？",
    name: "因果分析与限制",
    description: "检查对照与识别前提，证据不足时保留问题，明确下一步补证。",
    checks: ["对照条件", "趋势诊断", "结论限制"],
    scenario: "S09",
  },
];

export default function Home() {
  return (
    <main id="main-content" data-page-scroll className={styles.home}>
      <section id="welcome" data-screen className={`home-hero ${styles.hero}`}>
        <HeroBackground />
        <div className="hero-shade" />
        <div className={`container ${styles.heroInner}`}>
          <div className={styles.heroCopy}>
            <p className={styles.heroEyebrow}>Compass · AI 经营分析师</p>
            <h1>
              把经营问题，
              <br />
              追查到<span>有据可依。</span>
            </h1>
            <p className={styles.heroDescription}>
              懂业务，会追查，讲证据。
              <br />
              围绕你的经营目标自主分析，
              <br className={styles.mobileBreak} />
              把结论、依据和下一步建议一起交付。
            </p>
            <div className={styles.actions}>
              <Button asChild size="lg">
                <a href={prototypeUrl} target="_blank" rel="noreferrer">
                  体验交互原型 <ArrowUpRight data-icon="inline-end" />
                </a>
              </Button>
              <Button asChild size="lg">
                <a href="#why">
                  看一次经营调查 <ArrowDown data-icon="inline-end" />
                </a>
              </Button>
            </div>
            <p className={styles.heroNote}>面向品牌与零售企业 · 产品预览</p>
          </div>
          <div className={styles.heroPromises}>
            {[
              ["自主追查", "从问题出发，随证据深入"],
              ["理解业务", "让数据回到经营语境"],
              ["有据可依", "看清依据，再做判断"],
            ].map(([title, description]) => (
              <div key={title}>
                <strong>{title}</strong>
                <span>{description}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        id="why"
        data-screen
        className={styles.section}
        aria-labelledby="investigation-title"
      >
        <div className="container">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.kicker}>自主分析 · 从问题到调查</p>
              <h2 id="investigation-title">
                提出一个问题，
                <br />
                让分析自主展开。
              </h2>
            </div>
            <p>
              从“华东收入为什么下降”开始，
              <br />
              逐步核对数据、拆解变化、检验解释。
              <br />
              新的证据，决定下一步往哪里查。
            </p>
          </div>
          <Investigation />
          <p className={styles.caption}>
            行野运动集团 · 虚构经营案例，全部数值为合成数据。这里展示分析方法与交互，未运行真实
            Agent。
          </p>
        </div>
      </section>

      <section
        id="evidence"
        data-screen
        className={`${styles.section} ${styles.sage}`}
        aria-labelledby="evidence-title"
      >
        <div className="container">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.kicker}>理解业务 · 核验依据</p>
              <h2 id="evidence-title">
                懂你的生意，
                <br />
                也经得起你的追问。
              </h2>
            </div>
            <p>
              让企业口径、经营数据与业务记录相互印证。
              <br />
              哪些已有支持，哪些还需核实，清楚摆在眼前。
            </p>
          </div>
          <div className={styles.trustGrid}>
            <article className={styles.semantic}>
              <div className={styles.featureLabel}>
                <Layers3 size={19} />
                <span>用一致的口径，理解变化</span>
              </div>
              <h3>
                同样叫“收入”，
                <br />
                先确认谈的是同一件事。
              </h3>
              <p>
                销售时间、退款归属、比较范围和数据截止时间，都进入分析条件。订单、库存、售后与业务记录共同解释变化。
              </p>
              <dl className={styles.definition}>
                <div>
                  <dt>经营指标</dt>
                  <dd>净销售额</dd>
                </div>
                <div>
                  <dt>比较范围</dt>
                  <dd>华东 · 同星期 · 同渠道</dd>
                </div>
                <div>
                  <dt>退款处理</dt>
                  <dd>按销售口径归属原订单</dd>
                </div>
                <div>
                  <dt>数据检查</dt>
                  <dd>
                    <Check size={14} />
                    先核对完整性与截止时间
                  </dd>
                </div>
              </dl>
            </article>
            <article className={styles.evidenceSheet}>
              <div className={styles.sheetHeading}>
                <FileCheck2 size={19} />
                <span>华东收入异动诊断</span>
                <Badge variant="outline">示例摘录</Badge>
              </div>
              <h3>每个判断，都有来处。</h3>
              <div className={styles.finding}>
                <Check size={17} />
                <div>
                  <strong>有支持证据</strong>
                  <p>热门尺码缺货与转化下降同时发生。</p>
                  <small>库存快照 × 商品转化</small>
                </div>
              </div>
              <div className={styles.finding}>
                <GitBranch size={17} />
                <div>
                  <strong>已排除的解释</strong>
                  <p>退款增量仅占总降幅约 1%，无法解释主要变化。</p>
                  <small>同口径退款差异核对</small>
                </div>
              </div>
              <div className={styles.finding}>
                <CircleHelp size={17} />
                <div>
                  <strong>仍需业务核实</strong>
                  <p>补货延迟缺少实际签收记录，尚不能确认原因。</p>
                  <small>下一步：补充到货凭证</small>
                </div>
              </div>
              <a
                className={styles.textLink}
                href="/prototype/index.html#scenario/S05"
                target="_blank"
                rel="noreferrer"
              >
                展开完整证据 <ArrowUpRight size={16} />
              </a>
            </article>
          </div>
          <div className={styles.evidenceTrail} aria-label="证据追溯路径">
            <span>从结论一路追溯</span>
            <ol>
              {["指标与范围", "结果快照", "查询与计算", "数据版本"].map((item) => (
                <li key={item}>
                  <ArrowRight size={14} />
                  {item}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section
        id="decisions"
        data-screen
        className={styles.section}
        aria-labelledby="decisions-title"
      >
        <div className="container">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.kicker}>专业方法 · 支持下一步选择</p>
              <h2 id="decisions-title">
                解释已经发生的，
                <br />
                也为下一步提供依据。
              </h2>
            </div>
            <p>
              不同的经营问题，需要不同的分析方法。
              <br />
              把假设、区间与限制一起交给决策者。
            </p>
          </div>
          <div className={styles.methodList}>
            {methods.map((method) => (
              <article className={styles.method} key={method.scenario}>
                <div>
                  <p className={styles.methodName}>{method.name}</p>
                  <h3>{method.question}</h3>
                </div>
                <div>
                  <p>{method.description}</p>
                  <div className={styles.methodChecks}>
                    {method.checks.map((check) => (
                      <span key={check}>
                        <Check size={13} />
                        {check}
                      </span>
                    ))}
                  </div>
                </div>
                <a
                  className={styles.methodLink}
                  href={`/prototype/index.html#scenario/${method.scenario}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`查看${method.name}原型`}
                >
                  查看示例 <ArrowUpRight size={20} />
                </a>
              </article>
            ))}
          </div>
          <p className={styles.caption}>
            上述场景为方法与产品体验预览，预测和统计结论使用合成示例，不代表已验证的生产效果。
          </p>
        </div>
      </section>

      <section
        id="continuity"
        data-screen
        className={`${styles.section} ${styles.sage}`}
        aria-labelledby="continuity-title"
      >
        <div className="container">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.kicker}>成果复用 · 持续跟进</p>
              <h2 id="continuity-title">
                今天的分析，
                <br />
                成为明天的起点。
              </h2>
            </div>
            <p>
              把报告留下，把好方法复用，
              <br />
              让值得关注的问题持续得到跟进。
            </p>
          </div>
          <div className={styles.continuityGrid}>
            <div className={styles.reuseStory}>
              <div className={styles.featureLabel}>
                <BookOpen size={19} />
                <span>每一次分析，都留下团队资产</span>
              </div>
              <div className={styles.assetStack}>
                <div className={styles.assetBack} aria-hidden="true" />
                <article className={styles.assetDocument}>
                  <div>
                    <FileText size={22} />
                    <Badge variant="outline">报告示例 · v1</Badge>
                  </div>
                  <h3>华东收入异动诊断</h3>
                  <p>结论与证据 · 数据与方法 · 待核实事项</p>
                  <div className={styles.documentRule} />
                  <ul>
                    <li>
                      <Check size={14} />
                      保留来源与历史版本
                    </li>
                    <li>
                      <Check size={14} />
                      按新数据刷新与复算
                    </li>
                    <li>
                      <Check size={14} />
                      从原上下文继续追问
                    </li>
                  </ul>
                </article>
              </div>
              <p>
                报告、图表和数据集独立保存。经过核验的分析方法，沉淀为团队可复用的 Skill 与模板。
              </p>
              <a
                className={styles.textLink}
                href="/prototype/index.html#reports"
                target="_blank"
                rel="noreferrer"
              >
                查看报告空间 <ArrowUpRight size={16} />
              </a>
            </div>
            <div className={styles.monitorStory}>
              <div className={styles.featureLabel}>
                <Radar size={19} />
                <span>让重要问题，持续被关注</span>
              </div>
              <h3>
                从一次发现，
                <br />
                到下一次主动跟进。
              </h3>
              <p>
                按周期生成报告，异常时发起调查。重复信号合并处理，恢复后更新记录，让注意力回到需要决策的地方。
              </p>
              <ol className={styles.timeline} aria-label="支付成功率监控合成示例">
                {[
                  ["09:42", "发现异常", "支付成功率下降，触发调查。"],
                  ["09:46", "合并重复信号", "4 次检测归入同一事件。"],
                  ["09:52", "关联业务证据", "支付超时与服务事件时间重叠。"],
                  ["10:21", "记录恢复", "保留调查过程，继续关注。"],
                ].map(([time, title, detail]) => (
                  <li key={time}>
                    <time>{time}</time>
                    <div>
                      <strong>{title}</strong>
                      <p>{detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <a
                className={styles.textLink}
                href="/prototype/index.html#scenario/S11"
                target="_blank"
                rel="noreferrer"
              >
                体验主动监控 <ArrowUpRight size={16} />
              </a>
              <p className={styles.caption}>合成事件时间线 · 持续执行能力为产品规划</p>
            </div>
          </div>
        </div>
      </section>

      <section
        id="control"
        data-screen
        data-ghost-theme="dark"
        className={`${styles.section} ${styles.dark}`}
        aria-labelledby="control-title"
      >
        <div className="container">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.kicker}>行动协作 · 企业管控</p>
              <h2 id="control-title">
                AI 推进工作，
                <br />
                <span>你掌握关键决定。</span>
              </h2>
            </div>
            <p>
              让建议带着依据进入审阅。
              <br />
              分析可以自主，权限、成本与责任始终清晰。
            </p>
          </div>
          <div className={styles.controlGrid}>
            <article className={styles.actionPreview}>
              <div className={styles.featureLabel}>
                <FileCheck2 size={19} />
                <span>从建议，到可审阅的行动草稿</span>
              </div>
              <h3>
                每一步交接，
                <br />
                都看清对象与影响。
              </h3>
              <ol className={styles.actionFlow}>
                <li>
                  <span>分析建议</span>
                  <small>附依据与限制</small>
                </li>
                <li>
                  <span>行动草稿</span>
                  <small>明确对象、差异与版本</small>
                </li>
                <li>
                  <span>负责人确认</span>
                  <small>核对权限与有效期</small>
                </li>
                <li>
                  <span>外部系统交接</span>
                  <small>跟踪回执与实际状态</small>
                </li>
              </ol>
              <p>
                首阶段规划提供调整草稿与审批交接。预算等业务变更由外部系统中的获权人员最终发布。
              </p>
              <a
                className={styles.textLink}
                href="/prototype/index.html#scenario/S10"
                target="_blank"
                rel="noreferrer"
              >
                体验报告发布授权 <ArrowUpRight size={16} />
              </a>
            </article>
            <div className={styles.guardrails}>
              {[
                {
                  icon: Fingerprint,
                  title: "权限有范围",
                  text: "按岗位与数据范围授权。子任务、报告分享和数据导出分别检查权限。",
                },
                {
                  icon: SlidersHorizontal,
                  title: "投入有边界",
                  text: "明确任务预算与停止条件。遇到额外授权和重要资源取舍，再由人决定。",
                },
                {
                  icon: RefreshCw,
                  title: "过程可追溯",
                  text: "保留任务状态、人工决定与版本记录，为中断恢复、问题核查和质量评测提供依据。",
                },
              ].map((item) => (
                <article key={item.title}>
                  <item.icon size={21} strokeWidth={1.4} />
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.text}</p>
                  </div>
                </article>
              ))}
              <Link className={styles.textLink} href="/architecture">
                了解背后的系统架构 <ArrowRight size={16} />
              </Link>
            </div>
          </div>
          <p className={styles.caption}>
            <ShieldCheck size={14} />
            企业管控与可靠运行能力按架构规划逐步建设；原型中的权限、执行与授权均为本地模拟。
          </p>
        </div>
      </section>

      <section
        id="try"
        data-screen
        className={`${styles.section} ${styles.closing}`}
        aria-labelledby="try-title"
      >
        <div className="container">
          <div className={styles.closingMain}>
            <p className={styles.kicker}>懂业务 · 会追查 · 讲证据</p>
            <h2 id="try-title">
              把下一个经营问题，
              <br />
              <em>交给 Compass。</em>
            </h2>
            <p>从一次收入诊断开始，亲手查看分析过程、证据与报告。</p>
            <div className={styles.actions}>
              <Button asChild size="lg">
                <a href={prototypeUrl} target="_blank" rel="noreferrer">
                  体验交互原型 <ArrowUpRight data-icon="inline-end" />
                </a>
              </Button>
              <Button asChild size="lg">
                <Link href="/product">
                  探索完整产品 <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
            </div>
            <p className={styles.releaseNote}>
              当前为产品体验原型，使用合成数据。真实 Agent 与企业级运行能力仍在建设中。
            </p>
          </div>
          <div className={styles.courseBridge}>
            <div>
              <BookOpen size={21} />
              <div>
                <h3>从产品体验，到工程实现</h3>
                <p>Compass 是《{courseName}》的贯穿项目。</p>
              </div>
            </div>
            <Link className={styles.textLink} href="/course">
              查看课程与实战任务 <ArrowUpRight size={17} />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
