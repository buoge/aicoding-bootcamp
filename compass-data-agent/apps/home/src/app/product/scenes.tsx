"use client";

import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleHelp,
  Clock3,
  FileCheck2,
  Layers3,
  Package,
  ShieldCheck,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { prototypeUrl } from "@/lib/content";
import { StoryPage } from "@/components/story-page";
import styles from "./product.module.css";

const chapters = [
  ["overview", "企业经营"],
  ["map", "商品与渠道"],
  ["complexity", "经营挑战"],
  ["roles", "岗位需求"],
  ["journey", "课程情节"],
  ["prototype", "产品原型"],
  ["boundary", "Agent 挑战"],
] as const;

export function ProductStory({ children }: { children: React.ReactNode }) {
  return (
    <StoryPage chapters={chapters} label="产品介绍章节" className={styles.product}>
      {children}
    </StoryPage>
  );
}

const complexityTabs = [
  { id: "sku", icon: Package, label: "规格与地点" },
  { id: "margin", icon: TrendingDown, label: "收入与贡献" },
  { id: "time", icon: Clock3, label: "时间与成熟度" },
  { id: "scope", icon: Layers3, label: "归属与权限" },
] as const;

export function BusinessComplexity() {
  return (
    <Tabs defaultValue="sku" className={styles.complexityTabs}>
      <TabsList className={styles.complexityTabList} aria-label="选择经营复杂性">
        {complexityTabs.map((tab) => (
          <TabsTrigger key={tab.id} value={tab.id}>
            <tab.icon size={18} aria-hidden="true" />
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="sku" className={styles.complexityPanel}>
        <div className={styles.complexityCopy}>
          <span>商品 × 规格 × 地点</span>
          <h3>
            总库存高，
            <br />
            热门尺码仍然缺货。
          </h3>
          <p>库存要下钻到 SKU 与可履约地点，再结合转化和到货记录判断。</p>
          <div className={styles.need}>
            <ArrowRight size={19} />
            <strong>找到缺在哪，哪里可补，证据够不够。</strong>
          </div>
        </div>
        <div className={styles.skuVisual}>
          <div className={styles.skuTitle}>
            <Footwear />
            <p>
              轻量跑鞋 R100<span>从款式，看到具体可售规格</span>
            </p>
          </div>
          <div className={styles.skuBranch}>
            <span>黑色</span>
            <span>42 / 43 码</span>
            <span>天猫可售范围</span>
          </div>
          <div className={styles.skuSignal}>
            <strong>
              18<span>小时</span>
            </strong>
            <div>
              <b>热门尺码缺货</b>
              <span>与商品转化下降同时发生</span>
            </div>
          </div>
          <p className={styles.pending}>
            <CircleHelp size={16} />
            补货延迟的影响，仍需实际签收记录。
          </p>
          <small>原型 S05 · 合成数据 · 关联证据不等于因果结论</small>
        </div>
      </TabsContent>
      <TabsContent value="margin" className={styles.complexityPanel}>
        <div className={styles.complexityCopy}>
          <span>商品结构 × 折扣 × 费用</span>
          <h3>
            卖得更多，
            <br />
            留下的贡献却更少。
          </h3>
          <p>低毛利商品占比、折扣、渠道费与退款，需要分别拆解。</p>
          <div className={styles.need}>
            <ArrowRight size={19} />
            <strong>统一费用边界，再解释增收与贡献的背离。</strong>
          </div>
        </div>
        <div className={styles.marginVisual}>
          <div className={styles.divergingSignal}>
            <span>
              <TrendingUp />
              销售增长
            </span>
            <span>
              <TrendingDown />
              渠道贡献下降
            </span>
          </div>
          <div className={styles.costBridge}>
            <strong>净销售额</strong>
            <ArrowRight />
            <span>商品成本</span>
            <span>渠道费用</span>
            <span>投放费用</span>
            <ArrowRight />
            <strong>渠道贡献</strong>
          </div>
          <p>逐项核对成本与费用分摊，保留计算口径。</p>
          <small>分析结构示意 · 各项影响需由实际数据验证</small>
        </div>
      </TabsContent>
      <TabsContent value="time" className={styles.complexityPanel}>
        <div className={styles.complexityCopy}>
          <span>订单时间 × 退款时间 × 数据到齐</span>
          <h3>
            昨天的好结果，
            <br />
            今天可能还要重算。
          </h3>
          <p>活动效果随退款成熟而变化；数据没到齐，也会呈现销售下跌。</p>
          <div className={styles.need}>
            <ArrowRight size={19} />
            <strong>固定订单群，标记观察窗口与数据新鲜度。</strong>
          </div>
        </div>
        <div className={styles.timeVisual}>
          <ol>
            <li>
              <ShoppingBag />
              <strong>活动首周</strong>
              <span>记录成交与费用</span>
            </li>
            <li>
              <Truck />
              <strong>履约 / 售后</strong>
              <span>退款陆续回流</span>
            </li>
            <li>
              <FileCheck2 />
              <strong>成熟后复盘</strong>
              <span>重算同一批订单回报</span>
            </li>
          </ol>
          <div className={styles.dataGate}>
            <Clock3 />
            <div>
              <strong>数据尚未到齐</strong>
              <p>等待刷新，或明确披露覆盖范围。</p>
            </div>
          </div>
          <small>业务时间与数据到达时间，分别记录。</small>
        </div>
      </TabsContent>
      <TabsContent value="scope" className={styles.complexityPanel}>
        <div className={styles.complexityCopy}>
          <span>企业 × 区域 × 渠道 × 用户</span>
          <h3>
            同一笔订单，
            <br />
            有不同的经营视角。
          </h3>
          <p>需求区域、销售归属、履约与退货地点分别保存。区域与渠道负责人各有数据范围。</p>
          <div className={styles.need}>
            <ArrowRight size={19} />
            <strong>回答对的问题，也守住当前用户的权限。</strong>
          </div>
        </div>
        <div className={styles.scopeVisual}>
          <div className={styles.tenant}>
            <ShieldCheck />
            <strong>行野运动 · 企业租户</strong>
            <div>
              <span>品牌</span>
              <span>区域</span>
              <span>渠道</span>
              <span>门店</span>
            </div>
            <p>企业内部经营维度</p>
          </div>
          <div className={styles.scopeRule}>
            <ShieldCheck size={18} />
            <span>其他企业的数据、报告与任务结果独立隔离</span>
          </div>
          <small>品牌属于企业内部维度；租户对应独立企业。</small>
        </div>
      </TabsContent>
    </Tabs>
  );
}

function Footwear() {
  return (
    <svg viewBox="0 0 100 60" fill="none" aria-hidden="true">
      <path
        d="m10 36 6-23 16 10 15-2 14 14 23 5q9 1 9 9H13q-8-1-3-13Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="m12 43 76 1M41 25l-5 8m14-5-5 8m14-2-5 6M17 25l13 9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Six business events follow industry definition §3. The numeric chart reuses
// prototype S05 and is explicitly labeled as synthetic data.
const stories = [
  {
    id: "promotion",
    short: "大促贡献",
    title: "大促销售增长，渠道贡献下降。",
    who: "CEO · 市场总监",
    question: "增长来自哪里，哪些成本吃掉了贡献？",
    checks: [
      "确认净销售额与渠道贡献口径",
      "分解商品结构、折扣、投放与退款",
      "交付贡献拆解，提出待审阅建议",
    ],
    result: "渠道贡献分解 · 费用与退款证据",
    method: "先明确口径，再拆解贡献",
    scene: "S04",
  },
  {
    id: "inventory",
    short: "热门尺码",
    title: "跑鞋库存充足，热门尺码缺货。",
    who: "商品 · 供应链 · 区域负责人",
    question: "库存究竟缺在哪，有哪些可调拨候选？",
    checks: [
      "从 SPU 下钻到 SKU 与地点",
      "核对可售库存、需求与到货记录",
      "形成调拨草案，交业务负责人确认",
    ],
    result: "缺码清单 · 库存分布 · 调拨候选",
    method: "从总量深入规格与地点",
    scene: "S05",
  },
  {
    id: "stores",
    short: "新老门店",
    title: "区域增长很快，老店却在掉队。",
    who: "CEO · 区域总经理",
    question: "新增门店贡献了多少，老店是否真正增长？",
    checks: [
      "界定新店、老店与可比门店范围",
      "分别计算区域增速与同店趋势",
      "列出需要跟进的门店和商品",
    ],
    result: "新老店拆分 · 同店趋势 · 门店排名",
    method: "把比较范围固定下来",
    scene: "S02",
  },
  {
    id: "refund",
    short: "退款成熟",
    title: "首周回报很好，后续却持续下修。",
    who: "市场总监 · BA",
    question: "哪些活动，扣掉成熟退款后还值得投入？",
    checks: [
      "固定活动对应的订单群",
      "对齐观察窗口，追踪退款成熟",
      "更新回报分析，保留历史报告版本",
    ],
    result: "订单群对比 · 成熟退款后的回报",
    method: "让时间窗口保持可比",
    scene: "S06",
  },
  {
    id: "freshness",
    short: "数据晚到",
    title: "渠道突然下跌，先看数据到没到。",
    who: "BA · 数据平台管理员",
    question: "这是经营异常，还是数据还没准备好？",
    checks: [
      "检查渠道覆盖率与刷新水位",
      "数据不完整时等待或披露缺口",
      "数据到齐后恢复任务，再判断异常",
    ],
    result: "数据就绪状态 · 可恢复的周期任务",
    method: "将数据质量放在诊断之前",
    scene: "S10",
  },
  {
    id: "delivery",
    short: "补货延迟",
    title: "销量下降，沿库存与履约继续追问。",
    who: "供应链 · 电商负责人",
    question: "热门尺码缺货，能解释多少渠道变化？",
    checks: [
      "核对收入降幅与渠道贡献",
      "检验库存、转化和退款等假设",
      "补齐签收证据，说明关联与因果边界",
    ],
    result: "诊断报告 · 反证 · 待补证清单",
    method: "结论随证据推进",
    scene: "S05",
  },
] as const;

export function CourseStories() {
  const [selected, setSelected] = useState<string>(stories[0].id);
  const story = stories.find((item) => item.id === selected)!;
  return (
    <div className={styles.storyExplorer}>
      <div className={styles.storySelectors} role="group" aria-label="选择课程业务情节">
        {stories.map((item) => (
          <button
            className="ghost-control"
            type="button"
            key={item.id}
            aria-pressed={selected === item.id}
            onClick={() => setSelected(item.id)}
          >
            {item.short}
          </button>
        ))}
      </div>
      <div className={styles.storyBody} key={story.id} aria-live="polite">
        <div className={styles.storyNarrative}>
          <span>{story.who}</span>
          <h3>{story.title}</h3>
          <p>{story.question}</p>
          <ol>
            {story.checks.map((step, i) => (
              <li key={step}>
                <span>{i + 1}</span>
                {step}
              </li>
            ))}
          </ol>
          <a
            href={`/prototype/index.html#scenario/${story.scene}`}
            target="_blank"
            rel="noreferrer"
          >
            查看相关分析交互 <ArrowUpRight size={17} aria-hidden="true" />
          </a>
        </div>
        <div className={styles.storyVisual}>
          {story.id === "delivery" ? (
            <ContributionChart />
          ) : (
            <div className={styles.evidenceFlow}>
              <span className={styles.storyQuestion}>
                <CircleHelp size={25} />
                {story.question}
              </span>
              <div className={styles.evidenceConnect} aria-hidden="true" />
              <div className={styles.evidenceNodes}>
                <span>
                  <Layers3 size={20} />
                  业务数据
                </span>
                <span>
                  <Check size={20} />
                  口径校验
                </span>
                <span>
                  <ShieldCheck size={20} />
                  权限范围
                </span>
              </div>
              <div className={styles.evidenceConnect} aria-hidden="true" />
              <div className={styles.storyOutput}>
                <FileCheck2 />
                <strong>{story.result}</strong>
                <small>{story.method}</small>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className={styles.continuity}>
        <span>一次分析</span>
        <ArrowRight aria-hidden="true" />
        <span>保存模板</span>
        <ArrowRight aria-hidden="true" />
        <span>定期复盘</span>
        <ArrowRight aria-hidden="true" />
        <span>异常再追问</span>
      </div>
    </div>
  );
}

function ContributionChart() {
  const data = [
    ["天猫", 19.4],
    ["抖音", 4.8],
    ["门店", 2.1],
    ["小程序", 1.05],
  ] as const;
  return (
    <figure className={styles.contribution}>
      <figcaption>
        <span>华东昨日净销售额 · 同星期比较</span>
        <strong>
          −27.35<span>万元</span>
        </strong>
      </figcaption>
      <div className={styles.contributionRows}>
        {data.map(([name, value]) => (
          <div key={name}>
            <span>{name}</span>
            <div>
              <i style={{ width: `${(value / 19.4) * 100}%` }} />
            </div>
            <b>−{value}</b>
          </div>
        ))}
      </div>
      <p>
        天猫贡献降幅的 <strong>70.9%</strong>。缺码与转化下降同时发生，补货延迟仍待核实。
      </p>
      <small>原型 S05 · 合成数据 · 单位：万元</small>
    </figure>
  );
}

export function PrototypeEmbed() {
  return (
    <div className={styles.prototypeFrame}>
      <div className={styles.prototypeToolbar}>
        <span>
          <i />
          Compass · 分析空间
        </span>
        <Button asChild variant="ghost">
          <a href={prototypeUrl} target="_blank" rel="noreferrer">
            在新窗口体验 <ArrowUpRight data-icon="inline-end" />
          </a>
        </Button>
      </div>
      <iframe src={prototypeUrl} title="Compass 产品交互原型：分析首页" loading="lazy" />
    </div>
  );
}
