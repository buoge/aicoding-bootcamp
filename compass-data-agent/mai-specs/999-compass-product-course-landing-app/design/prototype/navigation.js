/* Icon rail + persistent / floating contextual navigation. No hover-only paths. */
(() => {
  'use strict';
  const C=window.C,e=C.esc,i=C.icon,b=C.btn;
  const primary=[
    ['analysis','分析','spark','analyze'],['reports','报告空间','folder','assets'],
    ['plugins','插件','code','assets'],['automations','定时任务','clock','automations'],
    ['boards','看板','chart','assets']
  ];
  const governance=[
    ['admin-overview','控制总览','chart','admin-overview'],['data','数据与语义','database','data'],
    ['capabilities','Agent 与能力','code','capabilities'],['runs','运行与调度','play','runs'],
    ['quality','质量与发布','check','quality'],['security','安全与审计','shield','security'],
    ['memory','记忆与产物','book','memory'],['organization','组织设置','users','organization']
  ];
  C.primaryGroup=route=>route.startsWith('chat/')||route.startsWith('scenario/')||['analysis','home','tasks','review','scenarios'].includes(route)?'analysis':governance.some(n=>n[0]===route)?'governance':route;
  const labels={analysis:'分析',reports:'报告空间',plugins:'插件',automations:'定时任务',boards:'看板',governance:'管理与治理',design:'设计体系'};
  const phase={ready:'准备就绪',running:'分析中',awaiting:'待决定',completed:'已完成',partial:'部分完成',blocked:'受阻',failed:'失败',cancelled:'已取消',cancel_requested:'取消中'};
  let hoverTimer,leaveTimer,hoverGroup=null,previewOpen=false;
  const compact=()=>matchMedia('(max-width:900px)').matches;
  const mobile=()=>matchMedia('(max-width:720px)').matches;
  const floating=()=>!C.state.navigation.pinned||compact();
  const current=()=>C.primaryGroup(C.route());
  const groupAllowed=group=>group==='design'||(group==='governance'?governance.some(n=>C.can(n[3])):C.can(primary.find(n=>n[0]===group)?.[3]));
  const secondaryLink=(route,label,icon='folder')=>`<a class="nav-item ${C.route()===route?'active':''}" href="#${route}" ${C.route()===route?'aria-current="page"':''}>${i(icon)}<span>${e(label)}</span></a>`;
  function sessionRow(r){
    const active=C.route()==='chat/'+r.taskId;
    const pending=(r.decisions||[]).find(d=>d.status==='pending');
    const waiting=r.phase==='awaiting'||Boolean(pending);
    const loading=['running','cancel_requested'].includes(r.phase)&&!waiting;
    const unread=C.conversationUnread(r);
    const tag=pending&&['execute','publish'].includes(pending.type)?'待授权':'待确认';
    const title=C.conversationTitle(r);
    return `<div class="session-row ${active?'active':''} ${waiting?'has-authorization':''}" data-task-id="${e(r.taskId)}"><a href="#chat/${e(r.taskId)}" class="conversation-link ${active?'active':''}" ${active?'aria-current="page"':''} title="${e(title)}"><span class="conversation-title">${e(title)}</span><span class="sr-only">${loading?'分析进行中':waiting?tag:phase[r.phase]||r.phase} · ${unread?'未读':'已读'}</span></a><div class="session-status">${loading?`<span class="session-spinner" role="img" aria-label="分析进行中">${i('spinner')}</span>`:''}${waiting?`<span class="session-auth-tag" title="需要你的${tag==='待授权'?'授权':'决定'}">${tag}</span>`:''}${unread?'<span class="session-unread-dot" role="img" aria-label="未读消息"></span>':''}</div><div class="session-actions">${b(i('edit'),'session-rename',`data-task-id="${e(r.taskId)}" title="改名" aria-label="重命名会话：${e(title)}"`,'ghost icon-btn')}${b(i('trash'),'session-delete',`data-task-id="${e(r.taskId)}" title="删除" aria-label="删除会话：${e(title)}"`,'ghost icon-btn')}</div></div>`;
  }
  function conversationList(){
    const rows=C.conversations();
    if(!rows.length)return '<div class="conversation-empty">从一个问题，开始新的分析<p>发起的分析会保留在这里。</p></div>';
    const groups=new Map();
    for(const r of rows){
      const date=new Date(C.conversationTime(r)),today=new Date(),days=Math.floor((new Date(today.getFullYear(),today.getMonth(),today.getDate())-new Date(date.getFullYear(),date.getMonth(),date.getDate()))/86400000);
      const group=C.state.navigation.order==='topic'?C.conversationTopic(r):days<=0?'今天':days===1?'昨天':days<7?'最近 7 天':date.toLocaleDateString('zh-CN',{year:'numeric',month:'long'});
      if(!groups.has(group))groups.set(group,[]);
      groups.get(group).push(r);
    }
    return [...groups].map(([name,runs])=>`<section class="conversation-group"><h3>${e(name)}<span>${runs.length}</span></h3>${runs.map(sessionRow).join('')}</section>`).join('');
  }
  C.refreshConversationList=()=>{const list=document.getElementById('conversation-list');if(list)list.innerHTML=conversationList();};
  function content(group){
    if(!groupAllowed(group))return '<div class="secondary-note">当前身份无法访问此模块。</div>';
    if(group==='analysis'){
      const undo=C.state.conversations[C.state.deletedConversationUndo];
      return `${b(i('plus')+' 新建分析','new-chat','','new-chat')}<div class="conversation-order" role="group" aria-label="会话排列方式">${[['time','按时间'],['topic','按主题']].map(([v,t])=>b(t,'conversation-order',`data-value="${v}" aria-pressed="${C.state.navigation.order===v}"`,C.state.navigation.order===v?'active':'ghost')).join('')}</div><div id="conversation-list" class="conversation-list">${conversationList()}</div>${undo?.deletedAt&&C.conversationAuthorized(undo)?`<div id="session-undo" class="session-undo"><span>已删除一条会话</span>${b('撤销','session-restore','','ghost')}</div>`:''}<div class="secondary-shortcuts">${secondaryLink('scenarios','分析案例','grid')}${C.can('review')?secondaryLink('review','待我决定 · '+C.state.decisions.filter(x=>x.status==='待处理').length,'check'):''}${secondaryLink('tasks','全部分析会话','clock')}</div>`;
    }
    if(group==='governance')return `<p class="secondary-description">配置、运行与治理</p><nav class="secondary-links" aria-label="管理与治理">${governance.filter(n=>C.can(n[3])).map(n=>secondaryLink(n[0],n[1],n[2])).join('')}</nav><div class="secondary-note">${i('shield')} 功能、数据范围和操作权限分别检查。</div>`;
    if(group==='reports')return `<p class="secondary-description">沉淀每一次分析的成果</p><nav class="secondary-links">${[['all','全部产物','folder'],['报告','分析报告','file'],['图表','图表与视图','chart'],['数据','数据结果','database']].map(([value,title,icon])=>b(i(icon)+e(title),'report-category',`data-value="${value}"`,'nav-item '+(C.state.assetFilter===value?'active':''))).join('')}</nav><h3 class="secondary-section-title">最近产物</h3><div class="secondary-links">${C.state.artifacts.filter(a=>C.state.role!=='manager'||(a.contract?.region||a.region||'华东')==='华东').slice(0,8).map(a=>b(i('file')+e(a.title),'asset-open',`data-id="${e(a.id)}"`,'nav-item')).join('')}</div>`;
    if(group==='plugins'||group==='boards')return C.workspaceSecondary?.(group)||secondaryLink(group,'查看全部',group==='boards'?'chart':'code');
    if(group==='automations')return `${b(i('plus')+' 新建定时任务','automation-new','','new-chat')}<p class="secondary-description">按计划刷新，持续追踪变化</p>${secondaryLink('automations','全部定时任务','clock')}<h3 class="secondary-section-title">我的任务</h3><div class="secondary-links">${C.state.automations.map(a=>b(i(a.status==='运行中'?'play':'pause')+e(a.name),'automation-detail',`data-id="${e(a.id)}"`,'nav-item')).join('')}</div>`;
    return `${secondaryLink('design','设计体系与体验指南','grid')}<div class="secondary-note">交互规范、组件与原型状态指南。</div>`;
  }
  function secondary(group){
    const pinLabel=compact()?'关闭导航':C.state.navigation.pinned?'收起侧边栏':'固定侧边栏';
    return `<header class="secondary-header"><a href="#${group==='governance'?(governance.find(n=>C.can(n[3]))?.[0]||'design'):group}" class="secondary-brand">${group==='analysis'?'Compass':e(labels[group]||'Compass')}<span>${group==='analysis'?'分析空间':''}</span></a><div class="secondary-header-actions">${group==='analysis'&&C.can('analyze')?b(i('search'),'conversation-search-open','aria-label="搜索分析会话" title="搜索分析会话 · ⌘ / Ctrl K"','ghost icon-btn'):''}${b(i(compact()?'close':'menu'),'sidebar-pin',`aria-label="${pinLabel}" title="${pinLabel}" aria-expanded="${C.state.navigation.pinned}"`,'ghost icon-btn')}</div></header><div class="secondary-content">${content(group)}</div><footer class="secondary-foot"><span class="workspace-dot"></span><span>${e(C.state.tenant)}</span><small>工作空间</small></footer>`;
  }
  C.navigationHTML=(route,label,scope)=>{
    const active=C.primaryGroup(route);
    hoverGroup=null;previewOpen=false;
    document.body.classList.toggle('sidebar-collapsed',!C.state.navigation.pinned);
    document.body.classList.remove('nav-preview');
    const rail=(n)=>`<a href="#${n[0]==='governance'?(governance.find(g=>C.can(g[3]))?.[0]||'design'):n[0]}" class="rail-item ${active===n[0]?'active':''}" data-nav-group="${n[0]}" aria-label="${n[1]}" title="${n[1]}" aria-controls="secondary-sidebar" aria-expanded="${active===n[0]&&C.state.navigation.pinned&&!compact()}" ${active===n[0]?'aria-current="page"':''}>${i(n[2])}<span class="rail-tooltip" role="tooltip">${n[1]}</span></a>`;
    return `<div class="backdrop" data-action="menu-close"></div><nav class="primary-rail" aria-label="一级导航"><a class="rail-logo" href="#analysis" title="Compass" aria-label="Compass 分析首页">${i('compass')}</a><div class="rail-main">${primary.filter(n=>C.can(n[3])).map(rail).join('')}${governance.some(n=>C.can(n[3]))?'<div class="rail-divider"></div>'+rail(['governance','管理与治理','shield']):''}</div><div class="rail-bottom">${rail(['design','设计体系','grid'])}<button class="rail-profile" data-action="profile" aria-label="个人设置" title="${e(C.currentAccount().name)} · ${e(C.roles[C.state.role])}">${e(C.currentAccount().name[0])}</button></div></nav><aside id="secondary-sidebar" class="sidebar secondary-sidebar" aria-label="二级导航">${secondary(active)}</aside><div class="shell"><header class="topbar"><div class="topbar-left">${b(i('menu'),'menu-toggle','aria-label="展开导航" aria-expanded="false"','ghost icon-btn mobile-toggle')}<span class="breadcrumb"><strong>${e(labels[active]||label)}</strong>${route.startsWith('chat/')?'<span>/</span>分析会话':''}</span><span class="scope-label">${e(scope)}</span></div><div class="topbar-right"><span class="prototype-tag">交互原型 · 合成数据</span><label for="role-switch">体验身份</label><select id="role-switch" class="role-select" data-action="role-switch" aria-label="切换体验身份">${Object.entries(C.roles).map(([id,t])=>`<option value="${id}" ${C.state.role===id?'selected':''}>${t}</option>`).join('')}</select>${b(i('search'),'search','aria-label="全局搜索"','ghost icon-btn')}${b(i('bell'),'notifications','aria-label="通知中心"','ghost icon-btn')}</div></header><main id="main" class="main" tabindex="-1"></main></div>`;
  };
  function accessibility(){
    const aside=document.getElementById('secondary-sidebar');
    if(!aside)return;
    const mobileOpen=mobile()&&document.body.classList.contains('menu-open');
    const visible=mobile()?mobileOpen:!floating()||previewOpen||document.body.classList.contains('menu-open');
    aside.inert=!visible;
    aside.setAttribute('aria-hidden',String(!visible));
    const rail=document.querySelector('.primary-rail');
    if(rail){rail.inert=mobile()&&!mobileOpen;rail.setAttribute('aria-hidden',String(rail.inert));}
    const shell=document.querySelector('.shell');if(shell)shell.inert=mobileOpen;
    document.querySelectorAll('[data-nav-group]').forEach(el=>el.setAttribute('aria-expanded',String(visible&&(hoverGroup||current())===el.dataset.navGroup)));
  }
  C.navigationDidRender=()=>{accessibility();};
  function openPreview(group){
    if(!floating()||document.getElementById('modal')?.open)return;
    clearTimeout(leaveTimer);
    const aside=document.getElementById('secondary-sidebar');
    if(!aside)return;
    if(group!==hoverGroup){aside.innerHTML=secondary(group);hoverGroup=group;}
    previewOpen=true;document.body.classList.add('nav-preview');accessibility();
  }
  function closePreview(force=false){
    clearTimeout(hoverTimer);clearTimeout(leaveTimer);
    if(!force&&document.activeElement?.closest('#secondary-sidebar'))return;
    previewOpen=false;document.body.classList.remove('nav-preview');accessibility();
  }
  C.closeNavigation=()=>{document.body.classList.remove('menu-open');closePreview(true);accessibility();};
  C.handlers['sidebar-pin']=()=>{
    if(compact()){C.closeNavigation();document.getElementById('main')?.focus();return;}
    const target=hoverGroup;
    C.state.navigation.pinned=!C.state.navigation.pinned;C.save();
    if(C.state.navigation.pinned&&target&&target!==current()){
      C.go(target==='governance'?governance.find(n=>C.can(n[3]))?.[0]||'design':target);
    }else C.render();
    if(!C.state.navigation.pinned)document.getElementById('main')?.focus();
  };
  C.handlers['conversation-order']=el=>{
    C.state.navigation.order=el.dataset.value;C.save();
    document.querySelectorAll('[data-action="conversation-order"]').forEach(x=>{const selected=x.dataset.value===el.dataset.value;x.classList.toggle('active',selected);x.setAttribute('aria-pressed',String(selected));});
    const list=document.getElementById('conversation-list');if(list)list.innerHTML=conversationList();
  };
  C.handlers['report-category']=el=>{C.state.assetFilter=el.dataset.value;C.save();C.go('reports');};
  C.handlers['menu-toggle']=()=>{
    document.body.classList.toggle('menu-open');
    document.querySelector('.mobile-toggle')?.setAttribute('aria-expanded',String(document.body.classList.contains('menu-open')));
    accessibility();
    if(document.body.classList.contains('menu-open'))document.querySelector('.primary-rail a')?.focus();
  };
  C.handlers['menu-close']=C.closeNavigation;
  let searchMatches=[],searchIndex=0;
  const highlight=(text,query)=>{const value=String(text||''),term=query.trim().split(/\s+/)[0];if(!term)return e(value);const at=value.toLowerCase().indexOf(term.toLowerCase());return at<0?e(value):e(value.slice(0,at))+'<mark>'+e(value.slice(at,at+term.length))+'</mark>'+e(value.slice(at+term.length));};
  function searchPreview(r,query){
    const texts=[r.prompt,...(r.transcript||[]).map(m=>m.text)].filter(Boolean);
    const terms=query.toLowerCase().split(/\s+/).filter(Boolean);
    const text=String(texts.find(t=>terms.some(term=>t.toLowerCase().includes(term)))||texts.at(-1)||C.conversationTopic(r));
    const index=terms.length?Math.max(0,text.toLowerCase().indexOf(terms[0])):0;
    return (index>28?'…':'')+text.slice(Math.max(0,index-28),Math.max(0,index-28)+105)+(text.length>index+105?'…':'');
  }
  function updateSearch(){
    const input=document.getElementById('conversation-search');if(!input)return;
    const query=input.value.trim(),terms=query.toLowerCase().split(/\s+/).filter(Boolean);
    searchMatches=C.conversations().filter(r=>{const hay=[C.conversationTitle(r),C.conversationTopic(r),r.prompt,...(r.transcript||[]).map(m=>m.text)].join(' ').toLowerCase();return terms.every(term=>hay.includes(term));});
    searchIndex=0;
    document.getElementById('conversation-search-caption').textContent=(query?'搜索结果':'最近会话')+' · '+searchMatches.length;
    document.getElementById('conversation-search-results').innerHTML=searchMatches.length?searchMatches.map((r,index)=>`<button type="button" role="option" tabindex="-1" id="conversation-search-option-${index}" aria-selected="${index===0}" class="cp-result ${index===0?'selected':''}" data-action="conversation-search-select" data-task-id="${e(r.taskId)}"><span class="cp-result-icon">${i('spark')}</span><span class="cp-result-copy"><strong>${highlight(C.conversationTitle(r),query)}</strong><small>${highlight(searchPreview(r,query),query)}</small><span>${e(C.conversationTopic(r))} · ${new Date(C.conversationTime(r)).toLocaleDateString('zh-CN',{month:'long',day:'numeric'})}</span></span><span class="cp-enter" aria-hidden="true">↵</span></button>`).join(''):'<div class="cp-empty">'+i('search')+'<h3>没有匹配的分析会话</h3><p>试试标题、主题，或对话里的一句话。</p></div>';
    if(searchMatches.length)input.setAttribute('aria-activedescendant','conversation-search-option-0');else input.removeAttribute('aria-activedescendant');
  }
  function selectSearch(index){
    if(!searchMatches.length)return;
    searchIndex=(index+searchMatches.length)%searchMatches.length;
    document.querySelectorAll('.cp-result').forEach((el,n)=>{el.classList.toggle('selected',n===searchIndex);el.setAttribute('aria-selected',String(n===searchIndex));});
    const result=document.getElementById('conversation-search-option-'+searchIndex);
    document.getElementById('conversation-search').setAttribute('aria-activedescendant',result.id);result.scrollIntoView({block:'nearest'});
  }
  C.handlers['conversation-search-open']=()=>{
    if(!C.isSignedIn())return;
    if(!C.can('analyze'))return C.handlers.denied?.();
    if(document.getElementById('modal').open){if(document.getElementById('conversation-search'))document.getElementById('conversation-search').focus();return;}
    C.closeNavigation();
    C.modal('搜索分析会话',`<div class="cp-input-row">${i('search')}<input id="conversation-search" type="search" role="combobox" aria-label="搜索分析会话" aria-autocomplete="list" aria-expanded="true" aria-controls="conversation-search-results" placeholder="搜索标题或对话内容…" autocomplete="off">${b('Esc','close-modal','aria-label="关闭搜索"','ghost cp-escape')}</div><div id="conversation-search-caption" class="cp-caption"></div><div id="conversation-search-results" role="listbox" aria-label="匹配的分析会话"></div>`,`<div class="cp-help"><span><kbd>↑</kbd><kbd>↓</kbd> 选择</span><span><kbd>↵</kbd> 打开会话</span><span>搜索当前授权的全部对话</span></div>`);
    const dialog=document.getElementById('modal');dialog.classList.add('command-palette');dialog.querySelector('.modal-head').innerHTML='<h2 id="modal-title" class="sr-only">搜索分析会话</h2>';updateSearch();document.getElementById('conversation-search').focus();
  };
  C.handlers['conversation-search-select']=el=>{
    const r=C.state.conversations[el.dataset.taskId];if(!C.conversationVisible(r))return C.toast('当前会话不可用。');
    C.closeModal();C.go('chat/'+r.taskId);
  };
  document.addEventListener('input',event=>{if(event.target.id==='conversation-search')updateSearch();});
  document.addEventListener('pointerover',event=>{
    if(event.pointerType==='touch')return;
    const rail=event.target.closest('[data-nav-group]');
    if(rail&&!rail.contains(event.relatedTarget)){clearTimeout(hoverTimer);clearTimeout(leaveTimer);hoverTimer=setTimeout(()=>openPreview(rail.dataset.navGroup),120);}
    if(event.target.closest('#secondary-sidebar'))clearTimeout(leaveTimer);
  });
  document.addEventListener('pointerout',event=>{
    const from=event.target.closest('[data-nav-group],#secondary-sidebar');
    if(!from)return;
    if(event.relatedTarget?.closest?.('[data-nav-group],#secondary-sidebar'))return;
    clearTimeout(hoverTimer);clearTimeout(leaveTimer);leaveTimer=setTimeout(()=>closePreview(),240);
  });
  document.addEventListener('focusin',event=>{
    const rail=event.target.closest('[data-nav-group]');
    if(rail)openPreview(rail.dataset.navGroup);
    else if(!event.target.closest('#secondary-sidebar'))closePreview();
  });
  document.addEventListener('keydown',event=>{
    if(!C.isSignedIn())return;
    if(event.isComposing)return;
    if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'&&C.can('analyze')){event.preventDefault();C.handlers['conversation-search-open']();return;}
    if(event.target.id==='conversation-search'){
      if(event.key==='Escape'){event.preventDefault();C.closeModal();return;}
      if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();selectSearch(searchIndex+(event.key==='ArrowDown'?1:-1));return;}
      if(event.key==='Enter'&&!event.isComposing){event.preventDefault();if(searchMatches[searchIndex])C.handlers['conversation-search-select']({dataset:{taskId:searchMatches[searchIndex].taskId}});return;}
    }

    if(event.key==='Tab'&&mobile()&&document.body.classList.contains('menu-open')&&!document.getElementById('modal').open){
      const items=[...document.querySelectorAll('.primary-rail a,.primary-rail button,#secondary-sidebar a,#secondary-sidebar button:not([disabled]),#secondary-sidebar input,#secondary-sidebar select')].filter(el=>el.getClientRects().length&&!el.closest('[inert]'));
      if(event.shiftKey&&document.activeElement===items[0]){event.preventDefault();items.at(-1)?.focus();}
      else if(!event.shiftKey&&document.activeElement===items.at(-1)){event.preventDefault();items[0]?.focus();}
    }
    const rail=event.target.closest('[data-nav-group]');
    if(rail&&event.key==='ArrowRight'){event.preventDefault();openPreview(rail.dataset.navGroup);document.querySelector('#secondary-sidebar a,#secondary-sidebar button')?.focus();}
    if(event.key==='Escape'&&!document.getElementById('modal').open&&(previewOpen||document.body.classList.contains('menu-open'))){
      const group=hoverGroup||current();C.closeNavigation();
      const el=mobile()?document.querySelector('.mobile-toggle'):document.querySelector(`[data-nav-group="${group}"]`);
      el?.focus();closePreview(true);
    }
  });
  document.addEventListener('click',event=>{
    const rail=event.target.closest('[data-nav-group]');
    if(rail&&floating()){
      // On a touch device, a second tap on the selected primary item opens its drawer.
      if(C.primaryGroup(C.route())===rail.dataset.navGroup){event.preventDefault();openPreview(rail.dataset.navGroup);return;}
    }
    if(!event.target.closest('.primary-rail,#secondary-sidebar,.mobile-toggle'))closePreview(true);
  });
  window.addEventListener('resize',()=>{if(!compact())document.body.classList.remove('menu-open');accessibility();});
})();
