/* Compass management prototype. All operations are local simulations. */
(() => {
  'use strict';
  const C = window.C;
  const E = C.esc;
  const roles = { executive: '经营负责人', analyst: '业务分析师', manager: '部门管理者', admin: '工作区管理员', operator: '运行维护者', auditor: '审计员' };
  const caps = { analyze: '分析工作台', assets: '分析资产', automations: '自动化', review: '协作复核', 'admin-overview': '控制总览', data: '数据与语义', capabilities: 'Agent 与能力', runs: '运行与调度', quality: '质量与发布', security: '安全与审计', memory: '记忆与产物', organization: '组织设置', export: '导出产物', publish: '发布与分享', 'audit-sensitive': '敏感审计载荷查看', 'governance-write': '管理配置与运行写操作' };
  const seeds = {
    tabs: {}, sources: [
      { id: 'src-01', name: '行野经营数仓', kind: 'PostgreSQL', host: 'warehouse.demo.internal', scope: '中国业务 / 36 个月', tables: 24, status: '已连接', sync: '2026-10-20 08:00' },
      { id: 'src-02', name: '营销活动台账', kind: 'CSV / Excel', host: 'campaigns_october.csv', scope: '2026 年活动与变更', tables: 1, status: '已连接', sync: '2026-10-20 07:55' },
      { id: 'src-03', name: '门店库存快照', kind: 'S3', host: 'inventory.demo.internal', scope: '8 个配送中心 / 240 家门店', tables: 2, status: '待更新', sync: '2026-10-19 23:00' }
    ], metricVersion: '2.1', metricDraft: '', schemaAccepted: false, trusted: false, qualityResolved: false,
    config: { mode: 'balanced', region: 'cn', tools: ['query', 'python', 'files'], maxSteps: 30, timeout: 120, network: false },
    candidate: '1.5.0', revision: 1, production: '1.4.2', eval: null, evalFixture: 'baseline', releases: [{ version: '1.4.2', date: '2026-10-18 14:30', actor: '林予', note: '经营分析基线 · 6 / 6 质量门禁通过' }, { version: '1.4.1', date: '2026-10-14 10:00', actor: '林予', note: '净收入口径 2.0 · 发布已归档' }], experiment: false, skillInstalled: false,
    runs: [
      { id: 'RUN-2048', title: '华东跑鞋净收入异动调查', owner: '陈岚', status: '运行中', cost: 3.42, progress: 64, checkpoint: '已验证 4 个查询；库存分支执行中' },
      { id: 'RUN-2047', title: '10 月第三周经营周报', owner: '经营分析服务', status: '等待授权', cost: 1.86, progress: 82, checkpoint: '报告 V3 已生成；等待向经营组发布' },
      { id: 'RUN-2046', title: 'R100 尺码库存清洗', owner: '周衡', status: '失败', cost: 0.92, progress: 38, checkpoint: '文件字段类型变化；检查点 3 可恢复' },
      { id: 'RUN-2045', title: '天猫订单与退款对账', owner: '许宁', status: '已完成', cost: 2.14, progress: 100, checkpoint: '3 个产物 / 全部验证通过' }
    ], concurrency: 8, budget: 500, alertThreshold: 80, scheduleEnabled: true, scheduleOwner: '经营分析服务', scheduleTime: '09:00', scheduleRecipient: '经营管理组', lastDelivery: '成功', triggerEnabled: true, triggerThreshold: 8, triggerCount: 1, recovered: [],
    auditUnmasked: false, retention: 180, policies: { export: '审批', read: '自动', external: '拒绝' }, reviewEscalated: false, notification: true,
    memories: [
      { id: 'MEM-041', text: '陈岚偏好按自然周比较趋势', type: '个人偏好', scope: '陈岚', source: '会话 T-1026 · 用户明确表达', status: '有效', expiry: '2027-01-20' },
      { id: 'MEM-042', text: '国庆活动价格以营销台账版本 3 为准', type: '业务上下文', scope: '经营分析组', source: '活动复盘 · 李然确认', status: '待提升', expiry: '2026-11-07' },
      { id: 'MEM-043', text: '净收入 = 支付金额（未扣退款）', type: '口径冲突', scope: '分析任务 T-1021', source: '上传会议纪要 · 未验证', status: '冲突', expiry: '2026-10-31' }
    ], artifactShared: true, artifactArchived: false, templateEnabled: true,
    members: [
      { name: '陈岚', email: 'chenlan@xingye.example', department: '电商经营部', role: 'analyst', status: '有效' },
      { name: '李然', email: 'liran@xingye.example', department: '经营管理部', role: 'manager', status: '有效' },
      { name: '林予', email: 'linyu@xingye.example', department: '数据平台部', role: 'admin', status: '有效' },
      { name: '周衡', email: 'zhouheng@xingye.example', department: '供应链管理部', role: 'analyst', status: '待离职停用' }
    ], roleEditing: 'analyst', sso: true, serviceActive: true, lifecycle: '2026-10-20 08:00', lastAction: '所有展示数据均为合成经营数据。'
  };
  C.state.admin = C.state.admin || {};
  for (const [key, value] of Object.entries(seeds)) if (!(key in C.state.admin)) C.state.admin[key] = value;
  const A = C.state.admin;
  A.auditUnmasked = false;
  const readActions = new Set([
    'close', 'tab', 'goto', 'source-detail', 'schema-detail', 'schema-diff', 'query-detail',
    'tool-contract', 'skill-detail', 'sandbox-check', 'hitl-detail', 'run-detail', 'eval-sample',
    'trace-detail', 'audit-reveal', 'audit-confirm', 'audit-export', 'memory-conflict',
    'artifact-share', 'artifact-lineage', 'artifact-permission', 'template-check', 'role-load',
    'tenant-detail', 'tenant-check'
  ]);
  const requiresWrite = name => !readActions.has(name);
  const B = (label, action, attrs = '', kind = 'secondary') => {
    const denied = requiresWrite(action) && !C.can('governance-write');
    const guard = denied ? ' disabled aria-disabled="true" data-governance-denied="true" title="需要管理配置与运行写权限；当前角色仅可查看"' : '';
    return C.btn(label, `adm-${action}`, attrs + guard, kind);
  };
  const badge = (s, tone) => C.badge(s, tone || (/失败|冲突|拒绝|停用|不通过/.test(s) ? 'danger' : /等待|待|暂停|受限/.test(s) ? 'warning' : /成功|有效|通过|连接|完成|运行|开启/.test(s) ? 'success' : 'neutral'));
  const field = (label, id, value = '', type = 'text', extra = '') => `<label class="field" for="${id}"><span>${label}</span><input id="${id}" type="${type}" value="${E(value)}" ${extra}></label>`;
  const select = (label, id, items, value) => `<label class="field" for="${id}"><span>${label}</span><select id="${id}">${items.map(([v, t]) => `<option value="${v}" ${value === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`;
  const notice = (text, kind = '') => `<div class="notice ${kind}">${text}</div>`;
  const head = (eyebrow, title, description, actions = '') => `<div class="page-head"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p class="muted">${description}</p></div><div class="toolbar">${actions}</div></div>`;
  const panel = (title, body, subtitle = '') => `<section class="panel"><div class="admin-panel-head"><h2>${title}</h2>${subtitle ? `<p class="muted">${subtitle}</p>` : ''}</div>${body}</section>`;
  const stat = (value, title, foot) => `<div class="stat"><span class="muted">${title}</span><strong>${value}</strong><span class="muted">${foot}</span></div>`;
  const tabs = (route, items) => {
    const current = A.tabs[route] || items[0][0];
    return `<div class="tabs" role="tablist" aria-label="${caps[route] || route}">${items.map(([id, label]) => `<button class="tab ${id === current ? 'active' : ''}" role="tab" aria-selected="${id === current}" data-action="adm-tab" data-route="${route}" data-tab="${id}">${label}</button>`).join('')}</div>`;
  };
  const active = (route, fallback) => A.tabs[route] || fallback;
  const commit = (message, render = true) => { A.lastAction = message; C.save(); if (render) C.render(); C.toast(message); };
  const value = id => document.getElementById(id)?.value?.trim() || '';
  const error = message => { const el = document.getElementById('adm-form-error'); if (el) { el.textContent = message; el.hidden = false; el.setAttribute('role', 'alert'); } else C.toast(message); };
  const errors = '<p id="adm-form-error" class="notice danger" hidden></p>';
  const finish = message => { C.closeModal(); commit(message); };
  const go = (route, tab) => { C.closeModal(); if (tab) A.tabs[route] = tab; C.go(route); };
  const action = (name, fn, capability) => { C.handlers[`adm-${name}`] = (el, event) => { if (requiresWrite(name) && !C.can('governance-write')) { C.toast('当前角色仅可查看。此操作需要管理配置与运行写权限。'); return; } if (capability && !C.can(capability)) { C.toast('当前角色没有执行此操作的权限。'); return; } fn(el, event); }; };
  const detail = (title, rows, extra = '') => C.modal(title, `<dl class="admin-details">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>${extra}`, B('关闭', 'close'));
  const footer = (label, actionName, attrs = '') => B('取消', 'close') + B(label, actionName, attrs, 'primary');
  action('close', () => C.closeModal());
  action('tab', el => { A.tabs[el.dataset.route] = el.dataset.tab; C.save(); C.render(); });
  action('goto', el => go(el.dataset.route, el.dataset.tab));

  function overview() {
    const running = A.runs.filter(r => r.status === '运行中').length;
    const conflict = A.memories.some(m => m.status === '冲突');
    const pending = A.runs.filter(r => r.status === '等待授权').length + Number(!A.qualityResolved) + Number(conflict);
    return head('WORKSPACE CONTROL · 行野运动集团', '每一次分析，都有边界', '观察运行健康、质量与治理事项。从异常出发，进入对应的管理工作。', B('查看运行', 'goto', 'data-route="runs"', 'primary')) +
      `<div class="stat-grid">${stat(running, '运行中任务', '当前并发限额 ' + A.concurrency)}${stat('98.6%', '任务交付率', '最近 7 天 · 演示样本')}${stat('¥ 128.40', '本月分析成本', `月预算 ¥ ${A.budget}`)}${stat(pending, '待处理事项', '授权 / 数据质量 / 记忆冲突')}</div>` +
      `<div class="grid-2">${panel('需要你关注', `<div class="list-row"><div>${badge('等待授权', 'warning')}<h3>经营周报 V3 等待发布授权</h3><p class="muted">传播范围：经营管理组 · 有效期 24 小时</p></div>${B('检查请求', 'goto', 'data-route="runs"')}</div><div class="list-row"><div>${badge(A.qualityResolved ? '已解决' : '数据延迟', 'warning')}<h3>${A.qualityResolved ? '华东库存新鲜度已恢复' : '华东库存更新延迟 6 小时'}</h3><p class="muted">影响 18 张报告；已标记数据新鲜度。</p></div>${B('查看影响', 'goto', 'data-route="data" data-tab="quality"')}</div><div class="list-row"><div>${badge(conflict ? '口径冲突' : '冲突已处理', conflict ? 'danger' : 'success')}<h3>${conflict ? '一条候选记忆与指标目录冲突' : '候选记忆冲突已撤销'}</h3><p class="muted">净收入定义与语义版本 2.1 不一致。</p></div>${B('处理冲突', 'goto', 'data-route="memory"')}</div>`)}${panel('当前能力组合', `<div class="admin-version"><span class="eyebrow">PRODUCTION</span><strong>v${A.production}</strong>${badge('生产已发布', 'success')}</div><dl class="admin-details"><div><dt>主 Agent</dt><dd>经营分析 Agent · balanced</dd></div><div><dt>工具与 Skill</dt><dd>7 个受控工具 / 6 个领域 Skill</dd></div><div><dt>语义目录</dt><dd>行野经营口径 v${A.metricVersion}</dd></div><div><dt>模型路由</dt><dd>分析 → 推理模型；问数 → 轻量模型</dd></div><div><dt>部署区域</dt><dd>中国区 · 禁止跨区域降级</dd></div></dl>${B('管理组合版本', 'goto', 'data-route="quality" data-tab="releases"')}`)}</div>` +
      panel('最近操作', `<p>${E(A.lastAction)}</p><p class="muted">原型中的操作仅改变本浏览器的演示状态，不会连接真实数据源或执行外部动作。</p>`);
  }

  function data() {
    const t = active('data', 'sources');
    let body = '';
    if (t === 'sources') body = panel('已连接的数据源', C.table(['数据源', '类型 / 数据范围', '同步时间', '状态', '操作'], A.sources.map(s => [`<strong>${E(s.name)}</strong><div class="muted">${E(s.id)}</div>`, `${E(s.kind)}<div class="muted">${E(s.scope)}</div>`, E(s.sync), badge(s.status), B('详情', 'source-detail', `data-id="${s.id}"`) + B('同步', 'source-sync', `data-id="${s.id}"`)]))) + notice('凭证仅用于演示校验，不存储输入的密钥。真实系统使用独立密钥服务，并按执行身份限制可访问范围。');
    if (t === 'catalog') body = panel('经营数据目录', `<div class="toolbar">${B('同步元数据', 'schema-sync', '', 'primary')}${badge(A.schemaAccepted ? 'schema 变更已确认' : '发现 1 项 schema 变化', A.schemaAccepted ? 'success' : 'warning')}</div>` + C.table(['数据集', '粒度', '覆盖', '质量 / 变更', '操作'], [
      ['fact_order_items', '订单明细 / SKU', '2023-11 → 2026-10 · 36 个月', badge('已验证'), B('查看字段', 'schema-detail', 'data-name="fact_order_items"')],
      ['fact_returns', '退货明细 / 原订单', '中国区 · 7 大区', badge('已验证'), B('查看字段', 'schema-detail', 'data-name="fact_returns"')],
      ['fact_inventory', '仓店 / SKU / 日', '240 门店 + 8 配送中心', badge(A.schemaAccepted ? '已确认' : '新增 available_qty'), B('变更影响', 'schema-diff')],
      ['dim_product', 'SKU → SPU → 品类', '60,000 SKU / 8,000 SPU', badge('已验证'), B('查看字段', 'schema-detail', 'data-name="dim_product"')]
    ]));
    if (t === 'metrics') body = `<div class="grid-2">${panel('净收入', `<div class="toolbar">${badge('当前版本 v' + A.metricVersion, 'success')}${badge('业务负责人：许宁')}</div><p class="admin-formula">实付金额 − 已确认退款金额</p><p>按订单支付日期归属；退款回溯原订单。金额含税，单位为人民币元。</p><dl class="admin-details"><div><dt>数据范围</dt><dd>中国区全渠道；排除测试订单</dd></div><div><dt>粒度</dt><dd>先按订单明细聚合，再关联退款</dd></div><div><dt>生效时间</dt><dd>2026-10-01 00:00 Asia/Shanghai</dd></div></dl>${B('创建口径版本', 'metric-edit', '', 'primary')}`)}${panel('版本与影响', C.table(['版本', '变更', '状态'], [[`v${A.metricVersion}`, '退款回溯原订单；避免明细重复', badge('生效')], ['v2.0', '净支付口径；历史 42 个产物保留引用', badge('历史')], ...(A.metricDraft ? [['待发布草稿', E(A.metricDraft), badge('草稿')]] : [])]) + (A.metricDraft ? B('发布新口径', 'metric-publish') : '') + `<p class="muted">新版本影响后续运行。历史结果保留其原口径版本。</p>`)}</div>`;
    if (t === 'queries') body = panel('可信查询与运行时示例', C.table(['名称', '语义版本', '来源', '使用范围', '操作'], [['全渠道净收入汇总', 'v2.1', '人工复核 / QS-018', 'Agent 检索可用', B('查看 SQL', 'query-detail')], ['退款与订单一对一对账', 'v2.1', '人工复核 / QS-021', '仅经营分析组', B('查看 SQL', 'query-detail')], ['待验证：门店连带率', 'v1.0', '业务提交 / QS-024', A.trusted ? 'Agent 检索可用' : '草稿，不进入运行时', B(A.trusted ? '撤销信任' : '验证并启用', 'query-trust')]])) + notice('评测答案与运行时示例分开管理。加入可信查询需要独立复核与授权。');
    if (t === 'quality') body = panel('质量事件与受影响产物', `<div class="toolbar">${badge(A.qualityResolved ? '事件已关闭' : 'Q-078 · 新鲜度告警', A.qualityResolved ? 'success' : 'warning')}${B(A.qualityResolved ? '重新打开演示事件' : '执行质量复查', 'quality-resolve')}</div>` + C.table(['检查', '实际值', '门槛', '结果'], [['库存新鲜度', A.qualityResolved ? '12 分钟' : '6 小时', '≤ 2 小时', badge(A.qualityResolved ? '通过' : '未通过')], ['订单主键唯一性', '100%', '= 100%', badge('通过')], ['退款引用完整性', '99.98%', '≥ 99.9%', badge('通过')], ['跨渠道金额核对', '差异 0.03%', '≤ 0.1%', badge('通过')]]) + `<p>影响对象：华东跑鞋诊断、库存周报等 18 个产物。${A.qualityResolved ? '复查通过后可发起新版本重算，历史快照保持可追溯。' : '已标记上游延迟；Agent 应提示分析范围，不把无记录解释为零。'}</p>`);
    return head('DATA & SEMANTICS · AD-06–10', '让经营数据有据可依', '连接、元数据、指标口径与可信查询统一维护，每个结果都能追溯其使用的版本。', B('添加数据源', 'source-new', '', 'primary')) + tabs('data', [['sources', '数据连接'], ['catalog', '数据目录'], ['metrics', '指标口径'], ['queries', '可信查询'], ['quality', '数据质量']]) + body;
  }

  function capabilities() {
    const t = active('capabilities', 'agent');
    let body = '';
    if (t === 'agent') body = `<div class="grid-2">${panel('经营分析 Agent', `<div class="toolbar">${badge('生产 v' + A.production, 'success')}${badge('候选 v' + A.candidate + ' · 修订 ' + A.revision)}</div><p>负责理解目标、选择方法、编排能力、验证证据与交付版本化产物。</p>${select('默认自主程度', 'adm-agent-mode', [['balanced', '平衡 · 关键取舍对齐'], ['autonomous', '自主 · 授权范围内推进'], ['guided', '协作 · 计划先对齐']], A.config.mode)}${field('单任务最大步骤', 'adm-max-steps', A.config.maxSteps, 'number', 'min="5" max="100"')}<p class="muted">保存形成候选配置修订，生产任务继续使用已发布版本。</p>${B('保存候选配置', 'config-save', '', 'primary')}`)}${panel('交付与检查契约', `<ol class="admin-checklist"><li>确定问题、口径、时间范围与交付形式</li><li>选择工具、Skill 或独立调查分支</li><li>执行前校验当前身份、权限与预算</li><li>根据反证调整假设，保留过程记录</li><li>逐条绑定结论、计算与数据来源</li><li>记录完成程度、验证状态与未解决问题</li></ol><p class="muted">Agent 的可观察过程展示计划、工具和证据摘要，不展示隐藏的模型思维链。</p>`)}</div>`;
    if (t === 'tools') body = panel('工具能力与副作用边界', C.table(['工具', '执行身份 / 资源', '副作用', '当前策略', '操作'], [['SQL 查询', '发起用户 / 只读 / 1 GB 扫描上限', '无', badge(A.config.tools.includes('query') ? '启用' : '禁用'), B('配置', 'tool-config', 'data-tool="query"')], ['Python 沙箱', '隔离容器 / 512 MB / 120 秒', '仅创建分析产物', badge(A.config.tools.includes('python') ? '启用' : '禁用'), B('配置', 'tool-config', 'data-tool="python"')], ['文件处理', '当前任务上传文件', '生成派生数据', badge(A.config.tools.includes('files') ? '启用' : '禁用'), B('配置', 'tool-config', 'data-tool="files"')], ['发布与通知', '批准的受众与版本', '外部动作', badge('每次检查授权', 'warning'), B('查看动作契约', 'tool-contract')]]));
    if (t === 'skills') body = panel('方法包与固定流程', C.table(['对象', '类型 / 版本', '前提与产物', '状态', '操作'], [['收入贡献分解', 'Skill · 2.3', '互斥维度 / 贡献桥图', badge('已启用'), B('方法契约', 'skill-detail', 'data-skill="收入贡献分解"')], ['30 日复购分析', 'Skill · 1.2', '成熟队列 / 留存矩阵', badge('已启用'), B('方法契约', 'skill-detail', 'data-skill="30 日复购分析"')], ['每日经营简报', 'Workflow · 1.4', '等待数据到齐 → 查询 → 模板 → 投递', badge('已启用'), B('流程依赖', 'skill-detail', 'data-skill="每日经营简报"')], ['独立库存调查', '子 Agent · 1.0', '有限目标 / 独立预算 / 交叉验证', badge('已启用'), B('委派边界', 'skill-detail', 'data-skill="独立库存调查"')], ['实验效应评估', 'Skill · 0.9', '随机分配诊断 / 效应区间', badge(A.skillInstalled ? '候选已安装' : '可安装'), B(A.skillInstalled ? '移除候选' : '安装至候选', 'skill-install')]])) + notice('安装能力包不会扩大数据权限。新增工具依赖、模型地域或外部动作范围仍需独立授权。');
    if (t === 'models') body = panel('模型路由与降级约束', C.table(['任务', '主路由', '降级', '约束'], [['快速问数', '轻量文本模型 · CN-A', '轻量文本模型 · CN-B', '相同工具能力与区域'], ['复杂诊断', '推理模型 · CN-A', '推理模型 · CN-B', '保留结构化输出与工具调用'], ['文件与图表读取', '多模态模型 · CN-A', '暂停并请求替代输入', '不降级至不支持图像的模型']]) + `${select('可用执行区域', 'adm-model-region', [['cn', '中国区 · CN-A / CN-B'], ['cn-a', '仅中国区 CN-A']], A.config.region)}${B('保存路由约束', 'model-save', '', 'primary')}<p class="muted">路由失败时保留任务与已有产物；未满足能力或地域要求时停止派发。</p>`);
    if (t === 'sandbox') body = `<div class="grid-2">${panel('代码环境', `<dl class="admin-details"><div><dt>固定环境</dt><dd>Python 3.12 · pandas 2.2 · NumPy 2.1</dd></div><div><dt>隔离资源</dt><dd>512 MB 内存 / 单任务临时目录</dd></div><div><dt>持久化</dt><dd>仅声明的结果与分析包</dd></div></dl>${field('单次执行超时（秒）', 'adm-timeout', A.config.timeout, 'number', 'min="10" max="600"')}${B('保存环境限制', 'sandbox-save', '', 'primary')}`)}${panel('数据与网络边界', `<p>默认关闭互联网访问，仅可读取任务授权的数据引用。</p>${badge('外网访问：关闭')}${badge('依赖安装：固定白名单')}<p class="muted">超时、内存超限和缺失依赖分别产生明确错误；失败执行可以从检查点重试。</p>${B('模拟沙箱校验', 'sandbox-check')}`)}</div>`;
    if (t === 'hitl') body = panel('人机协同规则', C.table(['决定对象', '默认规则', '绑定范围', '处理'], [['常规已授权查询', '自动执行', '身份 / 数据 / 预算', badge('无需重复审批', 'success')], ['计划与重大资源取舍', '计划对齐', '分析目标 / 方法 / 预算', B('查看请求模板', 'hitl-detail', 'data-type="计划对齐"')], ['外部发布与导出', A.policies.export, '产物版本 / 受众 / 有效期', B('配置规则', 'policy-edit')], ['领域方法争议', A.reviewEscalated ? '已升级至财务负责人' : '交给领域负责人', '方法与结果；不追加数据权限', B('模拟升级', 'review-escalate')], ['禁止访问的数据', '强制拒绝', '当前有效权限', badge('审批不能绕过', 'danger')]])) + notice('业务澄清、计划对齐、执行授权、结果采纳、发布授权分别记录。一个决定只作用于绑定的对象与范围。');
    return head('AGENT CAPABILITIES · AD-11–18', '配置可靠的分析能力', '主 Agent、工具、Skill、模型与执行环境共同形成可发布的能力组合。', B('进入质量门禁', 'goto', 'data-route="quality"', 'primary')) + tabs('capabilities', [['agent', '主 Agent'], ['tools', '工具策略'], ['skills', 'Skill 与流程'], ['models', '模型路由'], ['sandbox', '代码环境'], ['hitl', '协同策略']]) + body;
  }

  function runs() {
    const t = active('runs', 'tasks');
    let body = '';
    if (t === 'tasks') body = panel('工作区运行', C.table(['任务', '负责人', '状态 / 进度', '累计成本', '操作'], A.runs.map(r => [`<strong>${E(r.title)}</strong><div class="muted">${r.id} · ${E(r.checkpoint)}</div>`, E(r.owner), `${badge(r.status)}<div class="admin-progress" aria-label="进度 ${r.progress}%"><span style="width:${r.progress}%"></span></div>`, `¥ ${r.cost.toFixed(2)}`, B('详情', 'run-detail', `data-id="${r.id}"`) + (r.status === '运行中' ? B('暂停', 'run-state', `data-id="${r.id}" data-state="已暂停"`) + B('取消', 'run-cancel', `data-id="${r.id}"`, 'danger') : r.status === '已暂停' || r.status === '失败' ? B('从检查点恢复', 'run-resume', `data-id="${r.id}"`) : r.status === '等待授权' ? B('处理授权', 'run-approve', `data-id="${r.id}"`) : '')]))) + notice('运行状态持久保存在本地演示中。取消会停止新增动作，已有产物和已发生外部动作的回执仍保留。');
    if (t === 'queue') body = `<div class="grid-2">${panel('并发与公平调度', `${field('工作区最大并发任务', 'adm-concurrency', A.concurrency, 'number', 'min="1" max="32"')}${B('更新并发限额', 'concurrency-save', '', 'primary')}<p class="muted">单用户最多 2 个活跃任务；长任务和交互任务使用独立队列。</p>`)}${panel('队列情况', C.table(['队列', '执行中', '等待', '策略'], [['交互问数', '2', '0', '优先响应 · 上限 4'], ['深度分析', '1', '2', '按用户公平排队'], ['定时任务', '1', '1', '按计划时间排序']]))}</div>`;
    if (t === 'budget') body = `<div class="stat-grid">${stat('¥ 128.40', '本月已用', '模型 + 查询 + 沙箱')}${stat('¥ ' + A.budget, '月度硬限额', '达到限额停止派发')}${stat('¥ 1.82', '平均任务成本', '最近 7 天')}</div><div class="grid-2">${panel('预算与告警', `${field('每月预算（元）', 'adm-budget', A.budget, 'number', 'min="1" max="100000"')}${field('预警阈值（%）', 'adm-budget-alert', A.alertThreshold, 'number', 'min="1" max="100"')}${B('保存预算', 'budget-save', '', 'primary')}<p class="muted">所有执行分支合并计费，包含模型、数据库扫描、代码运行和外部服务。</p>`)}${panel('成本归属', C.table(['成本中心', '模型', '查询 / 沙箱', '合计'], [['电商经营部', '¥ 42.80', '¥ 18.60', '¥ 61.40'], ['供应链管理部', '¥ 28.10', '¥ 12.90', '¥ 41.00'], ['经营管理部', '¥ 18.20', '¥ 7.80', '¥ 26.00']]))}</div>`;
    if (t === 'schedules') body = panel('定时任务与投递', `<div class="list-row"><div><h3>每日经营简报</h3><p class="muted">每天 ${A.scheduleTime} · Asia/Shanghai · 数据窗口：前一自然日</p></div>${badge(A.scheduleEnabled ? '已启用' : '已暂停')}${B(A.scheduleEnabled ? '暂停计划' : '启用计划', 'schedule-toggle')}${B('编辑计划', 'schedule-edit')}</div>` + C.table(['运行', '分析执行', '产物生成', '结果投递', '负责人'], [['2026-10-20', badge('成功'), '经营日报 V18', badge(A.lastDelivery), E(A.scheduleOwner)], ['2026-10-19', badge('成功'), '经营日报 V17', badge('成功'), E(A.scheduleOwner)]]) + `<div class="toolbar">${B('模拟投递失败', 'delivery-fail')}${A.lastDelivery === '失败' ? B('核实回执后重试投递', 'delivery-retry', '', 'primary') : ''}</div><p class="muted">持续授权：经营管理组 / 内部链接 / 每次预算 ¥ 10 / 2026-12-31 到期。数据未就绪时等待，不发送空报告。</p>`);
    if (t === 'triggers') body = panel('条件触发与自动调查', `<div class="list-row"><div><h3>净收入异常巡检</h3><p class="muted">相同门店、渠道、事件窗口最多触发一次。</p></div>${badge(A.triggerEnabled ? '监控开启' : '监控暂停')}${B(A.triggerEnabled ? '暂停监控' : '开启监控', 'trigger-toggle')}</div>${field('同比下降触发阈值（%）', 'adm-trigger-threshold', A.triggerThreshold, 'number', 'min="1" max="80"')}<div class="toolbar">${B('保存阈值', 'trigger-save')}${B('模拟一次异常事件', 'trigger-test', '', 'primary')}</div>` + C.table(['事件', '调查状态', '去重键', '结果'], [['华东 / 跑鞋 / 2026-10-19', '已创建 RUN-2048', 'east-running-20261019', `累计收到 ${A.triggerCount} 次；仅创建 1 个调查任务`]]) + notice('自动调查沿用责任人的数据范围与预算。分析完成与消息投递分别记账，负责人失效后暂停调度。'));
    return head('RUNTIME & SCHEDULING · AD-19–22 / 36–38', '让运行可控，让任务可续', '观察任务、保护预算、管理周期与事件触发，恢复时复用已有结果与动作回执。', B('查看执行追踪', 'goto', 'data-route="security" data-tab="traces"')) + tabs('runs', [['tasks', '运行任务'], ['queue', '配额与队列'], ['budget', '预算与成本'], ['schedules', '定时与投递'], ['triggers', '主动监控']]) + body;
  }

  function quality() {
    const t = active('quality', 'evaluations');
    let body = '';
    if (t === 'evaluations') {
      const result = A.eval;
      body = panel('能力组合的质量门禁', `<div class="toolbar">${badge('候选 v' + A.candidate + ' · 修订 ' + A.revision)}${result ? badge(result.rows.filter(r => r.pass).length + ' / 6 通过' + (result.passed ? '' : ' · 发布受阻'), result.passed ? 'success' : 'danger') : badge('尚未评测', 'warning')}</div><p>独立检查结果、方法、证据、回答、授权行为和运行性能。授权边界失败是强制阻断项。</p>${select('演示评测样本', 'adm-eval-fixture', [['baseline', '边界缺陷样本 · 预期出现授权失败'], ['fixed', '已修正样本 · 验证撤权后的结果阻断']], A.evalFixture)}${B('运行评测', 'eval-run', '', 'primary')}` + (result ? C.table(['检查层', '样例 / 结果', '门槛', '状态'], result.rows.map(r => [r.name, r.result, r.threshold, badge(r.pass ? '通过' : '未通过')])) + `<p class="muted">评测记录 EVAL-${result.id} · 绑定候选修订 ${result.revision}。切换样本用于演示门禁分支，不代表生产质量证明。</p>` : '<div class="empty"><h3>候选版本等待检验</h3><p>运行一次评测，检查各层结果与发布阻断原因。</p></div>'));
    }
    if (t === 'datasets') body = panel('评测集', C.table(['评测集', '案例数', '覆盖', '维护方式', '操作'], [['经营分析基础集', '48', '问数 / 对账 / 异动 / 边界', '人工校准答案与方法', B('查看样例', 'eval-sample')], ['授权与隔离对抗集', '24', '撤权 / 跨租户 / 导出 / 注入', '每次发布强制运行', B('查看样例', 'eval-sample')], ['统计方法场景集', '18', '预测 / 实验 / 观察性因果', '启用场景时必测', B('查看样例', 'eval-sample')]])) + notice('评测答案不进入运行时示例检索，测试集与生产输入分别管理。');
    if (t === 'releases') body = `<div class="grid-2">${panel('发布候选组合', `<div class="admin-version"><span class="eyebrow">CANDIDATE</span><strong>v${A.candidate}</strong></div><dl class="admin-details"><div><dt>主 Agent / 配置</dt><dd>经营分析 Agent / 修订 ${A.revision}</dd></div><div><dt>工具 / Skill</dt><dd>${A.config.tools.length} 个核心工具 / ${A.skillInstalled ? '含实验评估候选' : '6 个稳定 Skill'}</dd></div><div><dt>语义</dt><dd>行野经营口径 v${A.metricVersion}</dd></div><div><dt>模型与地域</dt><dd>分析路由 ${A.config.mode} / ${A.config.region.toUpperCase()}</dd></div><div><dt>评测</dt><dd>${A.eval ? badge(A.eval.passed && A.eval.revision === A.revision ? '有效评测通过' : '未达到发布门禁') : badge('未运行')}</dd></div></dl>${B('发布候选组合', 'publish', '', 'primary')}<p class="muted">发布前复核组合差异和评测。修改配置后需要重新评测。</p>`)}${panel('发布历史', C.table(['版本', '时间 / 记录', '操作'], A.releases.map((r, i) => [`<strong>v${r.version}</strong> ${i === 0 ? badge('当前') : ''}`, `${r.date}<div class="muted">${E(r.note)}</div>`, i ? B('回滚至此版本', 'rollback', `data-version="${r.version}"`) : badge('生产使用', 'success')])) + '<p class="muted">回滚只改变后续任务的能力组合，不重放已完成的外部动作。当前权限持续有效。</p>')}</div>`;
    if (t === 'experiments') body = panel('受控实验与改进建议', `<div class="list-row"><div><h3>查询规划提示优化</h3><p class="muted">仅 10% 的内部测试请求 · 不涉及真实外部发布</p></div>${badge(A.experiment ? '实验运行中' : '待启动')}${B(A.experiment ? '结束实验' : '启动灰度实验', 'experiment-toggle', '', 'primary')}</div>` + C.table(['指标', '基线', '实验组', '判断'], [['结果正确率', '96.2%', '97.1%', '继续积累样本'], ['证据完整性', '94.0%', '96.5%', '方向改善'], ['平均成本', '¥ 1.92', '¥ 1.74', '下降 9.4%'], ['授权失败数', '0', '0', '必须保持为 0']]) + notice('改进建议需独立验证与发布。一次实验结果不会自动改写生产配置或组织记忆。'));
    return head('QUALITY & RELEASE · AD-25–29', '先验证，再让改变生效', '管理测试集、分层评估、完整组合发布与受控实验，保留每一次决策的证据。', B('查看发布历史', 'goto', 'data-route="quality" data-tab="releases"')) + tabs('quality', [['evaluations', '质量门禁'], ['datasets', '评测集'], ['releases', '组合发布'], ['experiments', '受控实验']]) + body;
  }

  function security() {
    const t = active('security', 'traces');
    let body = '';
    if (t === 'traces') body = panel('RUN-2048 · 执行追踪', `<div class="toolbar">${badge('调用身份：陈岚')}${badge('授权范围：华东 / 天猫')}${badge('组合 v' + A.production)}</div>` + C.table(['时间', '步骤 / 事件', '成本 / 结果', '证据'], [['09:12:01', '任务契约建立', '净收入 / 本周与上周 / 日粒度', B('查看契约', 'trace-detail', 'data-step="任务契约"')], ['09:12:03', '受控 SQL 查询', '124 行 · 完整集 · ¥ 0.06', B('查看查询', 'query-detail')], ['09:12:08', 'Skill 收入贡献分解 v2.3', '数据断言全部通过', B('查看证据', 'trace-detail', 'data-step="贡献分解"')], ['09:12:12', '独立库存调查分支', '权限校验通过 · 已派发', B('执行边界', 'trace-detail', 'data-step="库存调查"')], ['09:12:18', '生成图表 CH-821', '图表 → 结果 DS-308 → 查询 Q-612', B('沿证据查看', 'trace-detail', 'data-step="图表血缘"')]])) + notice('可查看步骤、工具参数摘要、结果引用与事件。不显示隐藏推理过程；敏感载荷独立授权。');
    if (t === 'audit') body = panel('审计事件与敏感载荷', `<div class="toolbar">${badge(A.auditUnmasked ? '已授予临时敏感查看 · 本次页面' : '敏感字段已脱敏', A.auditUnmasked ? 'warning' : 'success')}${B(A.auditUnmasked ? '恢复脱敏' : '申请临时查看', 'audit-reveal')}${B('导出脱敏审计摘要', 'audit-export')}</div>` + C.table(['事件', '操作者', '对象 / 参数', '结果'], [['09:12 · 数据查询', '陈岚 / analyst', A.auditUnmasked ? '会员：DEMO-13800000001（合成）' : '会员：DEMO-138****0001', badge('允许')], ['08:59 · 跨租户检索', '服务身份 svc-analysis', 'tenant = coast-demo', badge('已拒绝', 'danger')], ['08:42 · 发布授权', '李然 / manager', '报告 V3 → 经营管理组', badge('待决定')], ['08:10 · 角色变更', '林予 / admin', '业务分析师 → 可查看资产', badge('已记录')]]) + `<p class="muted">载荷查看与运行诊断权限分开。临时查看需填写理由；导出的文件保持脱敏。</p>`);
    if (t === 'policies') body = `<div class="grid-2">${panel('安全与保留策略', `${field('审计保留天数', 'adm-retention', A.retention, 'number', 'min="30" max="3650"')}${B('保存保留策略', 'retention-save', '', 'primary')}<dl class="admin-details"><div><dt>下载与缓存</dt><dd>每次访问重新校验当前权限</dd></div><div><dt>撤权传播</dt><dd>停止新动作；迟到结果重新校验</dd></div><div><dt>不可信材料</dt><dd>材料中的指令不扩大系统授权</dd></div></dl>`)}${panel('动作授权规则', C.table(['动作', '规则'], [['范围内常规读取', A.policies.read], ['导出 / 内部发布', A.policies.export], ['公共链接发布', A.policies.external]]) + B('编辑规则', 'policy-edit'))}</div>`;
    if (t === 'alerts') body = panel('运营质量与通知', `<div class="list-row"><div><h3>运行健康订阅</h3><p class="muted">接收任务失败率、预算、排队时间与数据新鲜度异常。</p></div>${badge(A.notification ? '订阅开启' : '订阅暂停')}${B(A.notification ? '暂停订阅' : '开启订阅', 'notification-toggle')}</div>` + C.table(['规则', '阈值', '当前', '通知对象'], [['任务失败率', '> 5% / 30 分钟', '1.4%', '运行维护组'], ['交互排队时间', '> 30 秒', '4 秒', '运行维护组'], ['预算消耗', `> ${A.alertThreshold}%`, `${Math.round(128.4 / A.budget * 100)}%`, '成本负责人'], ['数据新鲜度', '> 2 小时', A.qualityResolved ? '12 分钟' : '6 小时', '数据维护组']])) + notice('通知内容使用脱敏摘要，不把运行日志中的敏感内容直接发送到群组。');
    return head('SECURITY & AUDIT · AD-16–18 / 23–25', '沿着证据，定位每个决定', '将运行诊断、敏感内容查看和审计操作分开授权，保留可核验的事件记录。', B('查看权限配置', 'goto', 'data-route="organization" data-tab="roles"')) + tabs('security', [['traces', '执行追踪'], ['audit', '审计日志'], ['policies', '安全策略'], ['alerts', '健康与预警']]) + body;
  }

  function memory() {
    const t = active('memory', 'memories');
    let body = '';
    if (t === 'memories') body = panel('有来源、有范围的记忆', C.table(['记忆内容', '作用域 / 来源', '状态', '到期', '操作'], A.memories.map(m => [`<strong>${E(m.text)}</strong><div class="muted">${m.id} · ${m.type}</div>`, `${E(m.scope)}<div class="muted">${E(m.source)}</div>`, badge(m.status), m.expiry, m.status === '待提升' ? B('审核共享提升', 'memory-promote', `data-id="${m.id}"`) : m.status === '冲突' ? B('处理冲突', 'memory-conflict', `data-id="${m.id}"`) : m.status === '已撤销' || m.status === '已删除' ? badge('不再召回') : B('撤销', 'memory-revoke', `data-id="${m.id}"`)]))) + notice('个人偏好、业务语义和权限分别治理。记忆无法授予数据访问权，也不能覆盖正式指标定义。');
    if (t === 'artifacts') body = panel('分析产物与传播控制', C.table(['产物', '计算 / 验证', '采纳 / 发布', '数据新鲜度', '操作'], [['10 月经营复盘 · V3', '完成 / 通过', A.artifactArchived ? '已采纳 / 已归档' : '已采纳 / 已发布', '2026-10-20 08:00', B('传播范围', 'artifact-share') + B(A.artifactArchived ? '恢复归档' : '归档产物', 'artifact-archive')], ['华东跑鞋诊断 · V2', '部分完成 / 部分通过', '待采纳 / 草稿', A.qualityResolved ? '可发起重算' : '上游延迟', B('查看血缘', 'artifact-lineage')], ['R100 规格数据集 · V1', '完成 / 通过', '未采纳 / 内部', '2026-10-19 快照', B('权限检查', 'artifact-permission')]])) + notice('查看、编辑、重算、导出和分享独立授权。动态看板按访问者权限查询；静态报告检查实际内容和受众。');
    if (t === 'templates') body = panel('模板与资产复用', `<div class="list-row"><div><h3>周度经营复盘模板</h3><p class="muted">版本 1.3 · 经营指标 / 异动诊断 / 行动清单 / 限制与证据</p></div>${badge(A.templateEnabled ? '可复用' : '已停用')}${B(A.templateEnabled ? '停用模板' : '启用模板', 'template-toggle')}</div>` + C.table(['复用对象', '需要保留', '重新验证'], [['报告结构', '版式、章节、图表配置', '当前内容与受众权限'], ['可执行分析包', 'SQL、Python、依赖、断言', '数据权限、口径版本与参数'], ['监控规则', '目标、阈值、去重逻辑', '持续授权、责任人和预算']]) + B('预览复用检查', 'template-check'));
    return head('MEMORY & ARTIFACTS · AD-30–35', '沉淀经验，也保留边界', '审查记忆来源、处理冲突与到期，管理产物版本、传播范围和可复用模板。', B('查看分析资产', 'goto', 'data-route="assets"')) + tabs('memory', [['memories', '记忆治理'], ['artifacts', '产物与传播'], ['templates', '模板复用']]) + body;
  }

  function organization() {
    const t = active('organization', 'members');
    let body = '';
    if (t === 'members') body = panel('成员与生命周期', `<div class="toolbar">${B('添加成员', 'member-add', '', 'primary')}${B('同步人员生命周期', 'lifecycle-sync')}<span class="muted">最后同步：${A.lifecycle}</span></div>` + C.table(['成员', '部门', '角色', '状态', '操作'], A.members.map((m, i) => [`<strong>${E(m.name)}</strong><div class="muted">${E(m.email)}</div>`, E(m.department), roles[m.role], badge(m.status), B('编辑', 'member-edit', `data-index="${i}"`) + B(m.status === '已停用' ? '启用' : '停用', 'member-toggle', `data-index="${i}"`)]))) + notice('停用身份后，相关新动作停止派发，待投递任务暂停。系统不会替换成管理员身份继续执行。');
    if (t === 'roles') {
      const role = A.roleEditing;
      const granted = C.state.grants?.[role] || [];
      body = `<div class="grid-2">${panel('角色模板与功能权限', `${select('选择角色', 'adm-role-editing', Object.entries(roles), role)}${B('载入角色', 'role-load')}<p class="muted">岗位用于组织分工，角色组合决定功能权限；数据范围在独立策略中配置。</p><form id="adm-permission-form" class="admin-permission-grid">${Object.entries(caps).map(([key, name]) => `<label class="admin-check"><input type="checkbox" name="cap" value="${key}" ${granted.includes(key) ? 'checked' : ''}><span>${name}</span></label>`).join('')}</form>${B('保存功能权限', 'role-save', '', 'primary')}`)}${panel('当前授权预览', `<h3>${roles[role]}</h3><div class="admin-tags">${granted.map(g => badge(caps[g] || g)).join(' ') || '<span class="muted">未授予功能访问</span>'}</div><p>保存后立即影响侧栏和路由权限。切换右上角演示角色可验证菜单变化。</p><dl class="admin-details"><div><dt>数据策略</dt><dd>${role === 'admin' ? '仅元数据管理；业务明细仍需授权' : role === 'executive' ? '中国区汇总 / 客户字段脱敏' : '按用户的品牌、区域和渠道授权'}</dd></div><div><dt>默认拒绝</dt><dd>未授权的页面、操作和数据均不可访问</dd></div><div><dt>权限变化</dt><dd>当前规则覆盖历史任务记录的旧授权</dd></div></dl>`)}</div>`;
    }
    if (t === 'identity') body = `<div class="grid-2">${panel('企业登录', `<div class="list-row"><div><h3>行野企业身份源</h3><p class="muted">OIDC · SSO / SCIM 目录同步</p></div>${badge(A.sso ? '已启用' : '维护暂停')}</div><dl class="admin-details"><div><dt>组织域</dt><dd>xingye.example</dd></div><div><dt>身份有效性</dt><dd>每次执行前复核账号状态</dd></div><div><dt>同步范围</dt><dd>成员、组、角色与停用事件</dd></div></dl>${B(A.sso ? '暂停登录连接' : '恢复登录连接', 'sso-toggle')}`)}${panel('服务身份与委托', `<h3>经营分析服务</h3>${badge(A.serviceActive ? '有效' : '已停用')}<p>可运行固定日报。授权范围：中国区汇总；受众：经营管理组；有效至 2026-12-31。</p><p class="muted">委托链记录发起者、执行身份、具体数据范围与批准。服务身份不能借用管理员权限。</p>${B(A.serviceActive ? '停用服务身份' : '启用服务身份', 'service-toggle')}`)}</div>`;
    if (t === 'workspaces') body = panel('租户与工作区隔离', C.table(['租户 / 工作区', '数据边界', '当前状态', '操作'], [['行野运动集团 / 中国经营分析', '7 大区 / 240 门店 / 8 配送中心', badge('当前工作区', 'success'), B('查看隔离规则', 'tenant-detail')], ['海岸器材（演示租户）', '独立商品、客户、门店与文件', badge('无访问权限'), B('模拟隔离校验', 'tenant-check')], ['山岚户外（演示租户）', '独立经营参数与语义目录', badge('无访问权限'), B('模拟隔离校验', 'tenant-check')]])) + notice('一个租户对应一家独立企业。品牌、区域、渠道与门店属于企业内部经营维度。搜索、缓存、下载与日志都执行租户边界检查。');
    return head('ORGANIZATION · AD-01–05', '让每个人拥有恰当的工作空间', '在同一个 Web 系统中组合岗位、角色、功能权限与数据范围，统一管理账号生命周期。') + tabs('organization', [['members', '成员与组'], ['roles', '角色与权限'], ['identity', '企业身份'], ['workspaces', '租户与工作区']]) + body;
  }

  // Data connections, semantics and quality.
  let testedConnection = '';
  action('source-new', () => {
    testedConnection = '';
    C.modal('添加数据连接', `${notice('演示连接只验证表单，不访问网络。请使用演示地址；密码不会保存。')}${field('连接名称', 'adm-source-name', '', 'text', 'placeholder="例如：电商订单数仓"')}${select('连接类型', 'adm-source-kind', [['PostgreSQL', 'PostgreSQL'], ['MySQL', 'MySQL'], ['S3', '对象存储 S3']], 'PostgreSQL')}${field('主机地址', 'adm-source-host', 'demo.xingye.internal')}${field('可访问数据范围', 'adm-source-scope', '华东区域 / 只读')}${field('访问凭证', 'adm-source-secret', '', 'password', 'autocomplete="off" placeholder="输入任意演示凭证，至少 6 位"')}${errors}<p id="adm-connection-result" class="muted" role="status">保存前请先测试连接。</p>`, B('取消', 'close') + B('测试连接', 'source-test') + B('保存连接', 'source-save', '', 'primary'));
  }, 'data');
  const sourceFingerprint = () => ['name', 'kind', 'host', 'scope', 'secret'].map(k => value('adm-source-' + k)).join('|');
  function validateSource() {
    if (!value('adm-source-name')) return '请填写连接名称。';
    if (!/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/i.test(value('adm-source-host'))) return '请填写有效主机地址，例如 demo.xingye.internal。';
    if (!value('adm-source-scope')) return '请明确可访问的数据范围。';
    if (value('adm-source-secret').length < 6) return '演示凭证至少需要 6 个字符。';
    return '';
  }
  action('source-test', () => {
    const err = validateSource();
    if (err) { error(err); return; }
    const failed = /fail|invalid/.test(value('adm-source-host'));
    testedConnection = failed ? '' : sourceFingerprint();
    document.getElementById('adm-form-error').hidden = true;
    document.getElementById('adm-connection-result').textContent = failed ? '模拟测试失败：主机不可达。请更换演示地址后重试。' : '模拟测试成功：只读连接可用，发现 12 张表；凭证不会保存。';
  }, 'data');
  action('source-save', () => {
    const err = validateSource();
    if (err) { error(err); return; }
    if (testedConnection !== sourceFingerprint()) { error('连接信息尚未测试，或测试后发生变更。请重新测试。'); return; }
    A.sources.push({ id: 'src-' + Date.now().toString().slice(-6), name: value('adm-source-name'), kind: value('adm-source-kind'), host: value('adm-source-host'), scope: value('adm-source-scope'), tables: 12, status: '已连接', sync: '刚刚 · 演示同步' });
    A.tabs.data = 'sources'; finish('新数据源已保存，演示元数据已同步。');
  }, 'data');
  action('source-detail', el => {
    const s = A.sources.find(s => s.id === el.dataset.id); if (!s) return;
    detail(s.name, [['连接类型', E(s.kind)], ['主机', E(s.host)], ['授权范围', E(s.scope)], ['表数量', s.tables], ['凭证', '密钥服务托管；界面不回显'], ['连接状态', badge(s.status)]], notice('连接权限与发起用户的数据授权共同决定实际可查询范围。'));
  }, 'data');
  action('source-sync', el => { const s = A.sources.find(s => s.id === el.dataset.id); if (!s) return; s.sync = '刚刚 · 演示同步'; s.status = '已连接'; commit(s.name + ' 元数据同步完成，历史版本已保留。'); }, 'data');
  action('schema-sync', () => { A.schemaAccepted = false; commit('元数据同步完成：检测到 fact_inventory.available_qty 新增字段。'); }, 'data');
  action('schema-detail', el => detail(el.dataset.name, [['主键', 'order_item_id / sku_id / snapshot_date'], ['业务字段', 'paid_amount, refund_amount, region, channel'], ['敏感标记', 'member_id：访问受限 / 默认脱敏'], ['血缘', '来源快照 → 受控查询 → 派生数据集 → 分析产物'], ['可见范围', '当前角色已授权的数据目录']]), 'data');
  action('schema-diff', () => C.modal('库存 schema 变更影响', '<p><strong>新增：</strong><code>available_qty integer</code>，表示扣减预留量后的可售库存。</p><p>影响：库存诊断 Skill 1.3、18 个派生产物。原字段 stock_qty 保留，旧查询继续可追溯。</p><p class="muted">确认后标记新 schema 可用；历史结果保持原版本引用。</p>', footer('确认变更', 'schema-accept')), 'data');
  action('schema-accept', () => { A.schemaAccepted = true; finish('schema 变化已确认，受影响资产已登记。'); }, 'data');
  action('metric-edit', () => C.modal('创建净收入口径新版本', `${field('变更说明', 'adm-metric-note', A.metricDraft || '补充退款状态的取值映射')}${field('业务负责人', 'adm-metric-owner', '许宁')}${notice('新版本沿用净收入公式，记录本次口径说明修订；历史产物继续引用原版本。')}${errors}`, footer('保存草稿', 'metric-save')), 'data');
  action('metric-save', () => { if (value('adm-metric-note').length < 4 || !value('adm-metric-owner')) { error('请填写至少 4 字的变更说明和业务负责人。'); return; } A.metricDraft = value('adm-metric-note'); finish('指标草稿已保存，尚未影响生产口径。'); }, 'data');
  action('metric-publish', () => { if (!A.metricDraft) return; A.metricVersion = '2.' + (Number(A.metricVersion.split('.')[1]) + 1); A.metricDraft = ''; A.revision++; A.eval = null; commit('净收入口径 v' + A.metricVersion + ' 已发布；能力组合需重新评测。'); }, 'data');
  action('query-detail', () => detail('可信查询 QS-018 · 净收入', [['口径', '实付金额减去已确认退款，按原订单支付日期归属'], ['结果范围', '2026-10-12 至 2026-10-18；华东；天猫'], ['验证', '主键唯一、退款先聚合、金额与财务台账一致'], ['版本', '查询 1.4 / 语义 2.1 / 数据快照 2026-10-20 08:00']], '<pre class="admin-code">WITH refunds AS (\n  SELECT order_item_id, SUM(refund_amount) AS amount\n  FROM fact_returns WHERE status = \'confirmed\'\n  GROUP BY order_item_id\n)\nSELECT SUM(o.paid_amount - COALESCE(r.amount, 0))\nFROM authorized_order_items o\nLEFT JOIN refunds r USING (order_item_id);</pre>'));
  action('query-trust', () => { A.trusted = !A.trusted; commit(A.trusted ? '查询通过演示复核，已加入运行时可信示例。' : '已撤销查询的运行时信任，保留评审记录。'); }, 'data');
  action('quality-resolve', () => { A.qualityResolved = !A.qualityResolved; commit(A.qualityResolved ? '库存新鲜度复查通过：12 分钟。受影响产物可发起重算。' : '演示质量事件已重新打开。'); }, 'data');

  // Agent capability configuration.
  const invalidate = message => { A.revision++; A.eval = null; commit(message + ' · 候选修订 ' + A.revision); };
  action('config-save', () => { const steps = Number(value('adm-max-steps')); if (!Number.isInteger(steps) || steps < 5 || steps > 100) { C.toast('最大步骤请输入 5–100 的整数。'); return; } A.config.mode = value('adm-agent-mode'); A.config.maxSteps = steps; invalidate('主 Agent 候选配置已保存，生产版本保持 v' + A.production); }, 'capabilities');
  action('tool-config', el => { const tool = el.dataset.tool; C.modal('工具策略 · ' + ({ query: 'SQL 查询', python: 'Python 沙箱', files: '文件处理' }[tool]), `<p>当前状态：${badge(A.config.tools.includes(tool) ? '启用' : '禁用')}</p><p>执行身份继承发起者。数据范围、资源预算与副作用策略由统一运行时复核。</p>${notice('变更只进入候选组合。禁用后该工具无法被主 Agent 或子 Agent 调用。')}`, footer(A.config.tools.includes(tool) ? '禁用候选工具' : '启用候选工具', 'tool-toggle', `data-tool="${tool}"`)); }, 'capabilities');
  action('tool-toggle', el => { const tool = el.dataset.tool; A.config.tools = A.config.tools.includes(tool) ? A.config.tools.filter(t => t !== tool) : [...A.config.tools, tool]; C.closeModal(); invalidate('候选工具策略已更新'); }, 'capabilities');
  action('tool-contract', () => detail('外部动作契约', [['输入', '产物 ID + 精确版本 + 受众 + 动作参数'], ['身份', '批准人 / 发起人 / 执行身份分别记录'], ['前置', '版本与内容预览已就绪；授权未过期且范围匹配'], ['输出', '动作 ID / 目标 / 时间 / 实际回执 / 幂等键'], ['未知结果', '先查询回执，再决定是否重试']]), 'capabilities');
  action('skill-detail', el => detail(el.dataset.skill, [['适用条件', el.dataset.skill.includes('复购') ? '完整首购队列；有 30 日观察窗口；按会员去重' : '已授权经营数据；明确口径、粒度与比较基线'], ['输入', '时间窗口、品牌 / 区域 / 渠道、数据引用'], ['工具依赖', '只读 SQL、隔离计算、图表生成'], ['验证', '唯一性、覆盖、成熟度、方法前提与数值一致性'], ['产物', '方法说明、派生数据集、可复算分析包、证据'], ['权限', '安装后仍需当前身份的独立数据授权']]), 'capabilities');
  action('skill-install', () => { A.skillInstalled = !A.skillInstalled; invalidate(A.skillInstalled ? '实验评估 Skill 已安装到候选组合；未授予新增权限' : '实验评估 Skill 已从候选组合移除'); }, 'capabilities');
  action('model-save', () => { A.config.region = value('adm-model-region'); invalidate('模型路由与地域约束已保存'); }, 'capabilities');
  action('sandbox-save', () => { const n = Number(value('adm-timeout')); if (!Number.isInteger(n) || n < 10 || n > 600) { C.toast('超时请输入 10–600 秒的整数。'); return; } A.config.timeout = n; invalidate('沙箱超时上限已更新'); }, 'capabilities');
  action('sandbox-check', () => detail('沙箱策略校验', [['网络请求', badge('已阻止', 'success') + ' 外网访问不在白名单'], ['越界文件读取', badge('已阻止', 'success') + ' 仅可访问任务目录'], ['查询结果计算', badge('通过', 'success') + ' 已授权数据引用'], ['超时处理', A.config.timeout + ' 秒后中止本次计算并保存错误事件']], notice('此处为可见的模拟检查结果，未运行真实代码。')), 'capabilities');
  action('hitl-detail', el => detail(el.dataset.type + '请求模板', [['请求原因', '增加库存调查分支，预计增加 3 分钟与 ¥ 2 成本'], ['已完成', '渠道拆解与时间趋势已验证，可独立交付'], ['选项', '接受扩展 / 仅继续现有范围 / 修改预算'], ['决定对象', '任务 T-1026 · 计划修订 3'], ['有效期', '本任务本次运行；权限变化时重新判断']]), 'capabilities');
  action('review-escalate', () => { A.reviewEscalated = !A.reviewEscalated; commit(A.reviewEscalated ? '口径复核已升级至财务负责人；原数据权限保持有效边界。' : '已结束演示升级，恢复领域负责人复核。'); }, 'capabilities');

  // Runtime control, recovery, budgets, schedules and trigger deduplication.
  action('run-detail', el => { const r = A.runs.find(r => r.id === el.dataset.id); if (!r) return; detail(r.title, [['运行 ID', r.id], ['状态', badge(r.status)], ['执行身份', E(r.owner)], ['检查点', E(r.checkpoint)], ['成本', '¥ ' + r.cost.toFixed(2)], ['恢复规则', '重验当前权限；复用已验证结果；查询外部动作回执'], ['产物保留', '失败或取消不删除已完成产物']]); }, 'runs');
  action('run-state', el => { const r = A.runs.find(r => r.id === el.dataset.id); if (!r || r.status !== '运行中') return; r.status = '已暂停'; r.checkpoint += '；暂停点已保存'; commit(r.id + ' 已暂停；停止派发新动作。'); }, 'runs');
  action('run-cancel', el => { const r = A.runs.find(r => r.id === el.dataset.id); if (!r) return; C.modal('取消运行 ' + r.id, `<p>取消后停止剩余调查。已完成的渠道拆解和查询结果仍保留。</p><p>本次尚无外部动作。运行中可中断调用会收到取消请求，并在回执后标记实际取消。</p>`, footer('确认取消', 'run-cancel-confirm', `data-id="${r.id}"`)); }, 'runs');
  action('run-cancel-confirm', el => { const r = A.runs.find(r => r.id === el.dataset.id); if (!r) return; r.status = '已取消'; r.checkpoint += '；取消请求已确认，2 个产物保留'; finish(r.id + ' 已取消，底层模拟取消回执已确认。'); }, 'runs');
  action('run-resume', el => { const r = A.runs.find(r => r.id === el.dataset.id); if (!r) return; if (128.4 >= A.budget) { C.toast('月度硬限额已达到。更新预算后可恢复任务。'); return; } if (r.owner === '周衡' && A.members.find(m => m.name === '周衡')?.status === '已停用') { C.toast('发起者已停用，恢复被拒绝；需重新指定有权限的责任人。'); return; } r.status = '运行中'; r.checkpoint = '当前权限已复核；从最近有效检查点恢复；外部动作未重放'; if (!A.recovered.includes(r.id)) A.recovered.push(r.id); commit(r.id + ' 已恢复，已完成步骤无需重复执行。'); }, 'runs');
  action('run-approve', el => C.modal('发布授权 · 经营周报 V3', `<dl class="admin-details"><div><dt>具体对象</dt><dd>经营周报 V3 / 内容校验通过</dd></div><div><dt>受众</dt><dd>经营管理组 · 8 人</dd></div><div><dt>执行身份</dt><dd>经营分析服务</dd></div><div><dt>有效期</dt><dd>批准后 24 小时内，仅本次发布</dd></div><div><dt>内容范围</dt><dd>中国区经营汇总，不含会员明细</dd></div></dl><p class="muted">结果采纳和发布授权分别记录。此处只决定向指定受众发布此版本。</p>`, B('拒绝发布', 'run-decision', `data-id="${el.dataset.id}" data-decision="reject"`, 'danger') + B('授权本次发布', 'run-decision', `data-id="${el.dataset.id}" data-decision="approve"`, 'primary')), 'runs');
  action('run-decision', el => { const r = A.runs.find(r => r.id === el.dataset.id); if (!r || r.status !== '等待授权') return; if (el.dataset.decision === 'approve' && !C.can('publish')) { C.toast('当前角色没有发布授权权限。'); return; } r.status = el.dataset.decision === 'approve' ? '已完成' : '已拒绝'; r.progress = el.dataset.decision === 'approve' ? 100 : 82; r.checkpoint = el.dataset.decision === 'approve' ? '发布授权已绑定 V3 与经营管理组；模拟回执 DEL-2047 已保存' : '发布被拒绝；报告 V3 保留为内部草稿'; finish(r.checkpoint); }, 'runs');
  action('concurrency-save', () => { const n = Number(value('adm-concurrency')); if (!Number.isInteger(n) || n < 1 || n > 32) { C.toast('并发限额请输入 1–32 的整数。'); return; } A.concurrency = n; commit('工作区并发限额已更新为 ' + n + '，排队任务按公平策略调度。'); }, 'runs');
  action('budget-save', () => { const n = Number(value('adm-budget')); const p = Number(value('adm-budget-alert')); if (!Number.isFinite(n) || n < 1 || n > 100000 || p < 1 || p > 100) { C.toast('预算应为 1–100000 元，预警比例应为 1–100%。'); return; } A.budget = n; A.alertThreshold = p; if (n <= 128.4) A.runs.forEach(r => { if (r.status === '运行中') { r.status = '已暂停'; r.checkpoint = '达到月度硬限额；停止派发，等待预算调整'; } }); commit(n <= 128.4 ? '月度硬限额已达到，所有运行任务已暂停新动作。' : '月度预算与预警阈值已保存。'); }, 'runs');
  action('schedule-toggle', () => { if (!A.scheduleEnabled && !A.serviceActive) { C.toast('服务身份已停用，启用计划前请恢复有效执行身份。'); return; } A.scheduleEnabled = !A.scheduleEnabled; commit(A.scheduleEnabled ? '定时计划已启用，持续授权范围已复核。' : '定时计划已暂停；已生成的历史日报保持可访问。'); }, 'runs');
  action('schedule-edit', () => C.modal('编辑每日经营简报', `${field('每日运行时间', 'adm-schedule-time', A.scheduleTime, 'time')}${field('责任人 / 服务身份', 'adm-schedule-owner', A.scheduleOwner)}${field('投递受众', 'adm-schedule-recipient', A.scheduleRecipient)}<p class="muted">时区固定为 Asia/Shanghai；分析窗口为前一自然日。变更受众将重新等待发布授权。</p>${errors}`, footer('保存计划', 'schedule-save')), 'runs');
  action('schedule-save', () => { if (!value('adm-schedule-time') || !value('adm-schedule-owner') || !value('adm-schedule-recipient')) { error('请填写时间、责任人和投递受众。'); return; } const changed = A.scheduleRecipient !== value('adm-schedule-recipient'); A.scheduleTime = value('adm-schedule-time'); A.scheduleOwner = value('adm-schedule-owner'); A.scheduleRecipient = value('adm-schedule-recipient'); if (changed) A.lastDelivery = '等待新授权'; finish(changed ? '计划已更新；受众变化后等待新的发布授权。' : '定时计划已更新。'); }, 'runs');
  action('delivery-fail', () => { A.lastDelivery = '失败'; commit('模拟投递失败。分析执行与产物生成已成功，无需重算。'); }, 'runs');
  action('delivery-retry', () => { if (A.lastDelivery !== '失败') return; A.lastDelivery = '成功'; commit('已核实无成功回执，仅重试投递；DEL-1020 幂等回执已保存。'); }, 'runs');
  action('trigger-toggle', () => { A.triggerEnabled = !A.triggerEnabled; commit(A.triggerEnabled ? '净收入异常监控已开启。' : '净收入异常监控已暂停。'); }, 'runs');
  action('trigger-save', () => { const n = Number(value('adm-trigger-threshold')); if (!Number.isFinite(n) || n < 1 || n > 80) { C.toast('请输入 1–80% 的触发阈值。'); return; } A.triggerThreshold = n; commit('净收入同比下降阈值已更新为 ' + n + '%。'); }, 'runs');
  action('trigger-test', () => { if (!A.triggerEnabled) { C.toast('监控当前已暂停，事件不创建调查任务。'); return; } A.triggerCount++; commit('重复事件已匹配 east-running-20261019，复用 RUN-2048，无新增调查。'); }, 'runs');

  // Evaluations and complete version releases.
  action('eval-run', () => {
    A.evalFixture = value('adm-eval-fixture');
    const passed = A.evalFixture === 'fixed' && A.config.tools.includes('query');
    A.eval = { id: Date.now().toString().slice(-6), revision: A.revision, passed, rows: [
      { name: '结果正确性', result: A.config.tools.includes('query') ? '48 / 48 金额与口径一致' : 'SQL 工具禁用，问数案例无法交付', threshold: '100% 关键案例正确', pass: A.config.tools.includes('query') },
      { name: '方法适用性', result: '成熟队列 / 互斥贡献维度通过', threshold: '关键前提全部满足', pass: true },
      { name: '证据完整性', result: '结论均绑定查询与数据快照', threshold: '100% 关键结论可追溯', pass: true },
      { name: '最终回答', result: '范围、单位、限制完整', threshold: '无无证据断言', pass: true },
      { name: '授权行为', result: A.evalFixture === 'fixed' ? '撤权后迟到结果已阻断' : '撤权后迟到结果仍被读取', threshold: '越权次数 = 0', pass: A.evalFixture === 'fixed' },
      { name: '运行性能', result: 'P95 8.4 秒 / 平均 ¥ 1.82', threshold: 'P95 < 15 秒 / ¥ 3', pass: true }
    ] };
    commit(passed ? '6 层演示评测通过，候选版本可进入发布复核。' : '质量门禁未通过，候选组合禁止发布。');
  }, 'quality');
  action('eval-sample', () => detail('评测样例 · 运行中撤权', [['准备', '用户已开始授权范围内的库存查询'], ['事件', '查询执行中撤销该用户的华东数据范围'], ['预期', '停止新动作；迟到结果不得进入回答、缓存或后续计算'], ['判定证据', '策略拒绝事件 / 无敏感输出 / 运行进入受阻状态'], ['发布门禁', '任意一次越权即阻止该组合发布']]), 'quality');
  action('publish', () => { if (!A.eval || !A.eval.passed || A.eval.revision !== A.revision) { C.modal('发布被质量门禁阻止', `<p>候选 v${A.candidate} 修订 ${A.revision} 没有有效的全通过评测。</p>${notice(A.eval ? '请先处理失败案例或配置变化，再运行完整评测。' : '请先运行候选组合评测。', 'danger')}`, B('前往质量门禁', 'goto', 'data-route="quality" data-tab="evaluations"', 'primary') + B('关闭', 'close')); return; } C.modal('发布完整能力组合', `<p>即将发布 <strong>v${A.candidate}</strong>。包含 Agent 配置修订 ${A.revision}、工具策略、Skill、模型路由与语义 v${A.metricVersion}。</p><p>6 层质量门禁全部通过。后续新任务使用此组合；运行中的任务保留已记录的版本，权限按当前规则持续复核。</p>`, footer('确认发布', 'publish-confirm')); }, 'quality');
  action('publish-confirm', () => { if (!A.eval?.passed || A.eval.revision !== A.revision) { C.toast('评测状态已变化，请重新评测。'); return; } A.production = A.candidate; A.releases.unshift({ version: A.candidate, date: '2026-10-20 · 刚刚', actor: '当前管理员', note: `组合修订 ${A.revision} / 语义 v${A.metricVersion} / 6 层评测通过` }); const parts = A.candidate.split('.'); parts[2] = String(Number(parts[2]) + 1); A.candidate = parts.join('.'); A.revision++; A.eval = null; finish('能力组合 v' + A.production + ' 已发布，候选区已创建后续修订。'); }, 'quality');
  action('rollback', el => C.modal('回滚能力组合', `<p>将后续新任务切回 <strong>v${E(el.dataset.version)}</strong>。</p><p>已完成动作不会重放。当前租户策略、撤权和硬性限制持续生效。</p>`, footer('确认回滚', 'rollback-confirm', `data-version="${el.dataset.version}"`)), 'quality');
  action('rollback-confirm', el => { const target = A.releases.find(r => r.version === el.dataset.version); if (!target) return; A.production = target.version; A.releases.unshift({ ...target, date: '2026-10-20 · 刚刚', note: '由管理员回滚；无外部动作重放' }); finish('生产组合已回滚至 v' + target.version + '。'); }, 'quality');
  action('experiment-toggle', () => { A.experiment = !A.experiment; commit(A.experiment ? '实验已启动：10% 内部流量，授权异常自动阻断。' : '实验已结束，演示结果已保留，生产组合未自动变更。'); }, 'quality');

  // Trace and audit controls.
  action('trace-detail', el => detail(el.dataset.step, [['运行', 'RUN-2048 / 计划修订 3 / 经营分析 Agent'], ['执行身份', '陈岚 → 受控查询工具 / 华东 · 天猫'], ['输入', '授权数据引用 DS-308；完整集 124 行'], ['验证', '口径 v2.1；金额、唯一性与覆盖全部通过'], ['血缘', 'CH-821 → DS-308 → Q-612 → fact_order_items@2026-10-20'], ['可复现边界', '当前保留查询、代码、参数和快照引用']]), 'security');
  action('audit-reveal', () => { if (A.auditUnmasked) { A.auditUnmasked = false; commit('敏感审计字段已恢复脱敏。'); return; } C.modal('临时查看敏感审计载荷', `${field('查看理由', 'adm-audit-reason', '', 'text', 'placeholder="例如：核对越权事件的影响范围"')}${notice('需要独立的敏感审计载荷查看权限。这里仅展示合成数据；查看行为记录到本地演示审计。')}${errors}`, footer('记录理由并查看', 'audit-confirm')); }, 'security');
  action('audit-confirm', () => { if (!C.can('audit-sensitive')) { error('当前角色仅有诊断权限，没有敏感载荷查看权限。'); return; } if (value('adm-audit-reason').length < 6) { error('请填写至少 6 字的查看理由。'); return; } A.auditUnmasked = true; finish('临时查看已记录：' + value('adm-audit-reason')); }, 'security');
  action('audit-export', () => { if (!C.can('export')) { C.toast('当前角色没有导出权限，审计查看权限不能替代导出授权。'); return; } const content = '时间,事件,身份,对象,结果\n09:12,数据查询,陈岚,DEMO-138****0001,允许\n08:59,跨租户检索,svc-analysis,coast-demo,拒绝\n'; const url = URL.createObjectURL(new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = 'compass-audit-redacted-demo.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); commit('脱敏审计摘要已下载，导出事件已记录。'); }, 'security');
  action('retention-save', () => { const n = Number(value('adm-retention')); if (!Number.isInteger(n) || n < 30 || n > 3650) { C.toast('保留天数请输入 30–3650 的整数。'); return; } A.retention = n; commit('审计保留策略已更新为 ' + n + ' 天，当前原型不会删除真实数据。'); }, 'security');
  action('policy-edit', () => { if (!C.can('security') && !C.can('capabilities')) { C.toast('当前角色没有策略管理权限。'); return; } C.modal('动作授权策略', `${select('导出与内部发布', 'adm-policy-export', [['审批', '每次检查具体授权'], ['持续授权', '匹配持续授权时自动执行']], A.policies.export)}<p>公共发布默认拒绝。常规读取在既有权限和预算内自动执行。</p>${notice('审批无法覆盖数据权限缺失或强制拒绝规则。')}`, footer('保存策略', 'policy-save')); }, null);
  action('policy-save', () => { if (!C.can('security') && !C.can('capabilities')) { C.toast('当前角色没有策略管理权限。'); return; } A.policies.export = value('adm-policy-export'); finish('动作授权策略已保存，已有授权按新规则复核。'); }, null);
  action('notification-toggle', () => { A.notification = !A.notification; commit(A.notification ? '运行健康订阅已开启。' : '运行健康订阅已暂停。'); }, 'security');

  // Memory and artifact governance.
  action('memory-promote', el => { const m = A.memories.find(m => m.id === el.dataset.id); if (!m) return; C.modal('审核记忆共享提升', `<p>${E(m.text)}</p><dl class="admin-details"><div><dt>来源</dt><dd>${E(m.source)}</dd></div><div><dt>当前范围</dt><dd>${E(m.scope)}</dd></div><div><dt>目标范围</dt><dd>中国经营工作区</dd></div><div><dt>到期</dt><dd>${m.expiry}</dd></div></dl><p>仅提升这条已确认业务上下文。个人偏好不随之共享，指标公式仍以语义目录为准。</p>`, footer('批准共享提升', 'memory-promote-confirm', `data-id="${m.id}"`)); }, 'memory');
  action('memory-promote-confirm', el => { const m = A.memories.find(m => m.id === el.dataset.id); if (!m || m.status !== '待提升') return; m.scope = '中国经营工作区'; m.status = '有效'; m.source += ' / 管理员批准共享'; finish('记忆已提升至工作区，来源与批准记录已保留。'); }, 'memory');
  action('memory-conflict', el => C.modal('记忆与正式语义存在冲突', `<p>候选记忆：净收入 = 支付金额（未扣退款）。</p><p>正式指标 v${A.metricVersion}：实付金额 − 已确认退款金额。</p>${notice('冲突记忆暂不参与召回。请撤销该记忆；如需修订业务口径，应在指标目录创建版本。', 'warning')}`, B('前往指标目录', 'goto', 'data-route="data" data-tab="metrics"') + B('撤销冲突记忆', 'memory-revoke', `data-id="${el.dataset.id}"`, 'primary')), 'memory');
  action('memory-revoke', el => { const m = A.memories.find(m => m.id === el.dataset.id); if (!m) return; m.status = '已撤销'; C.closeModal(); commit(m.id + ' 已撤销并从后续召回中移除，审计记录保留。'); }, 'memory');
  action('artifact-share', () => C.modal('经营复盘 V3 · 传播范围', `<dl class="admin-details"><div><dt>内部链接</dt><dd>${A.artifactShared ? '经营管理组 · 8 人可访问' : '链接已撤销'}</dd></div><div><dt>公开分享</dt><dd>未允许</dd></div><div><dt>导出记录</dt><dd>2 份 PDF · 已登记接收者</dd></div></dl>${notice('撤销在线链接会停止后续在线访问；已导出的文件副本无法自动收回。')}`, footer(A.artifactShared ? '撤销内部链接' : '恢复内部链接', 'artifact-share-toggle')), 'memory');
  action('artifact-share-toggle', () => { if (!C.can('publish')) { C.toast('当前角色没有发布与分享权限。'); return; } A.artifactShared = !A.artifactShared; finish(A.artifactShared ? '内部链接已恢复，访问时继续校验受众权限。' : '内部链接已撤销，已有导出副本仍保留传播记录。'); }, 'memory');
  action('artifact-archive', () => { A.artifactArchived = !A.artifactArchived; commit(A.artifactArchived ? '经营复盘 V3 已归档，历史版本与血缘保留。' : '经营复盘 V3 已恢复。'); }, 'memory');
  action('artifact-lineage', () => detail('华东跑鞋诊断 V2 · 产物血缘', [['生成', '任务 T-1026 / RUN-2048 / 步骤 5'], ['数据', '订单快照 10-20 08:00；库存快照 10-19 23:00'], ['方法', '贡献分解 Skill 2.3 / 语义 2.1'], ['验证', '订单贡献通过；库存新鲜度不足'], ['人工修改', '陈岚调整结论措辞，已记录文本差异'], ['下一步', '补齐库存快照后生成新版本，保留 V2']]), 'memory');
  action('artifact-permission', () => detail('派生数据集的独立权限', [['查看摘要', '经营分析组'], ['读取明细', '有对应区域数据授权的成员'], ['重算', '数据集创建者或拥有运行权限的协作者'], ['导出', '独立 export 权限 + 字段脱敏规则'], ['分享', '独立 publish 权限 + 目标受众检查']]), 'memory');
  action('template-toggle', () => { A.templateEnabled = !A.templateEnabled; commit(A.templateEnabled ? '模板已恢复可复用状态。' : '模板已停止新复用，已生成报告保留。'); }, 'memory');
  action('template-check', () => detail('复用前检查', [['身份', '使用当前操作者身份，不继承模板作者权限'], ['数据', '重新检查所选区域、品牌和渠道范围'], ['口径', '显示当前版本与模板版本差异'], ['输出', '新建产物和版本，记录来源模板'], ['持续运行', '明确责任人、周期、预算与投递授权']]), 'memory');

  // Organization and editable capability grants.
  function memberForm(index) {
    const m = index === null ? { name: '', email: '', department: '', role: 'analyst' } : A.members[index];
    C.modal(index === null ? '添加成员' : '编辑成员', `${field('姓名', 'adm-member-name', m.name)}${field('工作邮箱', 'adm-member-email', m.email, 'email')}${field('部门', 'adm-member-department', m.department)}${select('角色', 'adm-member-role', Object.entries(roles), m.role)}${errors}<p class="muted">原型仅更新本地成员，不发送邀请消息。</p>`, footer('保存成员', 'member-save', `data-index="${index === null ? 'new' : index}"`));
  }
  action('member-add', () => memberForm(null), 'organization');
  action('member-edit', el => memberForm(Number(el.dataset.index)), 'organization');
  action('member-save', el => { const name = value('adm-member-name'), email = value('adm-member-email'), department = value('adm-member-department'); if (!name || !department || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { error('请填写姓名、部门和有效工作邮箱。'); return; } const index = el.dataset.index === 'new' ? -1 : Number(el.dataset.index); if (A.members.some((m, i) => i !== index && m.email === email)) { error('该邮箱已存在，请使用其他邮箱。'); return; } const m = { name, email, department, role: value('adm-member-role'), status: index < 0 ? '有效' : A.members[index].status }; if (index < 0) A.members.push(m); else A.members[index] = m; finish('成员资料与角色已保存。'); }, 'organization');
  action('member-toggle', el => { const m = A.members[Number(el.dataset.index)]; if (!m) return; m.status = m.status === '已停用' ? '有效' : '已停用'; if (m.status === '已停用') A.runs.forEach(r => { if (r.owner === m.name && ['运行中', '等待授权'].includes(r.status)) { r.status = '已暂停'; r.checkpoint = '执行身份已停用；停止派发；恢复时须重新指定责任人'; } }); commit(m.name + ' 已' + (m.status === '有效' ? '启用。' : '停用；相关运行停止派发新动作。')); }, 'organization');
  action('lifecycle-sync', () => { let count = 0; A.members.forEach(m => { if (m.status === '待离职停用') { m.status = '已停用'; count++; A.runs.forEach(r => { if (r.owner === m.name && r.status !== '已完成') { r.status = '已暂停'; r.checkpoint = '目录同步：执行身份已停用；禁止使用管理员身份代跑'; } }); } }); A.lifecycle = '2026-10-20 · 刚刚'; commit('生命周期同步完成，停用 ' + count + ' 个离职账号。'); }, 'organization');
  action('role-load', () => { A.roleEditing = value('adm-role-editing'); commit('已载入' + roles[A.roleEditing] + '功能权限。'); }, 'organization');
  action('role-save', () => { const role = A.roleEditing; const grants = Array.from(document.querySelectorAll('#adm-permission-form input:checked')).map(el => el.value); if (role === 'admin' && !grants.includes('organization')) { C.toast('请为工作区管理员保留组织设置，避免演示工作区无人可管理权限。'); return; } C.state.grants[role] = grants; commit(roles[role] + '功能权限已保存，菜单与页面访问立即按新权限生效。'); }, 'organization');
  action('sso-toggle', () => { A.sso = !A.sso; commit(A.sso ? '演示企业登录连接已恢复。' : '演示企业登录连接已暂停，当前预览会话保留。'); }, 'organization');
  action('service-toggle', () => { A.serviceActive = !A.serviceActive; if (!A.serviceActive) A.scheduleEnabled = false; commit(A.serviceActive ? '经营分析服务身份已启用；定时计划需单独恢复。' : '服务身份已停用，每日经营简报计划同步暂停。'); }, 'organization');
  action('tenant-detail', () => detail('行野运动集团 · 租户边界', [['租户', 'tenant_xingye / 中国经营分析工作区'], ['经营维度', '品牌、区域、渠道、门店在租户内授权'], ['隔离入口', '页面、API、搜索、缓存、下载与日志'], ['跨租户访问', '默认拒绝；任何角色不可凭当前授权访问其他租户'], ['平台运维', '健康诊断与业务内容读取分离']]), 'organization');
  action('tenant-check', () => detail('跨租户隔离校验', [['请求', '当前行野身份访问 coast-demo 的订单摘要'], ['策略判定', badge('拒绝：tenant_mismatch', 'danger')], ['结果', '不返回数据、不读取缓存、不生成下载链接'], ['审计', '已记录拒绝事件；不记录目标租户敏感内容']], notice('校验为本地模拟，未访问任何真实企业数据。')), 'organization');

  const routes = { 'admin-overview': overview, data, capabilities, runs, quality, security, memory, organization };
  C.adminRender = route => {
    if (!routes[route]) return '';
    if (!C.can(route)) return `<div class="empty"><h1>当前角色没有访问权限</h1><p>该入口需要「${caps[route]}」功能权限。请通过组织管理员申请。</p></div>`;
    // A temporary sensitive view does not survive a route change or refresh.
    if (route !== 'security' || active('security', 'traces') !== 'audit' || !C.can('audit-sensitive')) A.auditUnmasked = false;
    return `<div class="admin-page">${!C.can('governance-write') ? notice('当前角色拥有只读管理权限。配置变更、评测执行、发布回滚与运行控制需要独立的「管理配置与运行写操作」权限。', 'admin-readonly') : ''}${routes[route]()}</div>`;
  };
})();
