/* Compass HTML prototype. Local synthetic state only. */
(() => {
  'use strict';
  const C = window.C = {handlers:{}};
  C.storageKey = 'compass-prototype-20261020';
  const common = ['analyze','assets','review'];
  C.defaultGrants = {
    executive:[...common,'export'], analyst:[...common,'automations','data','export'],
    manager:[...common,'automations','admin-overview','runs','export','publish','governance-write'],
    admin:[...common,'automations','admin-overview','data','capabilities','runs','quality','security','memory','organization','export','publish','audit-sensitive','governance-write'],
    operator:['admin-overview','capabilities','runs','quality','security','governance-write'], auditor:['admin-overview','security','quality','audit-sensitive']
  };
  C.roles = {executive:'集团经营负责人',analyst:'业务分析师',manager:'华东部门管理者',admin:'企业管理员',operator:'平台运行维护者',auditor:'安全审计员'};
  const initial = {
    role:'analyst',tenant:'行野运动集团',grants:structuredClone(C.defaultGrants),runs:{},
    artifacts:[
      {id:'a-revenue',title:'华东渠道贡献诊断',type:'诊断报告',version:3,scenario:'S05',region:'华东',summary:'本周净销售额增长 8.2%，渠道贡献下降 15.3%。折扣、结构与渠道费用共同解释了贡献变化。',method:'同口径渠道贡献分解',status:'完成',verification:'通过',adoption:'待采纳',publication:'草稿',freshness:'当前有效',updated:'2026-10-20',source:'订单与退款 · 10月19日 23:59'},
      {id:'a-shoes',title:'跑鞋尺码库存与调拨候选',type:'交互图表',version:2,scenario:'S02',region:'华东',summary:'R100 总库存充足，华东 18 家门店的热门尺码缺货。调拨候选需要结合运输时效和门店可售量复核。',method:'SKU × 地点库存交叉分析',status:'完成',verification:'通过',adoption:'已采纳',publication:'已发布',freshness:'当前有效',updated:'2026-10-19',source:'WMS · 10月19日 23:59'},
      {id:'a-week',title:'全渠道经营周报',type:'周期报告',version:8,scenario:'S10',region:'中国全渠道',summary:'抖音日汇总尚未到齐，本期周报仅完成已就绪渠道，投递保持等待。',method:'固定模板与数据就绪检查',status:'部分完成',verification:'部分通过',adoption:'待决定',publication:'草稿',freshness:'上游延迟',updated:'2026-10-19',source:'平台日汇总 · 抖音数据延迟'}
    ],
    automations:[{id:'au1',name:'每日经营简报',type:'固定刷新',frequency:'每日 09:00',scope:'中国全渠道',receiver:'经营管理组',status:'运行中',version:3},{id:'au2',name:'跑鞋热门尺码缺货预警',type:'主动监控',frequency:'每小时',scope:'华东 · 跑鞋',receiver:'华东供应链组',status:'运行中',version:2}],
    decisions:[{id:'d1',title:'将渠道贡献报告 V3 发布至经营管理组',kind:'发布授权',scope:'报告 V3 · 12 名成员 · 有效 24 小时',status:'待处理'},{id:'d2',title:'确认活动归因观察窗口',kind:'业务澄清',scope:'618 活动 · 退款观察 30 天',status:'待处理'},{id:'d3',title:'复核预测回测方法',kind:'专业复核',scope:'未来 12 周 · 滚动回测 3 折',status:'待处理'}],
    audit:[],draft:'',attachments:[],assetFilter:'all'
  };
  try {C.state = {...initial,...JSON.parse(localStorage.getItem(C.storageKey)||'null')};} catch {C.state=initial;}
  C.save = () => {try {localStorage.setItem(C.storageKey,JSON.stringify(C.state));} catch {C.toast('浏览器存储不可用，本次更改仅在当前页面保留。');}};
  C.can = cap => (C.state.grants[C.state.role]||[]).includes(cap);
  C.esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const paths = {
    edit:'m16 3 5 5-12 12-6 1 1-6L16 3Zm-9 11 5 5M14 5l5 5',
    trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
    copy:'M8 8h13v13H8ZM16 8V3H3v13h5',
    'thumb-up':'M7 10H3v11h4V10Zm0 0 5-8h2v7h6l1 3-3 9H7V10Z',
    'thumb-down':'M7 14H3V3h4v11Zm0 0 5 8h2v-7h6l1-3-3-9H7v11Z',
    'panel-right':'M3 3h18v18H3ZM15 3v18M18 7h1m-1 5h1m-1 5h1',
    spinner:'M21 12a9 9 0 1 1-9-9',
    send:'M12 20V4M5 11l7-7 7 7',
    plus:'M12 5v14M5 12h14',arrow:'M5 12h14m-6-6 6 6-6 6',search:'m21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
    chart:'M4 4v16h16M8 15v-4m5 4V7m5 8v-6',clock:'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
    file:'M14 2H5v20h14V7l-5-5Zm0 0v6h5M8 13h8m-8 4h6',check:'m5 12 4 4L19 6',chevron:'m9 5 7 7-7 7',
    settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2',
    grid:'M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z',users:'M8 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M1 21v-3a6 6 0 0 1 12 0v3m3-17a4 4 0 0 1 0 8m1 3a5 5 0 0 1 5 5v1',
    shield:'m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Zm-4 10 3 3 5-6',play:'m8 4 12 8-12 8Z',pause:'M8 4v16M16 4v16',close:'m6 6 12 12M6 18 18 6',download:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',link:'m9 15 6-6M7 17l-1 1a4 4 0 0 1-5-5l5-5a4 4 0 0 1 5 0m2 8a4 4 0 0 0 5 0l5-5a4 4 0 0 0-5-5l-1 1',
    database:'M3 5c0-4 18-4 18 0s-18 4-18 0Zm0 0v14c0 4 18 4 18 0V5M3 12c0 4 18 4 18 0',more:'M5 12h1m5 0h1m5 0h1',spark:'m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z',folder:'M3 5h6l2 3h10v12H3Z',code:'m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18',alert:'m12 3 10 18H2L12 3Zm0 5v6m0 3v1',refresh:'M20 7a9 9 0 1 0 1 9M20 2v6h-6',menu:'M3 6h18M3 12h18M3 18h18',compass:'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Zm-7-4-2 6-5 2 2-6Z',bell:'M5 16V9a7 7 0 0 1 14 0v7l2 2H3l2-2Zm5 5h4',book:'M3 4h7l2 2 2-2h7v16h-7l-2 2-2-2H3ZM12 6v16',logout:'M9 3H3v18h6m4-5 5-4-5-4m-5 4h14'
  };
  C.icon = (name, cls='') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.grid}"/></svg>`;
  C.btn = (label, action, attrs='',kind='secondary') => `<button type="button" class="btn ${kind}" data-action="${C.esc(action)}" ${attrs}>${label}</button>`;
  C.badge = (text,tone='neutral')=>`<span class="status ${C.esc(tone)}"><span class="status-dot" aria-hidden="true"></span>${C.esc(text)}</span>`;
  C.table = (headers,rows) => `<div class="table-wrap" tabindex="0" aria-label="可横向滚动的数据表"><table class="table"><thead><tr>${headers.map(x=>`<th scope="col">${x}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(x=>`<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  C.toast = message => {const el=document.getElementById('toast'); if(!el)return;el.textContent=message;el.classList.add('visible');clearTimeout(C.toastTimer);C.toastTimer=setTimeout(()=>el.classList.remove('visible'),4000);};
  C.modal = (title,html,footer='') => {const d=document.getElementById('modal');d.classList.remove('command-palette');C.lastFocus=document.activeElement;d.innerHTML=`<header class="modal-head"><h2 id="modal-title" tabindex="-1">${C.esc(title)}</h2>${C.btn(C.icon('close'),'close-modal','aria-label="关闭对话框"','ghost icon-btn')}</header><div class="modal-body">${html}</div><footer class="modal-footer">${footer||C.btn('关闭','close-modal')}</footer>`;if(!d.open)d.showModal();d.querySelector('#modal-title').focus();};
  document.addEventListener('keydown',event=>{
    const d=document.getElementById('modal');
    if(event.key!=='Tab'||!d?.open)return;
    const items=[...d.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])')].filter(x=>x.getClientRects().length&&!x.hidden);
    if(!items.length){event.preventDefault();d.querySelector('#modal-title')?.focus();return;}
    const first=items[0],last=items.at(-1),active=document.activeElement;
    if(event.shiftKey&&(active===first||!items.includes(active))){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&active===last){event.preventDefault();first.focus();}
  });
  C.closeModal = () => {const d=document.getElementById('modal');d.close();d.classList.remove('command-palette');if(C.lastFocus?.isConnected&&!C.lastFocus.closest('[inert]'))C.lastFocus.focus();else document.getElementById('main')?.focus();};
  C.handlers['close-modal']=C.closeModal;
  C.log = (action,object) => {C.state.audit.unshift({action,object,time:new Date().toLocaleTimeString('zh-CN'),actor:C.roles[C.state.role]});C.save();};
  C.download=(name,text,type='text/plain')=>{const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
})();
