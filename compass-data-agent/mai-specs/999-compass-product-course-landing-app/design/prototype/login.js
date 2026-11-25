/* Local role selection only; no credentials or authentication service. */
(() => {
  'use strict';
  const C = window.C, e = C.esc, i = C.icon;
  let backgroundPaused = false;
  C.initLoginBackground = () => {
    C.disposeLoginBackground?.();
    const container = document.querySelector('.login-background');
    const button = document.querySelector('.login-animation-toggle');
    if (!container || !button) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let animation = null;
    const updateButton = () => {
      const label = backgroundPaused ? '播放背景动画' : '暂停背景动画';
      button.hidden = media.matches || !animation;
      button.setAttribute('aria-label', label);
      button.setAttribute('aria-pressed', String(backgroundPaused));
      button.title = label;
      button.innerHTML = i(backgroundPaused ? 'play' : 'pause');
    };
    const mount = () => {
      animation?.dispose();
      // A fresh canvas also recovers from a previous context loss or motion preference.
      container.innerHTML = '<canvas aria-hidden="true"></canvas>';
      try {
        animation = window.CompassLoginBackground?.mount(container, {paused:backgroundPaused,reduced:media.matches}) || null;
      } catch { animation = null; }
      container.dataset.state = animation ? (media.matches || backgroundPaused ? 'paused' : 'playing') : 'fallback';
      updateButton();
    };
    C.handlers['login-animation-toggle'] = () => {
      if (!animation) return;
      backgroundPaused = !backgroundPaused;
      animation.setPaused(backgroundPaused);
      container.dataset.state = backgroundPaused ? 'paused' : 'playing';
      updateButton();
    };
    mount();
    media.addEventListener('change', mount);
    C.disposeLoginBackground = () => {
      animation?.dispose();
      animation = null;
      media.removeEventListener('change', mount);
      C.disposeLoginBackground = null;
    };
  };
  const sessionKey = 'compass-prototype-session';
  C.accounts = {
    executive: {name:'许岚',icon:'chart',description:'看清集团经营全貌，追问关键变化。',scope:'集团经营 · 决策洞察'},
    analyst: {name:'林知远',icon:'spark',description:'从经营问题出发，追查证据、沉淀报告。',scope:'业务分析 · 数据与报告'},
    manager: {name:'陈嘉宁',icon:'users',description:'聚焦华东经营，协调分析与团队决策。',scope:'华东大区 · 授权渠道'},
    admin: {name:'周予安',icon:'settings',description:'管理组织、数据接入与平台能力。',scope:'企业管理 · 配置与治理'},
    operator: {name:'何川',icon:'play',description:'跟进任务运行、调度与平台质量。',scope:'运行元数据 · 业务内容隐藏'},
    auditor: {name:'苏谨',icon:'shield',description:'审阅安全记录，检查授权与质量。',scope:'审计与质量 · 只读治理'}
  };
  const validRole = role => Object.hasOwn(C.roles, role);
  let sessionRole = null;
  try {
    const saved = sessionStorage.getItem(sessionKey);
    if (validRole(saved)) sessionRole = saved;
  } catch { /* Storage restrictions still allow a session until reload. */ }
  if (sessionRole) C.state.role = sessionRole;
  C.isSignedIn = () => validRole(sessionRole);
  C.currentAccount = () => C.accounts[C.state.role];
  C.selectIdentity = role => {
    if (!validRole(role)) return false;
    C.disposeLoginBackground?.();
    C.scenarioStopDemo?.();
    sessionRole = C.state.role = role;
    C.state.draft = '';
    C.state.attachments = [];
    if (C.state.navigation) C.state.navigation.query = '';
    try { sessionStorage.setItem(sessionKey, role); } catch { /* In-memory fallback. */ }
    C.save();
    return true;
  };
  C.identityHome = () => C.can('analyze') ? 'analysis' : C.can('admin-overview') ? 'admin-overview' : 'design';
  const replaceRoute = route => {
    history.replaceState(null, '', '#'+route);
    C.render();
    window.scrollTo(0, 0);
    document.getElementById('main')?.focus();
  };
  C.handlers['login-role'] = el => {
    if (C.selectIdentity(el.dataset.role)) replaceRoute(C.identityHome());
  };
  C.handlers.logout = () => {
    C.scenarioStopDemo?.();
    if (document.getElementById('modal').open) C.closeModal();
    C.closeNavigation?.();
    sessionRole = null;
    try { sessionStorage.removeItem(sessionKey); } catch { /* In-memory session cleared. */ }
    C.state.draft = '';
    C.state.attachments = [];
    if (C.state.navigation) C.state.navigation.query = '';
    C.save();
    clearTimeout(C.toastTimer);
    document.getElementById('toast').classList.remove('visible');
    replaceRoute('login');
  };
  C.renderLogin = () => {
    C.disposeLoginBackground?.();
    C.scenarioStopDemo?.();
    C.closeNavigation?.();
    if (document.getElementById('modal').open) C.closeModal();
    if (location.hash !== '#login') history.replaceState(null, '', '#login');
    document.body.classList.add('login-page');
    document.title = 'Compass · 选择账号登录';
    document.getElementById('app').innerHTML = `<main id="main" class="login-layout" tabindex="-1">
      <section class="login-story" aria-label="Compass 经营分析工作台">
        <div class="login-background" aria-hidden="true"></div>
        <button class="login-animation-toggle" type="button" data-action="login-animation-toggle" aria-label="暂停背景动画" aria-pressed="false" hidden></button>
        <div class="login-brand"><span class="login-brand-mark">${i('compass')}</span>Compass</div>
        <div class="login-story-copy"><p class="login-eyebrow">经营分析工作台</p><h2>把经营问题，<br>追查到有据可依。</h2><p>从一个好问题出发，找到变化背后的原因，<br class="login-desktop-break">让每一次经营判断都有依据。</p>
        <div class="login-example"><span>${i('spark')} 从这里开始</span><p>“销售在增长，<br>为什么渠道贡献却收窄了？”</p><div>理解业务 ${i('chevron')} 追查证据 ${i('chevron')} 辅助决策</div></div></div>
        <p class="login-story-foot">行野运动集团 <span>·</span> 演示工作空间</p>
      </section>
      <section class="login-access" aria-labelledby="login-title">
        <div class="login-heading"><span class="login-workspace">${i('users')} 行野运动集团</span><h1 id="login-title">选择一个账号，<br>开始体验。</h1><p>已为你准备六种身份，点击即可进入，无需密码。</p></div>
        <div class="login-accounts">${Object.entries(C.roles).map(([role,label])=>{const a=C.accounts[role];return `<button type="button" class="login-account" data-action="login-role" data-role="${e(role)}" aria-label="以${e(label)}身份登录"><span class="login-account-top"><span class="login-account-icon">${i(a.icon)}</span><span class="login-account-person">${e(a.name)}</span>${i('arrow','login-account-arrow')}</span><strong>${e(label)}</strong><span class="login-account-description">${e(a.description)}</span><span class="login-account-scope">${e(a.scope)}</span></button>`;}).join('')}</div>
        <p class="login-note">${i('shield')} 交互原型 · 合成演示数据</p>
      </section>
    </main>`;
    C.initLoginBackground();
  };
  window.addEventListener('pagehide', () => C.disposeLoginBackground?.());
  window.addEventListener('pageshow', event => { if (event.persisted && !C.isSignedIn()) C.initLoginBackground(); });
})();
