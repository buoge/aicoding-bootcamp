/* Six instant, persisted conversation examples. No network, timers or real execution. */
(() => {
  "use strict";
  const C = window.C,
    E = C.esc,
    report = window.COMPASS_DEMO_REPORT;
  const cases = [
    {
      id: "simple",
      scenario: "S01",
      title: "简单分析",
      description: "多轮工具调用 → 图表回答 → PDF / Word",
      icon: "chart",
      prompt: "帮我分析上周华东销售表现，给我趋势图。",
    },
    {
      id: "access",
      scenario: "S05",
      title: "敏感数据访问授权",
      description: "申请只读权限 → 用户放行 → 完成分析",
      icon: "shield",
      prompt: "为什么华东渠道贡献下降？请结合受限的渠道成本数据分析。",
    },
    {
      id: "action",
      scenario: "S02",
      title: "决策建议与行动",
      description: "分析库存 → 提出行动 → 授权写入数据库",
      icon: "database",
      prompt: "看看 R100 跑鞋的缺货情况，给出补货建议，确认后帮我创建补货草稿。",
    },
    {
      id: "ppt",
      scenario: "S10",
      title: "分析并生成 PPT",
      description: "经营分析 → 阅读汇报 PPT → 下载",
      icon: "file",
      prompt: "分析上周华东经营情况，做一份可以直接阅读的经营汇报 PPT。",
    },
    {
      id: "skill",
      scenario: "S10",
      title: "沉淀 Skill 与定时任务",
      description: "发现重复工作 → 主动建议 → 授权创建",
      icon: "clock",
      prompt: "和前两周一样，分析上周华东经营情况，再帮我生成阅读汇报 PPT。",
    },
    {
      id: "chat",
      scenario: "S01",
      title: "闲聊与能力引导",
      description: "简短回应 → 介绍能力 → 回到数据分析",
      icon: "spark",
      prompt: "今天有点累，你会讲笑话吗？",
    },
  ];
  const button = (r, label, action, extra = "", style = "secondary") =>
    C.btn(label, action, `data-task-id="${E(r.taskId)}" ${extra}`, style);
  const tools = (items) =>
    `<div class="demo-tools" aria-label="工具调用记录">${items.map(([name, result]) => `<div><span>${C.icon("check")}</span><div><strong>${E(name)}</strong><p>${E(result)}</p></div><small>完成</small></div>`).join("")}</div>`;
  const chart = () =>
    `<figure class="demo-chart"><figcaption>每日净销售额 <small>单位：万元</small></figcaption><svg viewBox="0 0 560 210" role="img" aria-label="上周华东每日净销售额，周六最高 23.1 万元"><title>每日净销售额</title>${[0, 10, 20, 30].map((v) => `<line x1="38" x2="550" y1="${170 - v * 4.8}" y2="${170 - v * 4.8}" stroke="#e4e9e2"/><text x="25" y="${174 - v * 4.8}" text-anchor="end">${v}</text>`).join("")}${report.values.map((v, n) => `<rect x="${54 + n * 72}" y="${170 - v * 4.8}" width="38" height="${v * 4.8}" rx="4" fill="${n === 5 ? "#1c5145" : "#9cbaa9"}"/><text x="${73 + n * 72}" y="${160 - v * 4.8}" text-anchor="middle">${v}</text><text x="${73 + n * 72}" y="195" text-anchor="middle">${E(report.days[n])}</text>`).join("")}</svg></figure>`;
  function exports(r, ppt = false) {
    return `<div class="demo-downloads">${(ppt
      ? [["pptx", "下载 PPT"]]
      : [
          ["pdf", "下载 PDF"],
          ["docx", "下载 Word"],
        ]
    )
      .map(([format, label]) =>
        button(r, C.icon("download") + " " + label, "demo-download", `data-format="${format}"`),
      )
      .join("")}<small>${ppt ? "PPTX · 5 页 · 可编辑" : "含正文、图表与数据来源"}</small></div>`;
  }
  function richReport(r) {
    return `<section class="demo-report" aria-label="富文本分析回答"><div class="demo-report-heading"><span>经营分析</span><small>${E(report.period)}</small></div><h2>华东销售稳步增长，周末贡献突出</h2><div class="demo-metrics"><div><small>净销售额</small><strong>${report.total}<em>万元</em></strong></div><div><small>较前一周</small><strong class="demo-positive">${report.growth}</strong></div><div><small>周末贡献</small><strong>34.4<em>%</em></strong></div></div><p>${E(report.conclusion)}</p>${chart()}<h3>渠道拆解</h3>${C.table(
      ["渠道", "净销售额（万元）", "占比"],
      report.channels.map((c) => [c.name, c.value.toFixed(2), c.share]),
    )}<h3>建议关注</h3><p>${E(report.recommendation)}</p><p class="demo-source">${E(report.source)}<br>${E(report.metric)}</p>${exports(r)}</section>`;
  }
  function deck(r) {
    return `<section class="demo-deck" aria-label="PPT 产物"><div class="demo-deck-cover"><span>COMPASS / WEEKLY REVIEW</span><h2>${E(report.title)}</h2><p>${E(report.period)}</p><strong>128.65 <small>万元</small><em>+9.5%</em></strong><small>经营例会 · 阅读汇报版</small></div><div class="demo-deck-body"><h3>华东经营周报.pptx</h3><p>5 页 · 可编辑图表 · 附数据口径和建议</p><ol>${report.slides.map((s) => `<li>${E(s.title)}</li>`).join("")}</ol><div class="toolbar">${button(r, "预览全部页面", "demo-preview")}${exports(r, true)}</div></div></section>`;
  }
  const gates = {
    access: {
      title: "允许查看受限的渠道成本数据？",
      scope: "财务库 channel_cost_detail · 华东 · 2026.10.12–10.18",
      impact: "仅 SELECT 聚合查询，返回渠道级成本；不读取个人信息、不允许写入。",
      expiry: "仅本次任务有效，最长 30 分钟。",
      approve: "允许本次访问",
      reply: "允许本次只读访问，只看华东的渠道成本汇总。",
    },
    action: {
      title: "将补货建议写入数据库？",
      scope: "补货库 replenishment_drafts · 新增 3 条草稿 · 共 120 双",
      impact: "写入待审核草稿，不修改现有库存，不下采购单；按当前会话去重。",
      expiry: "仅本次写入有效；修改数量或范围后需重新确认。",
      approve: "同意，写入 3 条草稿",
      reply: "同意，按这 3 个尺码、总计 120 双创建补货草稿。",
    },
    skill: {
      title: "保存为 Skill，并创建每周阅读任务？",
      scope: "个人 Skill「华东经营周报」v1 · 每周一 09:00（Asia/Shanghai）",
      impact: "读取已授权的华东汇总数据，生成 5 页 PPT，保存到个人报告空间；阅读提醒仅发给自己。",
      expiry:
        "持续授权 30 天，每次预算 ¥5；支持暂停。新增数据权限、数据库写入或扩大接收人需再次确认。",
      approve: "同意创建 Skill 和定时任务",
      reply: "同意，保存到我的 Skill，每周一 9 点生成 PPT，只提醒我自己，授权 30 天。",
    },
  };
  function gate(r) {
    const g = gates[r.demoCase],
      choice = r.demoChoice;
    return `<section class="demo-approval" data-gate="${r.demoCase}"><div class="demo-approval-head">${C.icon("shield")}<strong>${g.title}</strong>${C.badge(choice === "pending" ? "等待决定" : choice === "rejected" ? "已拒绝" : r.demoChoiceSource === "example" ? "示例已同意" : "已同意", choice === "pending" ? "warning" : choice === "rejected" ? "neutral" : "success")}</div><dl><dt>授权范围</dt><dd>${g.scope}</dd><dt>操作影响</dt><dd>${g.impact}</dd><dt>有效期</dt><dd>${g.expiry}</dd></dl><div class="toolbar">${choice === "pending" ? button(r, g.approve, "demo-decide", 'data-choice="approved"', "primary") + button(r, "拒绝，保留分析", "demo-decide", 'data-choice="rejected"') : button(r, "重新选择授权结果", "demo-decide", 'data-choice="pending"')}</div><small>本地合成演示 · 选择仅改变此示例的对话与回执</small></section>`;
  }
  const receipt = (title, body) =>
    `<div class="demo-receipt">${C.icon("check")}<div><strong>${title}</strong><p>${body}</p></div></div>`;
  function build(r) {
    const c = cases.find((c) => c.id === r.demoCase),
      messages = [];
    const user = (text, kind = "message") => messages.push({ role: "user", text, kind });
    const agent = (text, html = "", kind = "analysis") =>
      messages.push({ role: "assistant", text, html, kind });
    const decide = () => {
      agent("请确认以上操作的范围和影响。", gate(r), "authorization");
      if (r.demoChoice === "pending") {
        agent("等待你的决定。已完成的分析保留，受控工具尚未调用。");
        return false;
      }
      if (r.demoChoice === "rejected") {
        user("暂不授权，保留已有分析。", "decision");
        agent(
          "已保留已有结论，后续受控动作未执行。",
          receipt("已拒绝 · 未执行", "可以重新选择授权结果，查看同意后的完整示例。"),
        );
        return false;
      }
      user(gates[r.demoCase].reply, "decision");
      return true;
    };
    user(c.prompt);
    if (c.id === "chat") {
      agent("会呀：数据分析师的周末——终于没有异常了，原来是报表没刷新。希望能让你轻松一点。");
      user("哈哈，那你平时能帮我做什么？");
      agent(
        "我擅长帮你把经营数据变成可理解的结论和行动建议。我们接着聊数据分析吧。",
        `<div class="demo-capabilities"><p><strong>查数据、看趋势</strong><br>销售、渠道、库存表现，回答里直接展示图表。</p><p><strong>找原因、提行动</strong><br>拆解异动、核对证据；敏感查询和写操作先征求同意。</p><p><strong>做汇报、重复使用</strong><br>导出 PDF、Word、PPT，经授权保存 Skill 和定时任务。</p></div><div class="demo-suggestions">${button(r, "看看上周华东销售表现", "demo-select", 'data-case="simple"')}${button(r, "生成一份经营周报 PPT", "demo-select", 'data-case="ppt"')}</div>`,
      );
      return messages;
    }
    agent(
      "我先核对时间范围、指标口径与可用数据，再根据结果继续分析。",
      tools([
        ["读取指标定义", "净销售额扣除已确认退款，统一使用销售确认日。"],
        ["查询经营汇总", "华东 · 10/12–10/18 · 数据完整性检查通过。"],
      ]),
    );
    if (c.id === "simple") {
      user("再按渠道拆分一下，并给我一份可以下载的完整结论。");
      agent(
        "已取得日销售结果，继续拆解渠道并核验合计。",
        tools([
          ["SQL · 按日与渠道聚合", "7 个日汇总、4 个渠道汇总，均处于已授权的数据范围。"],
          ["Python · 交叉核验与绘图", "日合计与渠道合计一致：128.65 万元；图表数据校验通过。"],
        ]),
      );
      agent("分析完成。以下是完整结论，可以直接下载。", richReport(r), "result");
    } else if (c.id === "access") {
      agent(
        "销售增长 8.2%，渠道贡献却下降 15.3%。需要进一步核对渠道费用；相关成本表属于受限财务数据。",
        tools([
          ["SQL · 收入与贡献对比", "发现收入与贡献走势背离。"],
          ["权限检查 · 财务库", "channel_cost_detail 需要本次任务的额外只读授权，查询尚未执行。"],
        ]),
      );
      if (decide()) {
        agent(
          "本次只读范围已确认，继续读取成本汇总并做贡献拆解。",
          tools([
            ["SQL · 受限成本聚合", "仅查询华东 4 个渠道的成本汇总，无个人明细。"],
            ["Python · 贡献桥接", "渠道贡献由 18.30 万元降至 15.50 万元，下降约 15.3%。"],
          ]),
        );
        agent(
          "贡献下降主要由促销折扣和渠道费用增加共同解释，建议复核天猫活动折扣和抖音投放效率。",
          `<section class="demo-report"><h3>渠道贡献变化</h3>${C.table(
            ["变动项", "贡献影响（万元）"],
            [
              ["销售增长", "+1.50"],
              ["促销折扣增加", "−2.40"],
              ["渠道费用增加", "−1.90"],
              ["合计", "−2.80"],
            ],
          )}<p class="demo-source">财务库渠道成本汇总 · 华东 · 2026.10.12–10.18 · 合成示例</p></section>${receipt("访问已完成", "本次只读授权已使用；无数据库写入。")}`,
          "result",
        );
      }
    } else if (c.id === "action") {
      agent(
        "总库存充足，但华东门店的热门尺码可售量不足。建议从区域仓补入 120 双，先创建待审核草稿。",
        tools([
          ["SQL · SKU 可售量与在途量", "核对 R100 的 40 / 41 / 42 码；排除已有在途补货。"],
          ["Python · 7 日覆盖测算", "推荐补货分别为 30 / 50 / 40 双；区域仓可用库存足够。"],
        ]) +
          `<section class="demo-report"><h3>建议执行的补货清单</h3>${C.table(
            ["尺码", "当前可售 / 双", "建议补货 / 双"],
            [
              ["40", "8", "30"],
              ["41", "5", "50"],
              ["42", "12", "40"],
            ],
          )}<p>建议：优先恢复热门尺码覆盖，写入后交由供应链审核。</p></section>`,
      );
      if (decide()) {
        agent(
          "已按你确认的清单完成写入。",
          tools([
            [
              "数据库事务 · INSERT replenishment_drafts",
              "新增 3 条草稿，共 120 双；事务提交成功。",
            ],
            ["SQL · 回读校验", "3 条记录数量与范围一致，重复请求不会再次插入。"],
          ]) +
            receipt(
              "补货草稿已创建 · 示例回执 DB-024",
              "DR-040 / 30 双 · DR-041 / 50 双 · DR-042 / 40 双<br>状态：待供应链审核。库存和采购单尚未变化。",
            ),
          "result",
        );
      }
    } else {
      if (c.id === "ppt") user("用于经营例会，做成 5 页阅读版，带图表和建议。");
      agent(
        "数据核验完成。净销售额 128.65 万元，环比增长 9.5%；我将整理成 5 页阅读汇报。",
        tools([
          ["SQL + Python · 经营分析", "完成销售走势、渠道结构与周末贡献核验。"],
          ["PPT · 生成与检查", "生成 5 页阅读汇报，检查图表合计、结论和数据来源。"],
        ]),
      );
      agent("PPT 已生成，正文包含结论、图表、建议和口径说明。", deck(r), "result");
      if (c.id === "skill") {
        agent(
          "我注意到你已连续 3 周生成相同结构的经营周报。可以把这套步骤保存为 Skill，并每周自动生成 PPT，提醒你阅读。",
          `<div class="demo-repeat"><strong>识别到 3 次相似任务</strong><p>10/05 · 华东经营周报 → 10/12 · 同口径汇报 → 10/19 · 本次汇报</p><p>可复用：指标口径 → 查询与校验 → 图表 → 5 页 PPT。每次自动更新上一完整周的日期。</p></div>`,
        );
        if (decide())
          agent(
            "已按授权保存 Skill 和定时任务。",
            tools([
              ["Skill · 保存个人资产", "华东经营周报 v1，输入参数：区域、日期、汇报模板。"],
              ["定时任务 · 创建", "每周一 09:00 / Asia/Shanghai，下一次：2026-10-26 09:00。"],
            ]) +
              `<div class="demo-asset-pair"><div><span>${C.icon("book")} Skill 资产</span><strong>华东经营周报</strong><small>个人 · v1 · 已保存（示例）</small>${button(r, "查看 Skill 内容", "demo-skill")}</div><div><span>${C.icon("clock")} 定时阅读任务</span><strong>每周一 09:00</strong><small>仅自己 · 30 天授权 · 每次 ¥5</small>${button(r, r.demoSchedulePaused ? "恢复任务" : "暂停任务", "demo-schedule")}</div></div>${receipt(r.demoSchedulePaused ? "定时任务已暂停" : "定时任务已创建 · 示例回执 SCH-024", r.demoSchedulePaused ? "暂停期间不生成新报告。" : "按授权读取华东汇总数据并保存 PPT，仅提醒自己。")}`,
            "result",
          );
      }
    }
    return messages;
  }
  function sync(r) {
    r.transcript = build(r).map((m, n) => ({
      id: `${r.taskId}-demo-${n}`,
      time: r.createdAt,
      version: 1,
      ...m,
    }));
    r.phase =
      gates[r.demoCase] && r.demoChoice === "pending"
        ? "awaiting"
        : gates[r.demoCase] && r.demoChoice === "rejected"
          ? "partial"
          : "completed";
    r.updatedAt = new Date().toISOString();
    C.save();
  }
  C.renderDemoConversation = (r) =>
    `<div class="sc-transcript demo-transcript" aria-label="完整分析会话"><div class="demo-example-note">${C.icon("file")}完整对话示例 · 一次展示全部内容 · 授权与执行回执均为合成演示</div>${r.transcript.map((m) => (m.role === "user" ? `<article class="sc-user-message"><div><p>${E(m.text)}</p><div class="sc-message-meta">示例用户${m.kind === "decision" ? " · 授权决定" : ""}</div></div></article>` : `<article class="sc-agent-message"><div class="sc-agent-byline"><span class="sc-compass-mark">${C.icon("spark")}</span><strong>Compass</strong></div><div class="sc-message-answer"><p>${E(m.text)}</p></div>${m.html || ""}</article>`)).join("")}</div>`;
  C.renderDemoPanel = (r) =>
    `<aside class="sc-demo-panel demo-picker" aria-label="演示面板" ${window.innerWidth <= 1180 && r.demoPanelMobileOpen ? 'role="dialog" aria-modal="true"' : ""}><div class="sc-demo-panel-head"><span>${C.icon("panel-right")} 场景演示</span><small>6 个任务</small>${C.btn(C.icon("close"), "sc-panel-close", `data-id="${r.id}" data-task-id="${E(r.taskId)}" aria-label="关闭演示面板"`, "ghost icon-btn sc-demo-drawer-close")}</div><p class="sc-demo-intro">选择一个任务，立即查看完整对话、工具调用和最终产物。</p><div class="demo-case-list">${cases.map((c, n) => `<button type="button" class="demo-case ${r.demoCase === c.id ? "is-active" : ""}" data-action="demo-select" data-case="${c.id}" data-task-id="${E(r.taskId)}" aria-pressed="${r.demoCase === c.id}"><span class="demo-case-number">0${n + 1}</span><span><strong>${c.title}</strong><small>${c.description}</small></span><span class="demo-case-play">${r.demoCase === c.id ? "当前" : "演示"}</span></button>`).join("")}</div><div class="demo-picker-foot">${C.icon("check")}无需等待，所有消息直接呈现。<br>授权卡可重新选择同意或拒绝。</div>${!r.demoCase ? `<details class="demo-legacy" data-task-id="${E(r.taskId)}" ${r.demoLegacyExpanded ? "open" : ""}><summary>更多分析与状态演练</summary>${C.renderLegacyDemoPanel(r)}</details>` : ""}</aside>`;
  document.addEventListener(
    "toggle",
    (event) => {
      if (!event.target.matches?.(".demo-legacy")) return;
      const r = C.state.conversations[event.target.dataset.taskId];
      if (r) {
        r.demoLegacyExpanded = event.target.open;
        C.save();
      }
    },
    true,
  );
  function active(el) {
    const r = C.state.conversations[el.dataset.taskId];
    if (
      !r ||
      !C.conversationVisible(r) ||
      (C.route() !== "chat/" + r.taskId && C.route() !== "scenario/" + r.id)
    ) {
      C.toast("当前会话不可用，请重新打开。");
      return null;
    }
    return r;
  }
  C.handlers["demo-select"] = (el) => {
    if (!active(el)) return;
    const c = cases.find((c) => c.id === el.dataset.case);
    if (!c) return;
    C.scenarioStopDemo?.();
    const r = C.startConversation(c.scenario, c.prompt);
    if (!r) return;
    r.demoCase = c.id;
    r.title = c.title + " · " + c.prompt;
    r.demoChoice = "approved";
    r.demoChoiceSource = "example";
    r.demoPlayback = { status: "idle" };
    r.step = 4;
    r.chatScrollTop = 0;
    r.scrollToLatest = false;
    sync(r);
    C.render();
  };
  C.handlers["demo-decide"] = (el) => {
    const r = active(el);
    if (
      !r ||
      !gates[r.demoCase] ||
      !["pending", "approved", "rejected"].includes(el.dataset.choice)
    )
      return;
    r.chatScrollTop = document.querySelector(".sc-message-feed")?.scrollTop || 0;
    r.demoChoice = el.dataset.choice;
    r.demoChoiceSource = "user";
    r.demoSchedulePaused = false;
    sync(r);
    C.render();
  };
  C.handlers["demo-preview"] = (el) => {
    const r = active(el);
    if (!r) return;
    C.modal(
      "华东经营周报 · 5 页预览",
      `<div class="demo-slide-preview">${report.slides.map((s, n) => `<section><small>0${n + 1} / 05</small><h2>${E(s.title)}</h2>${n === 2 ? chart() : ""}<p>${E(s.body).replaceAll("\n", "<br>")}</p></section>`).join("")}</div>`,
      exports(r, true),
    );
  };
  C.handlers["demo-download"] = (el) => {
    if (!active(el)) return;
    if (!C.can("export")) return C.toast("当前身份没有导出权限。");
    const file = window.COMPASS_DEMO_DOWNLOADS?.[el.dataset.format];
    if (!file) return C.toast("下载文件未加载，请刷新后重试。");
    const bytes = Uint8Array.from(atob(file.data), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: file.type })),
      a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    C.toast("已下载 " + file.name);
  };
  C.handlers["demo-skill"] = (el) => {
    const r = active(el);
    if (!r || r.demoChoice !== "approved") return;
    C.modal(
      "华东经营周报 · Skill v1",
      `<div class="demo-skill-detail"><p>个人资产 · 合成演示</p><h3>输入</h3><p>区域：华东；日期：上一完整周；输出：5 页阅读汇报 PPT。</p><h3>执行步骤</h3><ol><li>检查授权范围与数据完整性</li><li>查询净销售额和渠道汇总</li><li>核验合计、生成趋势图</li><li>整理结论与建议，生成 PPT</li><li>保存个人报告并提醒阅读</li></ol><h3>边界</h3><p>数据未到齐时暂停。超出读取范围、写入数据库或扩大接收人时重新申请授权。</p></div>`,
    );
  };
  C.handlers["demo-schedule"] = (el) => {
    const r = active(el);
    if (!r || r.demoCase !== "skill" || r.demoChoice !== "approved") return;
    r.demoSchedulePaused = !r.demoSchedulePaused;
    r.chatScrollTop = document.querySelector(".sc-message-feed")?.scrollTop || 0;
    sync(r);
    C.render();
  };
  // Keep demo transcripts explicit and stable; free-form questions start ordinary sessions.
  const followup = C.handlers["sc-followup"];
  C.handlers["sc-followup"] = (el, event) => {
    const r = C.state.conversations[el.dataset.taskId];
    if (!r?.demoCase) return followup(el, event);
    if (event.type !== "submit") return;
    event.preventDefault();
    const value = el.querySelector("textarea").value.trim();
    if (!value || !active(el)) return;
    C.startConversation(r.id, value);
    C.toast("已创建独立分析会话，演示记录保留。");
  };
})();
