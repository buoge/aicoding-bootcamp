/* Conversation identity survives navigation, revisions, role changes and reloads. */
(() => {
  'use strict';
  const C = window.C;
  C.state.conversations ||= {};
  C.state.navigation ||= {pinned:true,order:'time',query:''};
  const authorized = r => Boolean(r) && C.can('analyze') && (C.state.role !== 'manager' || r.region === '华东');
  const visible = r => authorized(r) && !r.deletedAt;
  const originalSave = C.save;
  function collect() {
    for (const r of Object.values(C.state.runs || {})) {
      if (r.taskId) C.state.conversations[r.taskId] = r;
    }
  }
  for (const r of [...(C.state.runArchives || []), ...(C.state.runHistory || [])]) {
    if (r.taskId && !C.state.conversations[r.taskId]) C.state.conversations[r.taskId] = r;
  }
  collect();
  C.save = () => {collect(); originalSave();};
  const topics = {
    S01:'经营表现',S02:'商品与库存',S03:'数据准备',S04:'数据准备',
    S05:'经营表现',S06:'增长研究',S07:'商品与库存',S08:'增长研究',
    S09:'增长研究',S10:'经营表现',S11:'监控与应用',S12:'监控与应用'
  };
  C.conversationTopic = r => r.topic || topics[r.id] || '其他分析';
  C.conversationTitle = r => r.title || r.prompt || C.scenarios.find(s => s.id === r.id)?.prompt || '未命名分析';
  C.conversationTime = r => r.updatedAt || r.createdAt || r.archivedAt || '2026-10-18T08:00:00+08:00';
  C.conversationVisible = visible;
  C.conversationAuthorized = authorized;
  C.conversationUnread = r => !r.deletedAt && (r.unread === true || (!r.readAt && (r.transcript?.length || r.events?.length)) || (r.lastActivityAt && r.lastActivityAt > r.readAt));
  C.onConversationActivity = r => {
    const now=new Date().toISOString();
    r.lastActivityAt=now;
    const route=C.route?.()||'';
    if(route==='chat/'+r.taskId || (route==='scenario/'+r.id && C.state.runs[r.id]?.taskId===r.taskId)){
      r.readAt=now;r.unread=false;
    }else r.unread=true;
    C.refreshConversationList?.();
  };
  C.conversations = () => {
    collect();
    return Object.values(C.state.conversations).filter(visible)
      .sort((a,b) => C.conversationTime(b).localeCompare(C.conversationTime(a)) || a.taskId.localeCompare(b.taskId));
  };
  C.activateConversation = taskId => {
    collect();
    const r = C.state.conversations[taskId];
    if (!r || !visible(r)) return null;
    C.state.runs[r.id] = r;
    C.activeConversation = taskId;
    r.readAt=new Date().toISOString();r.unread=false;
    return r;
  };
  C.startConversation = (scenarioId, prompt) => {
    if (!C.can('analyze')) return C.handlers.denied?.();
    collect();
    const s = C.scenarios.find(s => s.id === scenarioId) || C.scenarios[0];
    const previous = C.state.runs[s.id];
    if (previous) {
      C.state.runHistory ||= [];
      if (!C.state.runHistory.some(r => r.taskId === previous.taskId)) {
        C.state.runHistory.unshift({...structuredClone(previous),archivedAt:new Date().toISOString()});
      }
    }
    delete C.state.runs[s.id];
    C.state.customQuestion = {scenario:s.id,text:prompt || s.prompt};
    const r = C.scenarioRun(s.id);
    r.createdAt = r.updatedAt = new Date().toISOString();
    C.activeConversation = r.taskId;
    C.state.draft = '';
    C.state.navigation.query = '';
    C.save();
    C.go('chat/' + r.taskId);
    return r;
  };
  C.initConversations = () => {
    if (C.state.conversationSeeded) return;
    C.state.conversationSeeded = true;
    // Existing work is migrated as-is; samples only enrich an empty workspace.
    if (Object.keys(C.state.conversations).length || Object.keys(C.state.runs).length) {C.save();return;}
    const examples = [
      ['S05','华东收入下降，主要发生在哪个渠道？','2026-10-20T09:20:00+08:00','请把库存因素和退款因素分别说明。'],
      ['S02','R100 跑鞋热门尺码的库存分布','2026-10-19T15:30:00+08:00','继续按新老客拆分渠道表现。'],
      ['S04','九月财务与经营净销售额对账','2026-10-18T11:10:00+08:00','剩余的差额应该交给谁核对？']
    ];
    for (const [id,prompt,date,followup] of examples) {
      const s=C.scenarios.find(s=>s.id===id);
      C.state.customQuestion={scenario:id,text:prompt};
      const r=C.scenarioRun(id);
      r.taskId='demo-'+id;
      r.title=prompt;r.phase='completed';r.step=s.steps.length;
      r.createdAt=r.updatedAt=date;r.demo=true;
      r.transcript=[
        {role:'user',text:prompt,time:date,version:1},
        {role:'assistant',text:s.insight+'。'+s.conclusion,time:date,version:1,kind:'result'},
        {role:'user',text:followup,time:date,version:1},
        {role:'assistant',text:id==='S05'?'退款假设已被反证。库存缺货与转化下降同时出现，补货延迟需要业务核实；当前证据支持继续排查库存，尚不足以直接证明因果关系。':id==='S02'?'小程序老客收入占比为 76.4%，平台渠道带来更多新客。下一步可以选择渠道和会员分组，保留相同的时间窗口进行比较。':'已解释 135,000 元，剩余 5,000 元涉及 5 笔订单，建议由财务核对入账时间与原始凭证。可以打开下方产物，查看差异桥接和证据。',time:date,version:1,kind:'result'}
      ];
      r.events=[{time:'09:20',text:'合成示例会话 · 口径与数据验证完成',kind:'result'}];
      C.state.conversations[r.taskId]=r;
    }
    C.state.customQuestion=null;
    C.save();
  };
  C.handlers['session-rename']=el=>{
    const r=C.state.conversations[el.dataset.taskId];
    if(!visible(r))return C.toast('当前会话不可用。');
    C.modal('重命名分析会话',`<form data-action="session-rename-save" data-task-id="${C.esc(r.taskId)}"><label class="field" for="session-title">会话名称<input id="session-title" maxlength="120" value="${C.esc(C.conversationTitle(r))}" required autocomplete="off"></label><p class="muted small">只修改列表中的名称，原始问题与对话记录会保留。</p><button type="submit" hidden>保存</button></form>`,C.btn('取消','close-modal')+C.btn('保存名称','session-rename-save',`data-task-id="${C.esc(r.taskId)}"`,'primary'));
    const input=document.getElementById('session-title');input.focus();input.select();
  };
  C.handlers['session-rename-save']=el=>{
    const r=C.state.conversations[el.dataset.taskId];
    if(!visible(r))return C.toast('当前会话不可用。');
    const title=document.getElementById('session-title')?.value.trim();
    if(!title){document.getElementById('session-title')?.reportValidity();return;}
    r.title=title.slice(0,120);C.save();C.closeModal();C.render();C.toast('会话名称已更新。');
  };
  C.handlers['session-delete']=el=>{
    const r=C.state.conversations[el.dataset.taskId];
    if(!visible(r))return C.toast('当前会话不可用。');
    C.modal('删除这条会话？',`<p>将「${C.esc(C.conversationTitle(r))}」移出会话列表和搜索结果。</p><p class="muted small">删除后可在侧栏撤销，已保存到报告空间的产物会保留。</p>`,C.btn('取消','close-modal')+C.btn('删除会话','session-delete-confirm',`data-task-id="${C.esc(r.taskId)}"`,'danger'));
  };
  C.handlers['session-delete-confirm']=el=>{
    const r=C.state.conversations[el.dataset.taskId];
    if(!visible(r))return C.toast('当前会话不可用。');
    C.scenarioStopDemo?.(r.taskId);
    r.deletedAt=new Date().toISOString();
    C.state.deletedConversationUndo=r.taskId;
    C.save();C.closeModal();
    const route=C.route();
    if(route==='chat/'+r.taskId||(route==='scenario/'+r.id&&C.state.runs[r.id]?.taskId===r.taskId))C.go('analysis');else C.render();
    C.toast('会话已删除，可从侧栏撤销。');
  };
  C.handlers['session-restore']=()=>{
    const r=C.state.conversations[C.state.deletedConversationUndo];
    if(!r?.deletedAt||!authorized(r))return C.toast('当前身份无法恢复此会话。');
    delete r.deletedAt;C.state.deletedConversationUndo=null;C.save();C.render();C.toast('会话已恢复。');
  };
})();
