"use client";

import { useState } from "react";
import { ArrowRight, Check, FileText, ShieldCheck } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Disclosure } from "@/components/ui/disclosure";
import { Button } from "@/components/ui/button";
import { roles, journey, prototypeUrl } from "@/lib/content";
import { CompassMark } from "@/components/site-shell";

export function RoleExplorer() {
  return (
    <Tabs defaultValue="executive" className="role-explorer">
      <TabsList variant="line" className="role-tabs">
        {roles.map((role) => (
          <TabsTrigger key={role.id} value={role.id}>
            {role.name}
          </TabsTrigger>
        ))}
      </TabsList>
      {roles.map((role) => (
        <TabsContent key={role.id} value={role.id}>
          <div className="role-panel">
            <div>
              <h3>{role.question}</h3>
              <p>{role.description}</p>
              <div className="role-outputs">
                {role.outputs.map((output) => (
                  <Badge key={output} variant="secondary">
                    {output}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="role-map">
              <div className="role-nodes">
                {role.nodes.map((node) => (
                  <span key={node}>{node}</span>
                ))}
              </div>
              <div className="map-connector" />
              <div className="role-compass">
                <CompassMark />
                <strong>同一个 Compass</strong>
                <span>岗位 × 功能权限 × 数据范围</span>
              </div>
              <p>{role.scope}</p>
            </div>
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}

export function JourneyExplorer() {
  const [step, setStep] = useState(0);
  return (
    <div className="journey-explorer">
      <div className="journey-steps" role="group" aria-label="分析工作流步骤">
        {journey.map((item, i) => (
          <button
            className="ghost-control"
            key={item.code}
            aria-pressed={step === i}
            onClick={() => setStep(i)}
          >
            <span>0{i + 1}</span>
            <strong>{item.title}</strong>
            <ArrowRight size={16} />
          </button>
        ))}
      </div>
      <div className="journey-detail" aria-live="polite">
        <h3>{journey[step].title}</h3>
        <p>{journey[step].text}</p>
        <div>
          <Check size={16} />
          {journey[step].evidence}
        </div>
      </div>
      <div className="branch-notes">
        <span>信息不足 → 澄清</span>
        <span>执行失败 → 恢复 / 终止</span>
        <span>授权拒绝 → 保留草案</span>
      </div>
    </div>
  );
}

export function ConversationPreview() {
  // Curated excerpts from Feature 999's prototype/scenarios.js; all figures are synthetic.
  const cases = [
    {
      name: "经营诊断",
      question: "昨天华东收入下降了，先查数据，再解释变化。",
      title: "天猫贡献了收入降幅的 70.9%",
      steps: ["核对数据完整性与同星期口径", "拆解 4 个渠道的变化贡献", "检验库存、退款与流量假设"],
      evidence: [
        ["比较范围", "华东 · 2026.10.19 对比 10.12，同星期比较。"],
        ["渠道拆解", "总降幅 ¥273,500，天猫下降 ¥194,000。"],
        ["支持与反证", "跑鞋尺码缺货与转化下降同时发生；退款假设已被反证。"],
        ["待核验", "补货延迟仍需业务核实，当前证据不能确定因果关系。"],
      ],
      conclusion:
        "优先核查天猫跑鞋的尺码库存和补货记录。当前可定位主要变化渠道，补货延迟的业务原因仍待确认。",
      artifact: "华东收入异动诊断",
      action: "打开诊断报告",
      scenario: "S05",
    },
    {
      name: "指标对账",
      question: "财务月报与 Agent 的净销售额相差 14 万，差在哪里？",
      title: "已解释 ¥135,000，剩余 ¥5,000 待复核",
      steps: [
        "固定财务与经营数据快照",
        "对齐口径、过滤条件与刷新时间",
        "桥接退款归属期与延迟入账差异",
      ],
      evidence: [
        ["差异总额", "财务月报与经营口径相差 ¥140,000。"],
        ["已解释项", "退款归属期与延迟入账等差异共 ¥135,000。"],
        ["待复核项", "剩余 5 笔订单、合计 ¥5,000，需要财务复核。"],
        ["处理边界", "保留公共指标原版本；修复提案等待审阅。"],
      ],
      conclusion:
        "报告保留每项差异与未解释余额。剩余订单交财务核验，公共指标不会随本次分析自动修改。",
      artifact: "九月净销售额对账报告",
      action: "查看差异桥与证据",
      scenario: "S04",
    },
    {
      name: "日报发布",
      question: "每天 9 点生成昨日经营日报，给华东管理组。",
      title: "日报已生成，投递等待授权",
      steps: [
        "确认前一经营日的指标范围",
        "检查数据就绪状态并生成报告",
        "核对接收人，等待持续投递授权",
      ],
      evidence: [
        ["运行安排", "每日 09:00，Asia/Shanghai 时区，覆盖前一经营日。"],
        ["数据门槛", "就绪率低于 99% 时等待，超过 60 分钟通知责任人。"],
        ["授权对象", "指定报告版本、华东管理组及持续投递范围。"],
        ["当前状态", "生成与投递分别记录；没有授权时保留报告，不投递。"],
      ],
      conclusion:
        "先查看报告内容和接收范围，再决定是否授权。原型可演示批准、拒绝以及授权后的本地投递回执。",
      artifact: "华东经营日报定义",
      action: "查看报告并体验授权",
      scenario: "S10",
    },
  ];
  const [active, setActive] = useState(0);
  const item = cases[active];
  return (
    <div className="conversation-preview">
      <div className="preview-sidebar">
        <div className="preview-brand">
          <CompassMark />
          compass.
        </div>
        <span className="sidebar-caption">分析案例</span>
        {cases.map((c, i) => (
          <button
            className="ghost-control"
            key={c.name}
            aria-pressed={active === i}
            onClick={() => setActive(i)}
          >
            <span />
            {c.name}
            <ArrowUpRightIcon />
          </button>
        ))}
        <div className="preview-sidebar-note">
          <ShieldCheck size={16} />
          <span>
            按用户权限
            <br />
            访问数据与功能
          </span>
        </div>
      </div>
      <div className="preview-conversation">
        <div className="preview-toolbar">
          <span>{item.name}</span>
          <Badge variant="outline">合成数据演示</Badge>
        </div>
        <div className="user-bubble">{item.question}</div>
        <div className="assistant-preview" key={item.scenario}>
          <CompassMark />
          <div>
            <Disclosure density="compact" title="查看分析过程 · 3 个检查点">
              <ul>
                {item.steps.map((e) => (
                  <li key={e}>
                    <Check size={14} />
                    {e}
                  </li>
                ))}
              </ul>
            </Disclosure>
            <h3>{item.title}</h3>
            <p>{item.conclusion}</p>
            <Disclosure density="compact" className="preview-evidence" title="查看依据与待核验项">
              <dl>
                {item.evidence.map(([label, text]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{text}</dd>
                  </div>
                ))}
              </dl>
            </Disclosure>
            <a
              className="artifact-preview"
              href={`/prototype/index.html#scenario/${item.scenario}`}
              target="_blank"
              rel="noreferrer"
            >
              <FileText size={24} />
              <div>
                <strong>{item.artifact}</strong>
                <span>{item.action} ↗</span>
              </div>
              <ArrowRight size={18} />
            </a>
          </div>
        </div>
        <div className="preview-composer">
          <span>在原型里继续这次分析</span>
          <Button asChild size="icon" aria-label="进入分析原型">
            <a href={prototypeUrl} target="_blank" rel="noreferrer">
              <ArrowRight />
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}

function ArrowUpRightIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" width="14" height="14" aria-hidden="true">
      <path d="M4 12 12 4M4 4h8v8" stroke="currentColor" />
    </svg>
  );
}
