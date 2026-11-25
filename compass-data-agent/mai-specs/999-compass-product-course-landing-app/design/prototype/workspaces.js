/* Compass plugin library and interactive dashboards. Local synthetic data only. */
(() => {
  'use strict';
  const C = window.C, e = C.esc, i = C.icon;
  const categories = [['all','全部插件','grid'],['Skill','Skill','book'],['Prompt','Prompt','file'],['Agent','Agent','spark'],['报告模板','报告模板','file'],['数据集','数据集','database']];
  const plugins = [
    {id:'revenue-skill',type:'Skill',name:'经营异动归因',description:'从收入变化出发，验证数据完整性，拆解渠道贡献，再检查库存、退款与流量假设。',version:'2.3',icon:'chart',scenario:'S05',output:'诊断报告 · 贡献桥图',prompt:'使用经营异动归因方法，检查本周净销售额变化并给出证据。',inputs:'同口径订单、退款、库存与活动数据',checks:'贡献项互斥；合计与总变化一致；相关与因果分开表达'},
    {id:'retention-skill',type:'Skill',name:'30 日复购分析',description:'按首购队列衡量复购，只比较具备完整观察窗口的会员，保留队列成熟度。',version:'1.2',icon:'users',scenario:'S12',output:'留存矩阵 · 参数化看板',prompt:'使用 30 日复购分析 Skill，按首购月份与渠道分析成熟会员队列。',inputs:'会员去重键、首购日期与已确认退款订单',checks:'观察窗口成熟；会员去重；退款规则明确'},
    {id:'weekly-prompt',type:'Prompt',name:'每周经营复盘',description:'用固定的问题结构梳理本周表现、偏差、证据和下一步，保持复盘口径一致。',version:'1.4',icon:'file',scenario:'S06',output:'结构化复盘 · 行动清单',prompt:'按每周经营复盘结构分析：目标达成、渠道变化、商品库存、会员变化、证据与下一步。',inputs:'本周目标、对比时间范围、经营指标',checks:'结论有来源；建议与已执行动作分开'},
    {id:'inventory-prompt',type:'Prompt',name:'热门尺码缺货排查',description:'先看可售库存与尺码分布，再核对门店覆盖和在途补货，避免被 SPU 总库存误导。',version:'1.1',icon:'search',scenario:'S02',output:'尺码分布 · 补货候选',prompt:'排查 R100 跑鞋热门尺码缺货：按门店、颜色、尺码查看可售库存与在途补货。',inputs:'SKU 库存、门店、在途单与近 7 日销量',checks:'SKU 粒度；仓店库存分离；调拨仅生成建议'},
    {id:'business-agent',type:'Agent',name:'经营研究员',description:'围绕一个有边界的经营问题组织独立调查分支，交叉验证假设并整理完整报告。',version:'1.6',icon:'spark',scenario:'S06',output:'专题报告 · 可复算分析包',prompt:'以经营研究员协作模式调查近半年转化变化，组织流量、商品、库存分支并交叉验证。',inputs:'业务问题、研究周期、范围和预算',checks:'分支目标独立；共享同一预算；反证保留'},
    {id:'reconciliation-agent',type:'Agent',name:'财务对账助手',description:'固定财务与经营快照，逐项桥接口径、跨期与延迟差异，保留待核对余额。',version:'1.3',icon:'shield',scenario:'S04',output:'差异桥接表 · 待核对清单',prompt:'由财务对账助手检查九月财务月报与经营净销售额差异，逐项桥接并保留未解释余额。',inputs:'财务快照、经营快照、口径版本',checks:'源快照固定；差异守恒；公共指标不直接修改'},
    {id:'daily-template',type:'报告模板',name:'经营日报',description:'把核心指标、渠道贡献与异常信号组织为每日简报，刷新时保留计算逻辑与模板版本。',version:'3.0',icon:'clock',scenario:'S10',output:'每日简报 · 持续运行定义',prompt:'基于经营日报模板生成昨日简报，包含净销售额、渠道贡献、库存异常和证据，先预览再决定投递。',inputs:'前一经营日数据与明确的接收范围',checks:'数据就绪率；生成与投递分开；持续授权有效'},
    {id:'experiment-template',type:'报告模板',name:'实验决策报告',description:'将设计检查、效应区间、护栏与预设上线标准放在同一页，支持可追溯的专业复核。',version:'1.0',icon:'check',scenario:'S08',output:'实验报告 · 复核请求',prompt:'使用实验决策报告模板评估商品详情页 A/B 实验，检查分流、效应区间、护栏和预设上线标准。',inputs:'预注册设计、分流日志、转化与退款',checks:'样本比例；区间与最小业务效应；方法前提'},
    {id:'sales-dataset',type:'数据集',name:'全渠道订单与退款',description:'统一订单明细、支付与已确认退款的合成经营数据引用，保留销售归属和履约地点。',version:'2026.10',icon:'database',scenario:'S01',output:'答案卡 · 受控查询结果',prompt:'引用全渠道订单与退款数据集，查询上周净销售额，解释口径并提供可核验来源。',inputs:'当前用户授权的区域、品牌与渠道',checks:'租户隔离；退款先聚合；不暴露未授权明细'},
    {id:'inventory-dataset',type:'数据集',name:'仓店 SKU 库存快照',description:'按 SKU、仓店和日期保存可售量、预留量与在途量，支撑规格缺货和库存健康分析。',version:'2026.10',icon:'database',scenario:'S02',output:'库存分布 · 规格明细',prompt:'引用仓店 SKU 库存快照，比较热门跑鞋规格可售量、在途量和近 7 日需求。',inputs:'当前区域内的门店、配送中心与商品范围',checks:'快照时间明确；仓店和规格粒度一致；仅受控引用'}
  ];
  const boards = [
    {id:'overview',name:'经营总览',icon:'grid',description:'把收入、订单、客单与贡献放在同一经营视图，及时发现值得继续分析的变化。'},
    {id:'channels',name:'渠道表现',icon:'chart',description:'看清渠道之间的收入结构、成本与贡献差异，沿着异常继续下钻。'},
    {id:'inventory',name:'库存健康',icon:'database',description:'从总量走到 SKU 与仓店，关注热门规格缺货、可售覆盖与库存周转。'}
  ];
  C.state.workspaces ||= {};
  const W = C.state.workspaces;
  const defaults = {category:'all',query:'',enabled:['revenue-skill','retention-skill','weekly-prompt','inventory-prompt','business-agent','daily-template','sales-dataset','inventory-dataset'],uses:{},board:'overview',period:'week',region:'east',selectedChannel:'all',refreshes:0,lastRefresh:'2026-10-20 08:35',lastAction:''};
  for (const [key,value] of Object.entries(defaults)) if (!(key in W)) W[key] = value;
  const b = (label,action,attrs='',kind='secondary') => C.btn(label,'ws-'+action,attrs,kind);
  const badge = (text,tone='neutral') => C.badge(text,tone);
  const save = message => { W.lastAction=message; C.save(); C.render(); if(message)C.toast(message); };
  const action = (name,fn) => { C.handlers['ws-'+name]=(el,event)=>{if(!C.can('assets')){C.toast('当前身份没有访问插件与看板的权限。');return;}fn(el,event);}; };
  const effectiveRegion = () => C.state.role === 'manager' ? 'east' : (['all','east','south','north'].includes(W.region) ? W.region : 'east');
  const regionName = () => ({all:'中国全区域',east:'华东',south:'华南',north:'华北'}[effectiveRegion()]);
  const periodName = () => ({week:'近 7 天',month:'近 30 天',quarter:'本季度'}[W.period]||'近 7 天');
  const periodWindow = () => ({week:'2026.10.12 — 10.18',month:'2026.09.19 — 10.18',quarter:'2026.10.01 — 10.18'}[W.period]||'2026.10.12 — 10.18');
  const canAnalyzeAttrs = () => C.can('analyze') ? '' : ' disabled title="需要分析工作台权限"';
  function start(scenario,prompt,source='board',sourceDetails={}){
    if(!C.can('analyze')){C.toast('当前身份没有发起分析的权限。');return;}
    C.closeModal();
    const text=`${prompt}\n数据范围：${regionName()}；时间：${periodWindow()}。所有计算遵循当前身份的数据授权。`;
    if(C.startConversation){const r=C.startConversation(scenario,text);if(r){r.region=regionName();r.channel=W.selectedChannel==='all'?'全部渠道':W.selectedChannel;r.sourceContext={type:source,board:source==='board'?W.board:null,period:W.period,window:periodWindow(),region:r.region,channel:r.channel,...sourceDetails};C.save();C.render();}}else{C.state.draft=text;C.save();C.go('scenario/'+scenario);}
  }
  const unauthorized = () => '<section class="ws-empty"><h1>当前身份没有访问权限</h1><p>此工作空间需要分析资产访问权限。</p></section>';
  const subtitle = (tag,title,description) => `<header class="ws-heading"><div class="eyebrow">${tag}</div><h1>${title}</h1><p>${description}</p></header>`;

  C.workspaceSecondary = group => {
    if(!C.can('assets'))return '<div class="secondary-note">当前身份没有访问此工作空间的权限。</div>';
    if(group==='plugins')return `<p class="secondary-description">把好方法，带进每一次分析</p><nav class="secondary-links" aria-label="插件分类">${categories.map(([key,label,icon])=>b(i(icon)+`<span>${label}</span><small class="ws-nav-count">${key==='all'?plugins.length:plugins.filter(p=>p.type===key).length}</small>`,'category',`data-category="${key}"`,'nav-item '+(W.category===key?'active':''))).join('')}</nav><div class="secondary-note">已启用 ${W.enabled.length} / ${plugins.length} 个插件。启用只改变本地分析偏好，执行时仍检查当前权限。</div>`;
    if(group==='boards')return `<p class="secondary-description">同一份口径，持续观察经营</p><nav class="secondary-links" aria-label="我的看板">${boards.map(board=>b(i(board.icon)+`<span>${board.name}</span>`,'board',`data-board="${board.id}"`,'nav-item '+(W.board===board.id?'active':''))).join('')}</nav><div class="secondary-note">${i('shield')} ${C.state.role==='manager'?'华东授权范围内':'按当前身份授权范围'}查询。看板筛选同步传入后续分析。</div>`;
    return '';
  };
  C.pluginsRender = () => {
    if(!C.can('assets'))return unauthorized();
    const query=W.query.trim().toLowerCase();
    const matches=plugins.filter(p=>(W.category==='all'||p.type===W.category)&&(!query||[p.name,p.description,p.type,p.output].join(' ').toLowerCase().includes(query)));
    return `<div class="ws-page">${subtitle('CAPABILITY LIBRARY','把好方法，带进每一次分析','组合领域 Skill、分析提示、专职 Agent、报告模板与数据引用，让每个经营问题有合适的起点。')}<div class="ws-library-bar"><div class="ws-categories" role="group" aria-label="插件类型">${categories.map(([key,label])=>b(label,'category',`data-category="${key}" aria-pressed="${W.category===key}"`,W.category===key?'primary':'ghost')).join('')}</div><form class="ws-search" data-action="ws-search"><label class="sr-only" for="ws-plugin-query">搜索插件</label>${i('search')}<input id="ws-plugin-query" type="search" placeholder="搜索名称、用途或产物" value="${e(W.query)}"><button type="submit" class="btn ghost">搜索</button></form></div><div class="ws-list-meta"><span>${matches.length} 个${W.category==='all'?'可用插件':e(W.category)}${query?' · 搜索「'+e(W.query)+'」':''}</span><span>工作空间精选 · 合成业务场景</span></div><div class="ws-plugin-grid">${matches.map(p=>{const on=W.enabled.includes(p.id);return `<article class="ws-plugin-card"><div class="ws-card-top"><span class="ws-plugin-icon">${i(p.icon)}</span>${badge(p.type)}<span class="ws-version">v${p.version}</span></div><h2>${p.name}</h2><p>${p.description}</p><div class="ws-output">${i('file')}<span>${p.output}</span></div><div class="ws-plugin-status">${badge(on?'已启用':'未启用',on?'success':'neutral')}<small>${W.uses[p.id]?`已应用 ${W.uses[p.id]} 次`:'尚未应用'}</small></div><div class="ws-card-actions">${b('查看详情','detail',`data-id="${p.id}"`)}${b(on?'用于分析':'启用插件',on?'apply':'toggle',`data-id="${p.id}"${on?canAnalyzeAttrs():''}`,on?'primary':'secondary')}</div></article>`;}).join('')}</div>${matches.length?'':`<div class="ws-empty">${i('search')}<h2>没有找到匹配的插件</h2><p>试试「库存」「复购」或切换插件类型。</p>${b('清除筛选','clear-search')}</div>`}<div class="ws-footnote">${i('shield')} 插件提供方法与上下文。数据访问、工具执行、导出和发布分别遵循当前授权。${W.lastAction?`<span>${e(W.lastAction)}</span>`:''}</div></div>`;
  };
  function pluginDetail(p){
    const on=W.enabled.includes(p.id);
    C.modal(p.name,`<div class="ws-detail-tags">${badge(p.type)}${badge('v'+p.version)}${badge(on?'已启用':'未启用',on?'success':'neutral')}</div><p>${p.description}</p><dl class="ws-details"><div><dt>所需输入</dt><dd>${p.inputs}</dd></div><div><dt>输出产物</dt><dd>${p.output}</dd></div><div><dt>方法检查</dt><dd>${p.checks}</dd></div><div><dt>适用范围</dt><dd>${regionName()} · 当前身份授权范围</dd></div><div><dt>来源</dt><dd>Compass 工作空间精选 · 合成数据演示</dd></div></dl><label class="field">分析起点<textarea readonly rows="3">${e(p.prompt)}</textarea></label>${p.type==='数据集'?'<div class="notice">这是合成数据的受控引用。应用后传入分析上下文，不会连接真实数据库或读取外部文件。</div>':'<p class="muted small">启用或停用只影响本地个人工作空间，不修改管理员发布的生产能力组合。</p>'}`,b(on?'停用插件':'启用插件','toggle',`data-id="${p.id}" data-detail="true"`)+b('用于分析','apply',`data-id="${p.id}" ${!on?'disabled title="请先启用此插件"':canAnalyzeAttrs()}`,'primary'));
  }
  action('category',el=>{if(!categories.some(x=>x[0]===el.dataset.category))return;W.category=el.dataset.category;C.save();C.go('plugins');});
  action('search',()=>{W.query=document.getElementById('ws-plugin-query')?.value.trim()||'';C.save();C.go('plugins');});
  action('clear-search',()=>{W.query='';W.category='all';C.save();C.go('plugins');});
  action('detail',el=>{const p=plugins.find(p=>p.id===el.dataset.id);if(p)pluginDetail(p);});
  action('toggle',el=>{const p=plugins.find(p=>p.id===el.dataset.id);if(!p)return;const on=W.enabled.includes(p.id);W.enabled=on?W.enabled.filter(id=>id!==p.id):[...W.enabled,p.id];W.lastAction=`${p.name}已${on?'停用':'启用'}，当前授权范围保持有效。`;C.save();C.render();C.toast(W.lastAction);if(el.dataset.detail)pluginDetail(p);});
  action('apply',el=>{const p=plugins.find(p=>p.id===el.dataset.id);if(!p)return;if(!W.enabled.includes(p.id)){C.toast('请先启用该插件。');return;}if(!C.can('analyze')){C.toast('当前身份没有发起分析的权限。');return;}W.uses[p.id]=(W.uses[p.id]||0)+1;W.lastAction=`已将「${p.name}」v${p.version}应用到新分析。`;C.save();start(p.scenario,`使用插件「${p.name}」v${p.version}。${p.prompt}`,'plugin',{pluginId:p.id,pluginVersion:p.version,inputs:{definition:p.inputs,scope:regionName(),prompt:p.prompt,dataReference:p.type==='数据集'?{id:p.id,version:p.version,scope:regionName()}:null}});});

  function boardData(){
    const factor=({all:4.4,east:1,south:.73,north:.61}[effectiveRegion()]) * ({week:1,month:4.08,quarter:2.58}[W.period]||1);
    const channels=[['天猫',.392,-6.2,10.4],['京东',.231,4.1,12.2],['自有线上',.218,18.6,21.5],['线下门店',.159,7.3,17.8]];
    const dates=W.period==='week'?['周一','周二','周三','周四','周五','周六','周日']:W.period==='month'?['09.19','09.24','09.29','10.04','10.09','10.14','10.18']:['10.01','10.04','10.07','10.10','10.13','10.16','10.18'];
    return {factor,revenue:1286500*factor,orders:Math.round(4826*factor),channels,dates,trend:[152,168,173,162,189,221,221].map(v=>v*factor),previous:[138,149,157,164,172,201,193].map(v=>v*factor)};
  }
  const money=n=>n>=1000000?'¥ '+(n/10000).toFixed(1)+' 万':'¥ '+Math.round(n).toLocaleString('zh-CN');
  const kpi=(label,value,delta,foot,tone='positive')=>`<article class="ws-kpi"><span>${label}</span><strong>${value}</strong><div><em class="ws-${tone}">${delta}</em><small>${foot}</small></div></article>`;
  function trendChart(d,inventory=false){
    const offset=({all:-.6,east:0,south:-1.2,north:-.8}[effectiveRegion()])+({week:0,month:-.6,quarter:-.4}[W.period]||0);
    const values=inventory?[96,95,94,95,97,98,98].map(v=>v+offset):d.trend;
    const previous=inventory?[94,94,93,94,94,95,96].map(v=>v+offset):d.previous;
    const max=Math.max(...values,...previous)*1.14,min=inventory?85:0;
    const point=(v,j)=>[50+j*93,220-(v-min)/(max-min)*180];
    const path=arr=>arr.map((v,j)=>{const [x,y]=point(v,j);return `${j?'L':'M'} ${x.toFixed(1)} ${y.toFixed(1)}`;}).join(' ');
    const ticks=inventory?[90,95,100]:[0,.25,.5,.75,1].map(x=>Math.round(max*x));
    return `<svg class="ws-trend" viewBox="0 0 660 265" role="img" aria-label="${regionName()}${periodName()}${inventory?'可售库存覆盖率':'净销售额'}趋势；本期实线，对比期虚线"><defs><linearGradient id="ws-area-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6d9780" stop-opacity=".24"/><stop offset="1" stop-color="#6d9780" stop-opacity="0"/></linearGradient></defs>${ticks.map(v=>{const y=220-(v-min)/(max-min)*180;return `<line x1="50" y1="${y}" x2="620" y2="${y}" stroke="#e4e9e1" stroke-dasharray="3 5"/><text x="40" y="${y+4}" text-anchor="end">${inventory?v+'%':Math.round(v)}</text>`;}).join('')}<path d="${path(values)} L 608 220 L 50 220 Z" fill="url(#ws-area-fill)"/><path d="${path(previous)}" fill="none" stroke="#9baa9d" stroke-width="2" stroke-dasharray="5 6"/><path d="${path(values)}" fill="none" stroke="#1c5145" stroke-width="3" stroke-linecap="round"/>${values.map((v,j)=>{const [x,y]=point(v,j);return `<circle cx="${x}" cy="${y}" r="4" fill="#fff" stroke="#1c5145" stroke-width="2"><title>${d.dates[j]}：${inventory?v+'%':money(v*1000)}</title></circle><text x="${x}" y="248" text-anchor="middle">${d.dates[j]}</text>`;}).join('')}</svg>`;
  }
  function channelList(d){
    return `<div class="ws-channel-list">${d.channels.map(([name,share,growth])=>`<button class="ws-channel ${W.selectedChannel===name?'active':''}" data-action="ws-channel" data-channel="${name}" aria-pressed="${W.selectedChannel===name}"><span><strong>${name}</strong><small>${money(d.revenue*share)}</small></span><span class="ws-bar-track"><i style="width:${share*180}%"></i></span><span class="ws-channel-change ${growth<0?'ws-negative':'ws-positive'}">${growth>0?'+':''}${growth}%</span></button>`).join('')}</div>`;
  }
  function detailsTable(d){
    if(W.board==='inventory')return C.table(['商品 / 规格','当前范围','可售库存','库存健康','下一步'],[['R100 轻量跑鞋 · 黑 / 42',regionName(),'18 双',badge('热门尺码缺货','warning'),b('排查缺货','board-analyze','data-scenario="S02" data-topic="R100 黑色42码缺货"'+canAnalyzeAttrs())],['轻量冲锋衣 · 云灰 / M',regionName(),'326 件',badge('库存健康','success'),b('查看分布','board-analyze','data-scenario="S02" data-topic="冲锋衣库存分布"'+canAnalyzeAttrs())],['双人露营帐篷 · 标准款',regionName(),'640 件',badge('库龄偏高','warning'),b('分析周转','board-analyze','data-scenario="S05" data-topic="露营帐篷库存周转"'+canAnalyzeAttrs())]]);
    return C.table(['渠道','净销售额','收入占比','环比变化','渠道贡献率','操作'],d.channels.filter(([name])=>W.selectedChannel==='all'||W.selectedChannel===name).map(([name,share,growth,margin])=>[name,money(d.revenue*share),(share*100).toFixed(1)+'%',`<span class="${growth<0?'ws-negative':'ws-positive'}">${growth>0?'+':''}${growth}%</span>`,margin.toFixed(1)+'%',b('继续分析','board-analyze',`data-scenario="${growth<0?'S05':'S02'}" data-topic="${name}渠道经营表现"${canAnalyzeAttrs()}`)]));
  }
  C.boardsRender=()=>{
    if(!C.can('assets'))return unauthorized();
    if(!boards.some(x=>x.id===W.board))W.board='overview';
    const board=boards.find(x=>x.id===W.board),d=boardData(),inventory=W.board==='inventory';
    const coverage=({all:97.4,east:98,south:96.8,north:97.2}[effectiveRegion()])+({week:0,month:-.6,quarter:-.4}[W.period]||0);
    const turnover=42.6+({all:2,east:0,south:3.2,north:1.8}[effectiveRegion()])+({week:0,month:2.4,quarter:1.6}[W.period]||0);
    const regions=C.state.role==='manager'?[['east','华东 · 已授权']]:[['east','华东'],['all','中国全区域'],['south','华南'],['north','华北']];
    const kpis=W.board==='channels'?[kpi('渠道净销售额',money(d.revenue),'+9.5%','同口径对比'),kpi('自有渠道收入占比','21.8%','+2.4pp','结构持续改善'),kpi('渠道费用率','24.4%','+2.2pp','需检查投放费用','negative'),kpi('渠道贡献率','14.2%','−2.6pp','含渠道经营费用','negative')]:inventory?[kpi('可售库存覆盖率',coverage.toFixed(1)+'%','+2.0pp','较上一周期'),kpi('热门 SKU 缺货率',((100-coverage)*2.4).toFixed(1)+'%','−1.2pp','持续改善'),kpi('库存周转天数',turnover.toFixed(1)+' 天','+3.2 天','较上一周期','negative'),kpi('需要跟进的规格',String(Math.round(18*({all:4.4,east:1,south:.73,north:.61}[effectiveRegion()]))),'3 类','缺货 / 滞销 / 在途','neutral')]:[kpi('净销售额',money(d.revenue),'+9.5%','较上一周期'),kpi('有效订单',d.orders.toLocaleString('zh-CN'),'+7.2%','已确认支付'),kpi('平均客单价','¥ '+(d.revenue/d.orders).toFixed(1),'+2.1%','同口径对比'),kpi('渠道贡献率','14.2%','−2.6pp','优先检查费用结构','negative')];
    return `<div class="ws-page">${subtitle('BUSINESS BOARDS',board.name,board.description)}<div class="ws-board-toolbar"><div class="ws-categories" role="group" aria-label="选择看板">${boards.map(x=>b(x.name,'board',`data-board="${x.id}" aria-pressed="${W.board===x.id}"`,W.board===x.id?'primary':'ghost')).join('')}</div><form class="ws-board-filters" data-action="ws-filters"><label>时间窗口<select id="ws-board-period">${[['week','近 7 天'],['month','近 30 天'],['quarter','本季度']].map(([v,t])=>`<option value="${v}" ${W.period===v?'selected':''}>${t}</option>`).join('')}</select></label><label>经营区域<select id="ws-board-region" ${C.state.role==='manager'?'disabled':''}>${regions.map(([v,t])=>`<option value="${v}" ${effectiveRegion()===v?'selected':''}>${t}</option>`).join('')}</select></label><button type="submit" class="btn secondary">应用筛选</button>${b(i('refresh'),'refresh','aria-label="刷新看板" title="刷新合成数据快照"','ghost icon-btn')}</form></div><div class="ws-list-meta"><span>${e(regionName())} · ${periodWindow()} · 人民币</span><span>${i('clock')} 更新于 ${W.lastRefresh}</span></div>${C.state.role==='manager'?'<div class="ws-scope-notice">'+i('shield')+' 当前身份的数据范围为华东，所有指标、图表与后续分析保持在此范围内。</div>':''}<div class="ws-kpi-grid">${kpis.join('')}</div><div class="ws-board-grid"><section class="ws-chart-panel"><div class="ws-panel-heading"><div><h2>${inventory?'可售覆盖率趋势':'净销售额趋势'}</h2><p>${inventory?'按每日可售 SKU 覆盖计算':'单位：千元 · 退款按原订单归属'}</p></div><div class="ws-legend"><span><i></i>本期</span><span><i class="previous"></i>对比期</span></div></div>${trendChart(d,inventory)}<div class="ws-chart-caption">${inventory?'热门规格缺货率已回落，仍需检查门店间的库存分布。':'本期增长主要集中在周末，自有线上渠道的增长幅度更高。'}</div></section><section class="ws-insight-panel"><div class="eyebrow">WORTH A CLOSER LOOK</div><span class="ws-signal-line"></span><h2>${inventory?'库存充足，热门尺码仍在缺货。':'收入在增长，贡献却收窄了。'}</h2><p>${inventory?'总库存不能替代 SKU 级可售判断。R100 黑色 42 码在授权门店中存在分布不均。':'天猫收入环比下降 6.2%，同时自有线上增长 18.6%。价格、渠道结构与费用值得进一步拆解。'}</p>${b('带着当前范围继续分析 '+i('arrow'),'board-analyze',`data-scenario="${inventory?'S02':'S05'}" data-topic="${inventory?'热门尺码缺货与库存分布':'收入增长与渠道贡献收窄'}"${canAnalyzeAttrs()}`,'primary')}<small>${e(regionName())} · ${periodName()} · 附带当前筛选</small></section></div>${!inventory?`<div class="ws-board-grid ws-bottom-grid"><section class="ws-chart-panel"><div class="ws-panel-heading"><div><h2>渠道收入与变化</h2><p>选择渠道，联动下方经营明细</p></div>${W.selectedChannel!=='all'?b('清除选择','channel','data-channel="all"','ghost'):''}</div>${channelList(d)}</section><section class="ws-chart-panel"><h2>当前观察</h2><div class="ws-observation"><span>01</span><div><h3>自有线上保持增长</h3><p>收入增长 18.6%，贡献率 21.5%。可继续检查会员结构与活动质量。</p></div></div><div class="ws-observation"><span>02</span><div><h3>渠道贡献需要同口径比较</h3><p>贡献率包含渠道费用，和商品毛利率分开管理。当前使用口径 v2.1。</p></div></div></section></div>`:''}<section class="ws-chart-panel ws-detail-table"><div class="ws-panel-heading"><div><h2>${inventory?'需要关注的库存规格':'渠道经营明细'}</h2><p>${W.selectedChannel!=='all'&&!inventory?'已筛选：'+e(W.selectedChannel):'点击继续分析，保留当前时间与区域条件'}</p></div>${badge('合成数据','neutral')}</div>${detailsTable(d)}</section><div class="ws-footnote">${i('shield')} 看板按访问者授权动态计算。结果仅用于产品交互演示；刷新保留固定口径和筛选条件。</div></div>`;
  };
  action('board',el=>{if(!boards.some(b=>b.id===el.dataset.board))return;W.board=el.dataset.board;W.selectedChannel='all';C.save();C.go('boards');});
  action('filters',()=>{const period=document.getElementById('ws-board-period')?.value,region=document.getElementById('ws-board-region')?.value;if(!['week','month','quarter'].includes(period))return;if(C.state.role==='manager'&&region!=='east'){C.toast('当前身份仅可访问华东数据。');return;}W.period=period;W.region=C.state.role==='manager'?'east':region;W.selectedChannel='all';save('看板已按'+periodName()+' / '+regionName()+'更新，筛选将传入后续分析。');});
  action('refresh',()=>{W.refreshes++;W.lastRefresh='2026-10-20 '+new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});save('合成数据快照已刷新，口径与筛选保持一致。');});
  action('channel',el=>{if(!['all','天猫','京东','自有线上','线下门店'].includes(el.dataset.channel))return;W.selectedChannel=el.dataset.channel;save(el.dataset.channel==='all'?'已恢复全部渠道。':'已联动筛选'+el.dataset.channel+'经营明细。');});
  action('board-analyze',el=>{const scenario=['S01','S02','S05','S06','S12'].includes(el.dataset.scenario)?el.dataset.scenario:'S05';start(scenario,`从「${boards.find(b=>b.id===W.board)?.name||'经营总览'}」继续分析：${el.dataset.topic||'当前经营变化'}。${W.selectedChannel!=='all'?'渠道筛选：'+W.selectedChannel+'。':''}`);});
})();
