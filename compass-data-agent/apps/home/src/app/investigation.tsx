"use client";

import { ArrowRight, ArrowUpRight, Check, CircleHelp, GitBranch, Search } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import styles from "./home.module.css";

// Curated from Feature 999 prototype S05, S06 and S11. All figures are synthetic.
const steps = [
  {
    id: "scope",
    label: "查数据",
    title: "先确认，变化真实发生。",
    description: "检查数据是否齐全，固定指标与比较范围，避免把数据晚到误读为业务下降。",
    detail: "华东 · 净销售额 · 同星期比较",
    result: "数据完整度 100%",
    note: "示例已排除延迟，再进入经营调查。",
    checks: ["订单与退款已就绪", "使用同一指标口径", "固定观察与比较窗口"],
  },
  {
    id: "breakdown",
    label: "拆变化",
    title: "找到最值得继续追查的方向。",
    description: "先按渠道拆解收入变化，再深入商品、尺码与库存，定位主要变化来源。",
    detail: "渠道贡献分解 · 同一比较维度",
    result: "70.9%",
    note: "天猫占本次收入降幅的比例。",
    checks: ["总降幅 ¥273,500", "天猫下降 ¥194,000", "继续查看跑鞋与热门尺码"],
  },
  {
    id: "verify",
    label: "验假设",
    title: "沿着证据深入，也主动排除解释。",
    description:
      "交叉核对库存、退款与到货事件。保留支持证据、反证和待核实项，让结论强度与证据匹配。",
    detail: "假设验证 · 保留反证与缺口",
    result: "退款解释已排除",
    note: "退款增量约占总降幅 1%，不足以解释主要变化。",
    checks: ["缺货与转化下降同时发生", "退款假设被反证", "补货延迟仍缺到货凭证"],
  },
  {
    id: "deliver",
    label: "交付建议",
    title: "把结论、依据和下一步一起交付。",
    description: "把调查整理为可查阅的报告。明确建议的对象、证据与限制，供业务负责人核实和采纳。",
    detail: "诊断报告 · 证据包 · 待核实事项",
    result: "优先核查热门尺码",
    note: "检查天猫跑鞋库存，并由供应链补充到货记录。",
    checks: ["定位主要变化渠道", "保留结论与查询来源", "行动草稿等待负责人审阅"],
  },
  {
    id: "follow",
    label: "持续关注",
    title: "把这次问题，变成持续关注的事项。",
    description:
      "将有价值的分析转为周期报告或监控定义，明确观察范围、频率与接收人，后续按有效授权运行。",
    detail: "持续跟进 · 产品规划",
    result: "关注后续变化",
    note: "跟踪库存恢复与收入表现，保留每期分析和行动记录。",
    checks: ["确认指标与数据范围", "设置频率、预算与接收人", "数据未就绪时说明并等待"],
  },
];

export function Investigation() {
  return (
    <div className={styles.investigation}>
      <div className={styles.questionBar}>
        <Search size={19} aria-hidden="true" />
        <p>昨天华东收入下降了，先查数据，再解释变化。</p>
        <Badge variant="outline">合成案例</Badge>
      </div>
      <Tabs defaultValue="breakdown" className={styles.investigationTabs}>
        <TabsList variant="line" className={styles.steps} aria-label="经营调查步骤">
          {steps.map((step, i) => (
            <TabsTrigger value={step.id} key={step.id}>
              <span aria-hidden="true">0{i + 1}</span>
              {step.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {steps.map((step) => (
          <TabsContent value={step.id} key={step.id} className={styles.stepContent}>
            <div className={styles.stepNarrative}>
              <p className={styles.kicker}>{step.detail}</p>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
              <a
                className={styles.textLink}
                href={`/prototype/index.html#scenario/${step.id === "follow" ? "S11" : "S05"}`}
                target="_blank"
                rel="noreferrer"
              >
                在原型中继续探索 <ArrowUpRight size={15} />
              </a>
            </div>
            <div className={styles.stepEvidence}>
              {step.id === "breakdown" ? (
                <>
                  <div className={styles.resultLine}>
                    <strong>{step.result}</strong>
                    <span>的降幅来自天猫</span>
                  </div>
                  <div
                    className={styles.contributionChart}
                    role="img"
                    aria-label="合成数据：收入总降幅 273,500 元，其中天猫下降 194,000 元，占 70.9%；其余渠道合计下降 79,500 元，占 29.1%。"
                  >
                    <div>
                      <span>天猫</span>
                      <div>
                        <i style={{ width: "70.9%" }} />
                      </div>
                      <strong>−19.40 万</strong>
                    </div>
                    <div>
                      <span>其余渠道</span>
                      <div>
                        <i style={{ width: "29.1%" }} />
                      </div>
                      <strong>−7.95 万</strong>
                    </div>
                  </div>
                  <p className={styles.chartNote}>贡献定位变化来源；当前证据仍不足以确认因果。</p>
                  <div className={styles.nextLead}>
                    <GitBranch size={16} />
                    <span>下一步线索</span>
                    <strong>跑鞋 → 热门尺码 → 可售库存</strong>
                  </div>
                </>
              ) : (
                <>
                  <div className={styles.evidenceResult}>
                    <span>
                      {step.id === "verify" ? (
                        <GitBranch size={23} />
                      ) : step.id === "follow" ? (
                        <CircleHelp size={23} />
                      ) : (
                        <Check size={23} />
                      )}
                    </span>
                    <h4>{step.result}</h4>
                  </div>
                  <p>{step.note}</p>
                  <ul className={styles.checkList}>
                    {step.checks.map((check) => (
                      <li key={check}>
                        <ArrowRight size={14} />
                        {check}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
