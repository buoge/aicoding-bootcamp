import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  Bike,
  BriefcaseBusiness,
  ChartNoAxesCombined,
  Database,
  Dumbbell,
  Footprints,
  Globe2,
  Layers3,
  MapPin,
  Megaphone,
  Mountain,
  Package,
  ScanLine,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Shirt,
  Snowflake,
  Store,
  Target,
  TentTree,
  TimerReset,
  Truck,
  UsersRound,
  Warehouse,
  Workflow,
} from "lucide-react";
import { Disclosure } from "@/components/ui/disclosure";
import { Button } from "@/components/ui/button";
import { analysisCases } from "@/lib/content";
import { BusinessComplexity, CourseStories, ProductStory, PrototypeEmbed } from "./scenes";
import styles from "./product.module.css";

export const metadata: Metadata = {
  title: "产品介绍",
  description:
    "从行野运动集团的商品、渠道与经营难题出发，了解九类岗位的分析与管理需求、六个课程情节，以及 Compass 的交互原型和 Agent 挑战。",
};

// Business facts: Feature 999 / context/product_definition_industry.md, sections 2–3.
// Product constraints: Feature 999 / spec/product-definition.md, sections 4–5.
const categories = [
  { icon: Footprints, name: "运动鞋", variation: "颜色 · 鞋码 · 宽度" },
  { icon: Shirt, name: "运动服装", variation: "颜色 · 尺码 · 版型" },
  { icon: TentTree, name: "露营与徒步", variation: "容量 · 人数 · 重量" },
  { icon: Bike, name: "骑行器材", variation: "车架 · 尺寸 · 配置" },
  { icon: Dumbbell, name: "健身器材", variation: "重量 · 厚度 · 型号" },
  { icon: Target, name: "球拍与球具", variation: "重量 · 握柄 · 规格" },
  { icon: Snowflake, name: "水上与冰雪", variation: "尺寸 · 镜片 · 板长" },
  { icon: Package, name: "配件与耗材", variation: "容量 · 尺寸 · 包装" },
];
const jobs = [
  {
    icon: BriefcaseBusiness,
    role: "CEO / 总经理",
    question: "销售增长了，毛利为什么没跟上？",
    output: "经营概览 · 毛利变化分解",
  },
  {
    icon: Megaphone,
    role: "市场总监",
    question: "扣掉退款，618 哪个渠道更值得投？",
    output: "获客成本 · 渠道回报 · 复购",
  },
  {
    icon: ShoppingBag,
    role: "电商负责人",
    question: "抖音流量涨、转化降，卡在哪些商品？",
    output: "转化漏斗 · 价格与库存关联",
  },
  {
    icon: Truck,
    role: "商品 / 供应链",
    question: "哪些跑鞋缺热门尺码，哪里可以调货？",
    output: "尺码热力图 · 调拨候选",
  },
  {
    icon: MapPin,
    role: "区域总经理",
    question: "华东增长来自新店还是老店？",
    output: "同店趋势 · 门店排名",
  },
  {
    icon: Workflow,
    role: "产品经理",
    question: "业务运行得怎么样，哪些流程值得优先改进？",
    output: "业务运行概览 · 流程漏斗 · 需求优先级",
  },
  {
    icon: ChartNoAxesCombined,
    role: "BA / 数据分析师",
    question: "把这次分析存成周报，异常时继续查。",
    output: "分析模板 · 周期报告 · 监测规则",
  },
  {
    icon: Database,
    role: "数据平台管理员",
    question: "哪些数据晚到，哪些任务失败？",
    output: "数据刷新 · 运行追踪 · 使用审计",
  },
  {
    icon: Settings2,
    role: "研发工程师",
    question: "系统哪里慢、哪里易失败，如何保障稳定运行？",
    output: "性能与故障分析 · 资源监控 · 配置与发布管理",
  },
];
const challenges = [
  {
    icon: ScanLine,
    title: "理解同一个“销售额”",
    example: "退款、时间窗、粒度有差异",
    answer: "先确认口径，再查询；追问沿用已确认的任务范围。",
  },
  {
    icon: Layers3,
    title: "跨数据找到证据",
    example: "订单、库存、投放、售后相互关联",
    answer: "选择工具与分析方法，核对证据、反证和未解决的问题。",
  },
  {
    icon: TimerReset,
    title: "让长任务接着做",
    example: "数据晚到、工具超时、等待人工决定",
    answer: "保存进度，支持暂停与恢复，并限制时间和成本。",
  },
  {
    icon: ShieldCheck,
    title: "把授权落实到每一步",
    example: "区域、租户、报告受众各有边界",
    answer: "查询与产物都校验权限；高风险建议先形成待确认草稿。",
  },
  {
    icon: Database,
    title: "积累经验，保持事实新鲜",
    example: "周报要复用，库存和权限每天在变",
    answer: "复用模板与获准记忆；每次重新校验数据与授权。",
  },
  {
    icon: Target,
    title: "证明这次改动更好",
    example: "模型、Prompt、工具或策略发生变化",
    answer: "用固定案例回放，对比正确性、越权风险、成本与恢复表现。",
  },
];

function Heading({
  label,
  children,
  description,
}: {
  label: string;
  children: React.ReactNode;
  description?: string;
}) {
  return (
    <header className={styles.heading}>
      <p className={styles.kicker}>{label}</p>
      <h2>{children}</h2>
      {description && <p className={styles.lead}>{description}</p>}
    </header>
  );
}

export default function ProductPage() {
  return (
    <ProductStory>
      <section id="overview" data-chapter className={`${styles.screen} ${styles.company}`}>
        <div className={styles.inner}>
          <div className={styles.companyGrid}>
            <header className={styles.companyCopy}>
              <p className={styles.kicker}>产品功能 · 企业经营背景</p>
              <h1>
                一家运动集团。
                <br />
                <em>七个大区的日常。</em>
              </h1>
              <p className={styles.lead}>
                行野运动集团，面向大众与进阶运动人群。
                <br className={styles.desktopBreak} />
                三个自有品牌，在线上与门店经营同一盘生意。
              </p>
              <span className={styles.setting}>
                <span />
                虚构企业 · 课程业务设定
              </span>
            </header>
            <div
              className={styles.enterpriseVisual}
              aria-label="行野运动集团：大众运动、专业跑步、户外三个品牌；约 80 个城市、8 个配送中心"
            >
              <div className={styles.orbit} aria-hidden="true" />
              <div className={styles.brandNodes}>
                <div>
                  <UsersRound aria-hidden="true" />
                  <span>大众运动</span>
                </div>
                <div>
                  <Footprints aria-hidden="true" />
                  <span>专业跑步</span>
                </div>
                <div>
                  <Mountain aria-hidden="true" />
                  <span>户外</span>
                </div>
              </div>
              <svg className={styles.networkLines} viewBox="0 0 520 250" aria-hidden="true">
                <path d="M80 10 C80 100 260 55 260 125 M260 10 V125 M440 10 C440 100 260 55 260 125 M260 125 C260 220 110 175 110 245 M260 125 C260 220 410 175 410 245" />
              </svg>
              <div className={styles.enterpriseCenter}>
                <span>行野</span>
                <small>运动集团</small>
              </div>
              <div className={styles.networkEnds}>
                <div>
                  <Store aria-hidden="true" />
                  <span>
                    约 <strong>80</strong> 个城市
                  </span>
                </div>
                <div>
                  <Warehouse aria-hidden="true" />
                  <span>
                    <strong>8</strong> 个配送中心
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className={styles.businessStats}>
            {[
              ["7", "经营大区"],
              ["240", "自营门店 · 约"],
              ["6万", "历史 SKU · 约"],
              ["36", "个月经营历史"],
            ].map(([n, label]) => (
              <div key={label}>
                <strong>{n}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <div className={styles.companyFoot}>
            <p>关注销售增长、渠道贡献、库存效率、会员价值与履约体验。</p>
            <a href="#map">
              从商品与渠道看起 <ArrowDown size={17} aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>

      <section id="map" data-chapter className={`${styles.screen} ${styles.catalog}`}>
        <div className={styles.inner}>
          <Heading
            label="商品与渠道"
            description="8 个一级品类，约 8,000 个 SPU。每个颜色、尺码和规格，都有自己的库存与销量。"
          >
            从一双跑鞋，<em>看到全渠道。</em>
          </Heading>
          <div className={styles.categoryGrid}>
            {categories.map((item) => (
              <div key={item.name}>
                <item.icon aria-hidden="true" />
                <h3>{item.name}</h3>
                <span>{item.variation}</span>
              </div>
            ))}
          </div>
          <div className={styles.channelStrip}>
            <div>
              <ShoppingBag aria-hidden="true" />
              <p>
                <strong>平台旗舰店</strong>
                <span>天猫 · 京东 · 抖音</span>
              </p>
            </div>
            <div>
              <Globe2 aria-hidden="true" />
              <p>
                <strong>自有线上</strong>
                <span>小程序 · App / 商城</span>
              </p>
            </div>
            <div>
              <Store aria-hidden="true" />
              <p>
                <strong>线下自营</strong>
                <span>标准门店 · 奥莱</span>
              </p>
            </div>
          </div>
          <div className={styles.orderJourney}>
            <div className={styles.orderIntro}>
              <span>一笔订单的旅程</span>
              <p>
                销售归属，
                <br />
                与发货、退货地点分开记录。
              </p>
            </div>
            <ol>
              <li>
                <ShoppingBag aria-hidden="true" />
                <strong>上海用户</strong>
                <span>小程序下单</span>
              </li>
              <li aria-hidden="true" className={styles.journeyArrow}>
                <ArrowRight />
              </li>
              <li>
                <Warehouse aria-hidden="true" />
                <strong>苏州仓</strong>
                <span>履约发货</span>
              </li>
              <li aria-hidden="true" className={styles.journeyArrow}>
                <ArrowRight />
              </li>
              <li>
                <Store aria-hidden="true" />
                <strong>杭州门店</strong>
                <span>接收退货</span>
              </li>
            </ol>
          </div>
        </div>
      </section>

      <section
        id="complexity"
        data-chapter
        data-ghost-theme="dark"
        className={`${styles.screen} ${styles.dark}`}
      >
        <div className={styles.inner}>
          <Heading
            label="经营中的复杂性"
            description="分析要穿过总量，找到影响判断的规格、费用、时间和归属。"
          >
            数字很清楚。
            <br />
            <em>问题藏在关系里。</em>
          </Heading>
          <BusinessComplexity />
        </div>
      </section>

      <section id="roles" data-chapter className={`${styles.screen} ${styles.roles}`}>
        <div className={styles.inner}>
          <Heading
            label="岗位与分析场景"
            description="同一套指标与事实，回答不同岗位的问题。每个人只访问获准的功能和数据。"
          >
            九种工作视角。<em>一套共同事实。</em>
          </Heading>
          <div className={styles.rolesTableWrap}>
            <table className={styles.rolesTable}>
              <caption className="sr-only">九类岗位的分析与管理需求及预期产出</caption>
              <thead>
                <tr>
                  <th scope="col">岗位</th>
                  <th scope="col">每天会问的问题</th>
                  <th scope="col">需要的产出</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.role}>
                    <th scope="row">
                      <job.icon size={20} aria-hidden="true" />
                      {job.role}
                    </th>
                    <td>{job.question}</td>
                    <td>{job.output}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Disclosure
            className={styles.analysisTypes}
            id="capabilities"
            title="查看 12 类分析任务与交互案例"
          >
            <div className={styles.analysisGrid}>
              {analysisCases.map(([number, title, description]) => (
                <a
                  key={number}
                  href={`/prototype/index.html#scenario/S${number}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <strong>
                    {title}
                    <ArrowRight size={15} aria-hidden="true" />
                  </strong>
                  <span>{description}</span>
                </a>
              ))}
            </div>
          </Disclosure>
        </div>
      </section>

      <section id="journey" data-chapter className={`${styles.screen} ${styles.stories}`}>
        <div className={styles.inner}>
          <Heading
            label="贯穿课程的业务情节"
            description="同一家企业，六个反复出现的问题。随着课程推进，逐步补齐分析、证据与受控行动。"
          >
            六个情节。<em>持续追问，同一盘生意。</em>
          </Heading>
          <CourseStories />
        </div>
      </section>

      <section id="prototype" data-chapter className={`${styles.screen} ${styles.prototype}`}>
        <div className={`${styles.inner} ${styles.prototypeInner}`}>
          <Heading
            label="产品原型"
            description="从一个经营问题开始。这里可以直接新建分析、查看会话，也可以打开右侧演示面板体验完整场景。"
          >
            把问题，<em>交给 Compass。</em>
          </Heading>
          <PrototypeEmbed />
          <p className={styles.prototypeCaption}>
            分析 · 报告空间 · 插件 · 定时任务 · 看板 · 管理与治理
            <span>交互原型使用合成数据，展示目标产品体验。</span>
          </p>
        </div>
      </section>

      <section id="boundary" data-chapter className={`${styles.screen} ${styles.agent}`}>
        <div className={styles.inner}>
          <Heading
            label="产品对 Agent 的核心挑战"
            description="经营问题不断变化，口径、证据、权限和执行结果必须经得起检查。"
          >
            好答案，<em>需要整个系统配合。</em>
          </Heading>
          <div className={styles.challengeList}>
            {challenges.map((item) => (
              <div key={item.title}>
                <item.icon aria-hidden="true" />
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.example}</p>
                </div>
                <p>{item.answer}</p>
              </div>
            ))}
          </div>
          <div className={styles.finalCta}>
            <p>
              当前已提供工程脚手架与交互原型。
              <br />
              这些 Agent 能力将随课程逐步实现与验收。
            </p>
            <Button asChild size="lg">
              <Link href="/architecture">
                查看系统如何承接 <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </ProductStory>
  );
}
