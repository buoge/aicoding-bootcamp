/** Portable browser regression for the local Compass prototype.
 * PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROME_BIN=/path/to/chrome node prototype-check.mjs
 */
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {dirname,join} from 'node:path';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
const specifier=process.env.PLAYWRIGHT_MODULE;
const {chromium}=await import(specifier?pathToFileURL(specifier).href:'playwright');
const baseURL=(process.env.PROTOTYPE_URL||pathToFileURL(join(dirname(fileURLToPath(import.meta.url)),'../design/prototype/index.html')).href).replace(/#.*$/,'');
const evidence=await mkdtemp(join(tmpdir(),'compass-verification-'));

async function legacyControl(page,action){
 const details=page.locator('.demo-legacy');
 if(await details.count()&&!await details.evaluate(el=>el.open))await details.locator(':scope > summary').click();
 return page.locator(`[data-action="${action}"]`);
}

async function checkLogin(page){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(baseURL+'#scenario/S05');
 assert.equal(await page.locator('.login-account').count(),6);
 assert.equal(await page.locator('.primary-rail').count(),0);
 await page.keyboard.press('ControlOrMeta+k');assert(!await page.locator('dialog').isVisible());
 const accounts=[['executive','许岚'],['analyst','林知远'],['manager','陈嘉宁'],['admin','周予安'],['operator','何川'],['auditor','苏谨']];
 for(const [role,name] of accounts){
  await page.locator(`[data-action="login-role"][data-role="${role}"]`).click();
  assert.equal(await page.locator('#role-switch').inputValue(),role);
  assert.equal(new URL(page.url()).hash,['operator','auditor'].includes(role)?'#admin-overview':'#analysis');
  await page.reload();assert.equal(await page.locator('#role-switch').inputValue(),role);
  await page.getByRole('button',{name:'个人设置',exact:true}).click();
  assert((await page.locator('dialog').innerText()).includes(name));
  await page.getByRole('button',{name:'注销当前账号',exact:true}).click();
  assert.equal(await page.locator('.login-account').count(),6);
  assert.equal(await page.locator('.primary-rail').count(),0);
 }
 await page.locator('[data-role="analyst"]').click();
 const saved=await page.evaluate(()=>JSON.stringify([C.state.artifacts,C.state.conversations]));
 await page.locator('#role-switch').selectOption('manager');await page.reload();
 assert.equal(await page.locator('#role-switch').inputValue(),'manager');
 await page.goto(baseURL+'#reports');
 await page.getByRole('button',{name:'个人设置',exact:true}).click();
 await page.getByRole('button',{name:'注销当前账号',exact:true}).click();
 await page.goBack();assert.equal(await page.locator('.login-account').count(),6);
 await page.goto(baseURL+'#chat/demo-S05');assert.equal(await page.locator('.login-account').count(),6);
 assert.equal(await page.evaluate(()=>JSON.stringify([C.state.artifacts,C.state.conversations])),saved);
 for(const width of [1440,768,390,320]){
  await page.setViewportSize({width,height:900});
  assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));
 }
 await page.getByRole('button',{name:'以业务分析师身份登录',exact:true}).press('Enter');
 await page.getByRole('button',{name:'展开导航',exact:true}).click();
 await page.getByRole('button',{name:'个人设置',exact:true}).click();
 await page.getByRole('button',{name:'注销当前账号',exact:true}).click();
 assert.equal(await page.locator('.login-account').count(),6);
 assert.deepEqual(errors,[]);return {accounts:6,refresh:true,logout:true,routeGuard:true,recordsPreserved:true,mobile:true,errors};
}

async function checkCommon(page){
const errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
const check=(label,yes)=>{if(!yes)throw Error(label);checks.push(label)};
await page.goto(baseURL);
for(const route of ['analysis','tasks','reports','plugins','boards','automations','review','scenarios','design']){await page.evaluate(r=>C.go(r),route);await page.waitForTimeout(80);check('route '+route,await page.locator('main h1').count()>0);}
await page.evaluate(()=>C.go('home'));await page.locator('#question').fill('预测未来12周跑鞋销量');await page.locator('[aria-label="开始分析"]').click();check('free text routing',await page.evaluate(()=>C.route().startsWith('chat/')&&C.state.runs.S07.prompt==='预测未来12周跑鞋销量'));
await page.evaluate(()=>C.go('assets'));await page.locator('[data-action="asset-open"]').first().click();check('asset dialog',await page.locator('dialog').isVisible());await page.locator('[data-action="asset-edit"]').click();await page.locator('#asset-note').fill('人工复核说明：仅表达相关性。');await page.locator('[data-action="asset-edit-save"]').click();check('human edit invalidates verification',await page.evaluate(()=>C.state.artifacts[0].verification==='待验证'&&C.state.artifacts[0].version===4));await page.locator('[data-action="asset-recompute"]').click();check('recompute new version',await page.evaluate(()=>C.state.artifacts[0].version===5));await page.keyboard.press('Escape');
await page.evaluate(()=>C.go('automations'));await page.locator('main [data-action="automation-new"]').click();await page.locator('[data-action="automation-save"]').click();check('automation validation',await page.locator('#auto-error').textContent()!=='');await page.locator('#auto-name').fill('测试周报');await page.locator('#auto-approve').check();await page.locator('[data-action="automation-save"]').click();check('automation created',await page.getByText('测试周报',{exact:false}).count()>0);await page.reload();check('persistence',await page.evaluate(()=>C.state.automations.some(x=>x.name==='测试周报')));
await page.locator('#role-switch').selectOption('auditor');await page.evaluate(()=>C.go('assets'));check('direct route denied',await page.getByText('当前身份无法访问此功能').count()===1);check('nav restricted',await page.locator('nav a[href="#reports"]').count()===0);
await page.locator('#role-switch').selectOption('analyst');await page.evaluate(()=>C.go('home'));await page.locator('[data-action="conversation-search-open"]').click();await page.locator('#conversation-search').fill('凭证');check('search results match conversation content',await page.locator('#conversation-search-results').textContent().then(x=>x.includes('凭证')||x.includes('对账')));await page.keyboard.press('Escape');check('escape closes dialog',!await page.locator('dialog').isVisible());
for(const [w,h]of [[1440,1000],[768,1024],[390,844],[375,812],[844,390]]){await page.setViewportSize({width:w,height:h});for(const r of ['analysis','reports','plugins','boards','scenario/S07','scenarios','design']){await page.evaluate(x=>C.go(x),r);await page.waitForTimeout(30);const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);check(`no overflow ${w} ${r}`,!overflow);}if(w===390){await page.evaluate(()=>C.go('home'));await page.screenshot({path:join(evidence,'mobile.png'),fullPage:true});}}
await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>C.go('scenario/S05'));await page.screenshot({path:join(evidence,'scenario.png'),fullPage:true});
check('no JS errors',errors.length===0);return {checks:checks.length,errors};
}
async function checkScenarios(page){
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(baseURL+'#scenario/S05');
await page.evaluate(()=>{C.state.role='admin';C.state.runs={};C.save();C.render();});
await page.screenshot({path:join(evidence,'diagnosis.png'),fullPage:true});
for(let n=1;n<=12;n++){
 const id='S'+String(n).padStart(2,'0');await page.goto(baseURL+'#scenario/'+id);
 await (await legacyControl(page,'sc-demo-speed')).selectOption('600');
 await (await legacyControl(page,'sc-autoplay')).click();
 await page.waitForFunction(id=>C.state.runs[id].phase==='completed'&&C.state.runs[id].demoPlayback?.status==='completed',id,{timeout:20000});
 const phase=await page.evaluate(id=>C.state.runs[id].phase,id);if(phase!=='completed')throw new Error(id+' not completed '+phase);
 assert(await page.locator('.sc-demo-panel').isVisible(), 'Prototype controls belong in the side panel');
 assert(await page.locator('.sc-analysis-summary').count()>0, 'Analysis summary belongs to an assistant message');
 assert(await page.locator('[data-action="sc-artifact-open"]').count()>0, 'Completed analysis exposes an inline artifact card');
 assert(!await page.locator('.sc-workbench>.sc-artifact-panel').count(), 'A fixed result workspace must not replace the conversation');
 assert(!await page.locator('[data-action="sc-save-artifact"]').isVisible(),'Automatic completion keeps the artifact card compact');
 await page.locator('.sc-current-turn [data-action="sc-artifact-open"]').click();
 await page.locator('[data-action="sc-save-artifact"]').click();
 for(const tab of ['evidence','method','result'])await page.locator(`[data-action="sc-tab"][data-tab="${tab}"]`).click();
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);if(overflow)throw Error(id+' desktop overflow');
 console.log(id+' autoplay completed + HITL + inline artifact + saved + tabs');
}
await page.goto(baseURL+'#scenario/S05');
for(const demo of ['failed','budget','reject','partial','expired','revoked','empty','delayed','denied','conflict']){
 await (await legacyControl(page,'sc-demo')).selectOption(demo);
 if(demo==='failed')await page.locator('[data-action="sc-retry"]').click();
 if(demo==='budget'){await (await legacyControl(page,'sc-unblock')).click();await page.locator('[data-scenario-form] input[name="budget"]').fill('50');await page.locator('[data-action="sc-condition-save"]').click();}
 if(demo==='revoked')await (await legacyControl(page,'sc-unblock')).click();
 if(demo==='delayed')await page.locator('[data-action="sc-freshness"]').click();
 if(demo==='conflict')await page.locator('[data-action="sc-conflict-resolve"][data-choice="manual"]').click();
 console.log('state '+demo+' exercised');
}
await (await legacyControl(page,'sc-demo')).selectOption('completed');await (await legacyControl(page,'sc-start')).click();await (await legacyControl(page,'sc-cancel')).click();await (await legacyControl(page,'sc-cancel-ack')).click();await (await legacyControl(page,'sc-resume')).click();
await (await legacyControl(page,'sc-decision-menu')).click();await page.locator('[data-action="sc-decision-create"][data-type="execute"]').click();await page.locator('[data-action="sc-decide"][data-value="partial"]').click();await page.locator('[data-action="sc-partial-save"]').click();
await (await legacyControl(page,'sc-demo')).selectOption('completed');await page.locator('[data-action="sc-publish"]').click();await page.locator('[data-publish-form] select[name="audience"]').selectOption('public');await page.locator('[data-publish-form] input[name="confirm"]').check();await page.locator('[data-action="sc-publish-confirm"]').click();if(!await page.locator('[data-publish-form]').innerText().then(t=>t.includes('受众范围检查未通过')))throw Error('publishing guard missing');await page.locator('[data-action="close-modal"]').first().click();
await page.setViewportSize({width:390,height:844});
for(let n=1;n<=12;n++){const id='S'+String(n).padStart(2,'0');await page.goto(baseURL+'#scenario/'+id);if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error(id+' mobile overflow');}
await page.goto(baseURL+'#scenario/S05');await page.screenshot({path:join(evidence,'diagnosis-mobile.png'),fullPage:true});
assert.deepEqual(errors,[]);return {acceptanceRefs:['AC-DEMO-03','AC-CHAT-11','AC-CHAT-12'],autoplayScenarios:12,completedScenarios:12,exceptionalStates:10,inlineArtifacts:true,mobileLayouts:12,errors};
}
async function checkRegressions(page){
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(baseURL+'#scenario/S01');
await page.evaluate(()=>{C.state.role='analyst';C.state.runs={};C.save();C.render();});
await (await legacyControl(page,'sc-condition')).first().click();await page.locator('[data-scenario-form] select[name="region"]').selectOption('华南');await page.locator('[data-action="sc-condition-save"]').click();
await (await legacyControl(page,'sc-demo')).selectOption('completed');const count=await page.evaluate(()=>C.state.artifacts.length);
await page.locator('[data-action="role-switch"]').selectOption('manager');
if(!await page.locator('#main').innerText().then(t=>t.includes('当前身份无法访问')))throw Error('Scope denied page missing');
await page.evaluate(()=>{for(const action of ['sc-next','sc-tab','sc-save-artifact','sc-download','sc-resume'])C.handlers[action]({dataset:{id:'S01',tab:'evidence'}});});
if(await page.evaluate(()=>C.state.artifacts.length)!==count)throw Error('Late save allowed');
if(await page.evaluate(()=>C.state.runs.S01.region)!=='华南')throw Error('Scope silently overwritten');
await page.reload();if(!await page.locator('#main').innerText().then(t=>t.includes('当前身份无法访问')))throw Error('URL bypass');
await page.locator('[data-action="sc-new-authorized-run"]').click();if(await page.evaluate(()=>C.state.runs.S01.region)!=='华东')throw Error('New scope incorrect');if(await page.evaluate(()=>C.state.runs.S01.phase)!=='ready')throw Error('Inherited old run');
await page.locator('[data-action="role-switch"]').selectOption('admin');await page.goto(baseURL+'#scenario/S05');await (await legacyControl(page,'sc-demo')).selectOption('completed');await page.locator('[data-action="sc-publish"]').click();await page.locator('[data-publish-form] input[name="confirm"]').check();await page.locator('[data-action="sc-publish-confirm"]').click();await page.locator('[data-action="sc-save-artifact"]').click();
const saved=await page.evaluate(()=>JSON.stringify(C.state.artifacts.at(-1)));
await page.locator('[data-action="sc-edit"]').click();await page.locator('[data-edit-form] textarea[name="content"]').fill('人工补充：苏州仓实际到货时间仍待确认。');await page.locator('[data-action="sc-edit-save"]').click();
const edited=await page.evaluate(()=>C.state.runs.S05);if(edited.publication!=='草稿'||!edited.needsValidation||edited.adoption!=='待决定'||edited.publishedVersion)throw Error('Edit stale states '+JSON.stringify(edited));
await page.evaluate(()=>C.handlers['sc-publish']({dataset:{id:'S05',taskId:C.state.runs.S05.taskId}}));if(await page.locator('#modal').evaluate(d=>d.open))throw Error('Unverified publication dialog opened');
if(await page.evaluate(()=>JSON.stringify(C.state.artifacts.at(-1)))!==saved)throw Error('Saved snapshot mutated');
await (await legacyControl(page,'sc-next')).click();await page.locator('[data-action="sc-save-artifact"]').click();if(!await page.evaluate(()=>C.state.artifacts.at(-1).summary.includes('人工补充')))throw Error('Human summary lost');
await page.locator('[data-action="sc-edit"]').click();await page.locator('[data-edit-form] select[name="kind"]').selectOption('style');await page.locator('[data-edit-form] select[name="presentation"]').selectOption('阅读版');await page.locator('[data-edit-form] textarea[name="content"]').fill('should not replace conclusion');await page.locator('[data-action="sc-edit-save"]').click();if(!await page.evaluate(()=>C.state.runs.S05.editedText.includes('人工补充')))throw Error('Style changed facts');
await page.goto(baseURL+'#scenario/S04');await (await legacyControl(page,'sc-demo')).selectOption('completed');await page.locator('[data-action="sc-proposal"]').click();await page.locator('[data-action="sc-action-authorize"]').click();await page.locator('[data-action="sc-decide"][data-value="approve"]').click();await page.locator('[data-action="sc-action-submit"]').click();if(await page.evaluate(()=>C.state.runs.S04.actionState)!=='submitted')throw Error('Action not completed');
await page.setViewportSize({width:390,height:844});for(let n=1;n<=12;n++){await page.goto(baseURL+'#scenario/S'+String(n).padStart(2,'0'));if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile overflow S'+n);}
assert.deepEqual(errors,[]);return {scopeGuard:true,versionIsolation:true,actionReceipt:true,mobileLayouts:12,errors};
}
async function checkAdminPrototype(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const route = name => page.evaluate(name => window.C.go(name), name);
  const tab = name => page.locator(`[data-action="adm-tab"][data-tab="${name}"]`).click();
  const click = name => page.locator(`[data-action="adm-${name}"]`).click();
  const role = name => page.locator('#role-switch').selectOption(name);
  const callHandler = (name, dataset = {}) => page.evaluate(({ name, dataset }) => C.handlers[`adm-${name}`]({ dataset }, {}), { name, dataset });
  await page.goto(baseURL);
  await role('admin');
  const routes = ['admin-overview', 'data', 'capabilities', 'runs', 'quality', 'security', 'memory', 'organization'];
  let tabs = 0;
  for (const name of routes) {
    await route(name);
    await page.locator('.admin-page').waitFor();
    const names = await page.locator('[data-action="adm-tab"]').evaluateAll(items => items.map(item => item.dataset.tab));
    for (const name of names) {
      await tab(name);
      assert.deepEqual(await page.locator('.admin-page [data-action]').evaluateAll(items => items.filter(item => !C.handlers[item.dataset.action]).map(item => item.dataset.action)), []);
      tabs++;
    }
  }
  await route('data');
  await click('source-new');
  await click('source-save');
  assert(await page.locator('#adm-form-error').isVisible(), 'Required connection fields must show validation');
  await page.locator('#adm-source-name').fill('浏览器验收连接');
  await page.locator('#adm-source-secret').fill('demo123');
  await click('source-test');
  assert.match(await page.locator('#adm-connection-result').innerText(), /成功/);
  await click('source-save');
  await page.getByText('浏览器验收连接', { exact: true }).waitFor();

  await route('quality');
  await tab('evaluations');
  await page.locator('#adm-eval-fixture').selectOption('baseline');
  await click('eval-run');
  await tab('releases');
  await click('publish');
  assert.match(await page.locator('#modal-title').innerText(), /阻止/);
  await page.locator('#modal [data-action="adm-goto"]').click();
  await page.locator('#adm-eval-fixture').selectOption('fixed');
  await click('eval-run');
  assert.equal(await page.evaluate(() => C.state.admin.eval.passed), true);

  // A passing candidate does not grant an auditor permission to publish it.
  await role('auditor');
  await tab('releases');
  assert(await page.locator('.admin-readonly').isVisible());
  assert(await page.locator('[data-action="adm-publish"]').isDisabled());
  assert(await page.locator('[data-action="adm-rollback"]').first().isDisabled());
  const beforeAuditorWrites = await page.evaluate(() => JSON.stringify({ production: C.state.admin.production, releases: C.state.admin.releases, evaluation: C.state.admin.eval, retention: C.state.admin.retention, policy: C.state.admin.policies }));
  await callHandler('publish-confirm');
  await callHandler('rollback-confirm', { version: '1.4.1' });
  await callHandler('eval-run');
  await route('security');
  await tab('policies');
  await page.locator('#adm-retention').fill('365');
  assert(await page.locator('[data-action="adm-retention-save"]').isDisabled());
  await callHandler('retention-save');
  await callHandler('policy-save');
  assert.equal(await page.evaluate(() => JSON.stringify({ production: C.state.admin.production, releases: C.state.admin.releases, evaluation: C.state.admin.eval, retention: C.state.admin.retention, policy: C.state.admin.policies })), beforeAuditorWrites, 'Auditor must not mutate management state, even through direct handlers');
  await tab('traces');
  await page.locator('[data-action="adm-trace-detail"]').first().click();
  assert(await page.locator('#modal').isVisible(), 'Auditor can inspect trace details');
  await page.locator('#modal [data-action="adm-close"]').click();
  await tab('audit');
  await click('audit-reveal');
  await page.locator('#adm-audit-reason').fill('核对演示越权事件的影响范围');
  await click('audit-confirm');
  assert.match(await page.locator('.admin-page').innerText(), /DEMO-13800000001/);
  await role('operator');
  assert(!(await page.locator('.admin-page').innerText()).includes('DEMO-13800000001'), 'Sensitive audit view must remask when privilege is lost');

  await role('admin');
  await route('quality');
  await tab('releases');
  await click('publish');
  await click('publish-confirm');
  assert.equal(await page.evaluate(() => C.state.admin.production), '1.5.0');
  await page.locator('[data-action="adm-rollback"]').first().click();
  await click('rollback-confirm');
  assert.equal(await page.evaluate(() => C.state.admin.production), '1.4.2');
  await route('security');
  await tab('policies');
  await page.locator('#adm-retention').fill('365');
  await click('retention-save');
  assert.equal(await page.evaluate(() => C.state.admin.retention), 365);

  await route('runs');
  await tab('tasks');
  await page.locator('[data-action="adm-run-state"]').first().click();
  await page.locator('[data-action="adm-run-resume"][data-id="RUN-2048"]').click();
  await tab('budget');
  await page.locator('#adm-budget').fill('50');
  await click('budget-save');
  assert.equal(await page.evaluate(() => C.state.admin.runs[0].status), '已暂停');
  await route('organization');
  await tab('members');
  await click('member-add');
  await page.locator('#adm-member-name').fill('原型验收用户');
  await page.locator('#adm-member-email').fill('qa@xingye.example');
  await page.locator('#adm-member-department').fill('经营管理部');
  await click('member-save');
  await page.getByText('原型验收用户', { exact: true }).waitFor();
  await tab('roles');
  await page.locator('#adm-role-editing').selectOption('analyst');
  await click('role-load');
  await page.locator('#adm-permission-form input[value="runs"]').check();
  await click('role-save');
  await role('analyst');
  assert(await page.locator('.sidebar a[href="#runs"]').isVisible());
  await route('runs');
  await tab('budget');
  assert(await page.locator('[data-action="adm-budget-save"]').isDisabled(), 'Module access does not confer governance write');
  await page.reload();
  assert(await page.evaluate(() => C.state.grants.analyst.includes('runs')));
  assert(!(await page.evaluate(() => C.state.grants.analyst.includes('governance-write'))));

  await role('admin');
  await page.setViewportSize({ width: 390, height: 844 });
  for (const name of routes) {
    await route(name);
    const size = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    assert(size.scroll <= size.width + 1, `Unexpected mobile document overflow: ${name}`);
  }
  assert.deepEqual(errors, []);
  return { routes: routes.length, tabs, browserErrors: errors, governance: 'auditor read-only, direct write handlers denied, admin write preserved', criticalFlows: 'source validation/test/save; evaluation gate; publish/rollback; audit masking; pause/resume/budget stop; member creation; capability grants and reload; 390px layout' };
}

async function checkIntegration(page){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(baseURL);
 await page.locator('#question').fill('上周运动鞋卖了多少');await page.locator('[aria-label="开始分析"]').click();
 await (await legacyControl(page,'sc-demo')).selectOption('completed');
 const old=await page.evaluate(()=>C.state.runs.S01.taskId);
 await page.evaluate(()=>C.go('home'));await page.locator('#question').fill('上个月运动服装卖了多少');await page.locator('[aria-label="开始分析"]').click();
 assert(await page.evaluate(old=>C.state.runs.S01.taskId!==old&&C.state.runs.S01.phase==='ready'&&C.state.runHistory.length===1,old));
 await page.evaluate(()=>C.go('tasks'));await page.locator(`main a[href="#chat/${old}"]`).click();assert.match(await page.locator('main').innerText(),/上周运动鞋/);assert.equal(await page.evaluate(()=>C.state.runs.S01.taskId),old);
 await page.evaluate(()=>C.go('scenario/S07'));await (await legacyControl(page,'sc-demo')).selectOption('completed');await page.locator('[data-action="sc-save-artifact"]').click();
 const id=await page.evaluate(()=>C.state.artifacts.at(-1).id);await page.evaluate(()=>C.go('assets'));await page.locator(`[data-action="asset-open"][data-id="${id}"]`).first().click();assert.match(await page.locator('#modal').innerText(),/WAPE/);assert(!await page.locator('#modal').innerText().then(x=>x.includes('销售增长主要来自新店')));
 for(let n=0;n<16;n++){await page.keyboard.press('Tab');assert(await page.evaluate(()=>document.getElementById('modal').contains(document.activeElement)));}
 await page.keyboard.press('Escape');assert(!await page.locator('#modal').isVisible());
 await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:375,height:812});await page.evaluate(()=>C.go('home'));await page.locator('[data-action="menu-toggle"]').click();await page.locator('nav a[href="#reports"]').click();assert(!await page.evaluate(()=>document.body.classList.contains('menu-open')));
 await page.addStyleTag({content:'html{font-size:200%}body{font-size:200%}'});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 assert.deepEqual(errors,[]);return {newTaskIsolation:true,artifactContent:true,keyboardFocus:true,mobileNavigation:true,reducedMotion:true,textScale:true,errors};
}
async function checkNavigation(page){
 const errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
 const verify=(label,yes)=>{assert(yes,label);checks.push(label)};
 await page.goto(baseURL+'#analysis');
 for(const name of ['分析','报告空间','插件','定时任务','看板'])verify('primary '+name,await page.getByRole('navigation',{name:'一级导航'}).getByRole('link',{name,exact:true}).count()===1);
 verify('pinned sidebar reserves space',await page.evaluate(()=>parseInt(getComputedStyle(document.querySelector('.shell')).marginLeft)===320));
 verify('three seed conversations',await page.locator('.conversation-link').count()===3);
 const statusFixtures=await page.evaluate(()=>C.conversations().slice(0,3).map(r=>({taskId:r.taskId,phase:r.phase,decisions:structuredClone(r.decisions||[]),unread:r.unread,readAt:r.readAt,lastActivityAt:r.lastActivityAt})));
 await page.evaluate(()=>{const rows=C.conversations().slice(0,3);rows.forEach(r=>{r.unread=false;r.readAt=new Date().toISOString();delete r.lastActivityAt;});rows[0].phase='running';rows[1].phase='awaiting';rows[1].decisions=[{id:'qa-pending',type:'execute',status:'pending'}];rows[2].unread=true;C.render();});
 verify('running session has accessible loading indicator',await page.locator(`.session-row[data-task-id="${statusFixtures[0].taskId}"] .session-spinner[aria-label="分析进行中"]`).count()===1);
 verify('pending execution has authorization tag',await page.locator(`.session-row[data-task-id="${statusFixtures[1].taskId}"] .session-auth-tag`).innerText().then(t=>t.includes('待授权')));
 verify('unread conversation has a blue dot',await page.locator(`.session-row[data-task-id="${statusFixtures[2].taskId}"] .session-unread-dot[aria-label="未读消息"]`).count()===1);
 verify('conversation titles occupy one line',await page.locator('.conversation-title').evaluateAll(items=>items.every(item=>getComputedStyle(item).whiteSpace==='nowrap')));
 verify('session actions are outside conversation links',await page.locator('.session-actions button').evaluateAll(items=>items.length>=6&&items.every(item=>!item.closest('a'))));
 await page.evaluate(fixtures=>{for(const old of fixtures){const r=C.state.conversations[old.taskId];for(const key of ['phase','decisions','unread','readAt','lastActivityAt']){if(old[key]===undefined)delete r[key];else r[key]=old[key];}}C.render();},statusFixtures);

 await page.locator('[data-action="sidebar-pin"]').click();
 verify('collapsed sidebar hidden and inert',await page.evaluate(()=>document.getElementById('secondary-sidebar').inert&&getComputedStyle(document.querySelector('.shell')).marginLeft==='60px'));
 await page.locator('[data-nav-group="analysis"]').hover();await page.waitForTimeout(180);
 verify('hover opens overlay without resizing',await page.evaluate(()=>document.body.classList.contains('nav-preview')&&!document.getElementById('secondary-sidebar').inert&&getComputedStyle(document.querySelector('.shell')).marginLeft==='60px'));
 await page.mouse.move(180,180);await page.waitForTimeout(300);verify('pointer corridor keeps flyout open',await page.evaluate(()=>document.body.classList.contains('nav-preview')));
 await page.screenshot({path:join(evidence,'sidebar-floating.png')});
 await page.mouse.move(1000,700);await page.waitForTimeout(320);verify('pointer leave closes overlay',await page.evaluate(()=>!document.body.classList.contains('nav-preview')));
 await page.locator('[data-nav-group="plugins"]').hover();await page.waitForTimeout(180);
 verify('hover previews secondary without changing page',await page.evaluate(()=>C.route()==='analysis'&&document.querySelector('.secondary-brand').textContent.includes('插件')));
 await page.locator('[data-action="sidebar-pin"]').click();await page.waitForTimeout(100);
 verify('pinning preview navigates its module',await page.evaluate(()=>C.route()==='plugins'&&C.state.navigation.pinned));
 await page.reload();verify('pin state persists',await page.evaluate(()=>C.state.navigation.pinned&&!document.getElementById('secondary-sidebar').inert));
 await page.evaluate(()=>C.go('analysis'));await page.locator('[data-action="sidebar-pin"]').click();
 await page.locator('[data-nav-group="analysis"]').focus();await page.keyboard.press('ArrowRight');
 verify('keyboard enters secondary navigation',await page.evaluate(()=>document.getElementById('secondary-sidebar').contains(document.activeElement)));
 await page.keyboard.press('Escape');verify('escape hides flyout and restores rail focus',await page.evaluate(()=>!document.body.classList.contains('nav-preview')&&document.activeElement.dataset.navGroup==='analysis'));
 await page.locator('[data-nav-group="analysis"]').hover();await page.waitForTimeout(180);await page.locator('[data-action="sidebar-pin"]').click();
 await page.locator('[data-action="conversation-order"][data-value="topic"]').click();verify('topic grouping',await page.locator('.conversation-group h3').allTextContents().then(a=>a.some(t=>t.includes('商品与库存'))));
 const searchButton=page.locator('[data-action="conversation-search-open"]');
 const searchBox=await searchButton.boundingBox(),pinBox=await page.locator('[data-action="sidebar-pin"]').boundingBox();
 verify('search icon precedes collapse control',searchBox&&pinBox&&searchBox.x<pinBox.x);
 await searchButton.click();await page.locator('#conversation-search').fill('凭证');
 verify('search matches message history',await page.locator('[data-action="conversation-search-select"]').count()===1);
 await page.locator('#conversation-search').fill('不存在的会话_xyz');
 verify('search empty state',await page.locator('[data-action="conversation-search-select"]').count()===0&&await page.locator('#conversation-search-results').textContent().then(t=>/没有|未找到/.test(t)));
 await page.keyboard.press('Escape');verify('search Escape closes dialog',!await page.locator('#modal').isVisible());
 await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'k',ctrlKey:true,isComposing:true,bubbles:true})));
 verify('IME composition does not trigger search shortcut',!await page.locator('#modal').isVisible());
 await page.keyboard.press('Control+k');verify('Ctrl K opens search',await page.locator('#conversation-search').isVisible());
 await page.locator('#conversation-search').fill('');
 const firstSearchId=await page.locator('[data-action="conversation-search-select"]').first().getAttribute('data-task-id');
 const compositionSelection=await page.locator('#conversation-search').getAttribute('aria-activedescendant');
 await page.locator('#conversation-search').evaluate(input=>{for(const key of ['ArrowDown','Enter'])input.dispatchEvent(new KeyboardEvent('keydown',{key,isComposing:true,bubbles:true}));});
 verify('IME selection keeps the search result and dialog unchanged',await page.locator('#modal').isVisible()&&await page.locator('#conversation-search').getAttribute('aria-activedescendant')===compositionSelection);
 await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowUp');await page.keyboard.press('Enter');
 verify('keyboard selection opens conversation',await page.evaluate(id=>C.route()==='chat/'+id,firstSearchId));
 await page.evaluate(()=>C.go('analysis'));
 await page.locator('[data-action="conversation-order"][data-value="time"]').click();
 await page.locator('.conversation-link').first().click();verify('conversation opens transcript',await page.locator('.sc-transcript .sc-user-message').count()>=2&&await page.locator('.sc-transcript .sc-agent-message').count()>=2);
 const first=await page.evaluate(()=>C.startConversation('S01','上周华东净销售额是多少？').taskId);await page.waitForTimeout(100);
 await (await legacyControl(page,'sc-demo')).selectOption('completed');
 await page.locator('.sc-followup textarea').fill('只比较天猫渠道，并保留上轮结论。');await page.locator('[aria-label="发送补充要求"]').click();
 const firstText=await page.locator('.sc-transcript').innerText();verify('followup appends to complete transcript',firstText.includes('只比较天猫渠道')&&firstText.includes('上周华东净销售额是多少'));
 const transcriptCount=await page.evaluate(()=>C.state.runs.S01.transcript.length);
 const second=await page.evaluate(()=>C.startConversation('S01','本周华东净销售额是多少？').taskId);await page.waitForTimeout(100);
 verify('new session isolated',first!==second&&await page.evaluate(()=>C.state.runs.S01.phase==='ready'&&C.state.runs.S01.transcript.length===2));
 await page.locator(`.conversation-link[href="#chat/${first}"]`).click();await page.waitForFunction(id=>C.state.runs.S01.taskId===id,first);verify('sidebar restores old session and full transcript',await page.evaluate(({first,transcriptCount})=>C.state.runs.S01.taskId===first&&C.state.runs.S01.transcript.length===transcriptCount,{first,transcriptCount}));
 await page.reload();verify('deep link and history survive reload',await page.locator('.sc-transcript').innerText().then(t=>t.includes('只比较天猫渠道')));
 await page.locator(`.conversation-link[href="#chat/${first}"]`).hover();
 await page.locator(`[data-action="session-rename"][data-task-id="${first}"]`).click();
 await page.locator('#session-title').fill('验收：华东销售复盘');await page.locator('button[data-action="session-rename-save"]').click();
 verify('session rename updates title without replacing history',await page.evaluate(({id,count})=>C.state.conversations[id].title==='验收：华东销售复盘'&&C.state.conversations[id].transcript.length===count,{id:first,count:transcriptCount}));
 await page.locator(`.conversation-link[href="#chat/${first}"]`).hover();
 await page.locator(`[data-action="session-delete"][data-task-id="${first}"]`).click();
 await page.locator('[data-action="session-delete-confirm"]').click();
 await page.locator(`.conversation-link[href="#chat/${first}"]`).waitFor({state:'detached'});
 verify('session soft delete preserves record and hides navigation',await page.evaluate(id=>Boolean(C.state.conversations[id].deletedAt)&&C.state.deletedConversationUndo===id,first)&&await page.locator(`.conversation-link[href="#chat/${first}"]`).count()===0);
 await page.evaluate(id=>C.go('chat/'+id),first);verify('deleted deep link cannot reopen transcript',await page.locator('.sc-transcript').count()===0);
 await page.locator('[data-action="conversation-search-open"]').click();await page.locator('#conversation-search').fill('验收：华东销售复盘');
 verify('deleted sessions excluded from full text search',await page.locator('[data-action="conversation-search-select"]').count()===0);
 await page.keyboard.press('Enter');verify('empty search Enter does not open deleted conversation',await page.locator('#modal').isVisible());await page.keyboard.press('Escape');
 await page.locator('[data-action="session-restore"]').first().click();
 verify('session deletion can be undone',await page.evaluate(({id,count})=>!C.state.conversations[id].deletedAt&&C.state.conversations[id].transcript.length===count,{id:first,count:transcriptCount}));
 await page.reload();verify('rename and restore persist',await page.evaluate(id=>C.state.conversations[id].title==='验收：华东销售复盘'&&!C.state.conversations[id].deletedAt,first));
 await page.locator('[data-action="conversation-search-open"]').click();await page.locator('#conversation-search').fill('验收：华东销售复盘');
 verify('authorized search finds restored conversation',await page.locator(`[data-action="conversation-search-select"][data-task-id="${first}"]`).count()===1);
 await page.evaluate(()=>C.handlers['role-switch']({value:'auditor'}));
 verify('identity change dismisses existing search content',!await page.locator('#modal').isVisible());
 const restrictedRoute=await page.evaluate(()=>C.route());
 await page.evaluate(id=>C.handlers['conversation-search-select']({dataset:{taskId:id}}),first);
 verify('stale search result rechecks current permission',await page.evaluate(()=>C.route())===restrictedRoute&&await page.locator('.sc-transcript').count()===0);
 await page.keyboard.press('Control+k');verify('unauthorized shortcut does not expose conversations',!await page.locator('#conversation-search').isVisible());
 await page.locator('#role-switch').selectOption('analyst');

 await page.evaluate(()=>C.go('analysis'));verify('analysis homepage restores composer',await page.locator('#question').isVisible());
 await page.screenshot({path:join(evidence,'navigation-home.png'),fullPage:true});
 await page.locator('#role-switch').selectOption('admin');await page.locator('[data-nav-group="governance"]').click();
 await page.waitForFunction(()=>document.querySelectorAll('.secondary-links a.nav-item').length===8);
 verify('all management entries retained',await page.locator('.secondary-links a.nav-item').count()===8);
 await page.locator('#role-switch').selectOption('auditor');await page.evaluate(()=>C.go('reports'));
 verify('unauthorized secondary hides report names',!await page.locator('#secondary-sidebar').innerText().then(t=>t.includes('华东渠道贡献诊断')));
 await page.locator('#role-switch').selectOption('analyst');await page.evaluate(()=>C.go('analysis'));await page.setViewportSize({width:390,height:844});await page.locator('[data-action="menu-toggle"]').click();verify('touch menu opens sidebar',await page.locator('[data-action="conversation-search-open"]').isVisible());verify('touch drawer isolates keyboard focus',await page.evaluate(()=>document.querySelector('.shell').inert&&!document.querySelector('.primary-rail').inert));await page.locator('[data-action="sidebar-pin"]').click();verify('touch menu can close',!await page.evaluate(()=>document.body.classList.contains('menu-open')));
 verify('no browser errors',errors.length===0);
 return {acceptanceRefs:['AC-CHAT-07','AC-CHAT-08','AC-CHAT-09','AC-SEARCH-01','AC-SEARCH-02','AC-SEARCH-03','AC-SEARCH-04'],checks:checks.length,errors};
}

async function checkConversationControls(page){
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(baseURL+'#analysis');await page.locator('#role-switch').selectOption('admin');
 const start=async(id,prompt)=>{const task=await page.evaluate(({id,prompt})=>C.startConversation(id,prompt).taskId,{id,prompt});await page.locator('.sc-demo-panel').waitFor();return task;};
 const snapshot=task=>page.evaluate(task=>{const r=C.state.conversations[task];return {step:r.step,events:r.events.length,transcript:r.transcript.length,phase:r.phase};},task);
 const first=await start('S05','验证播放暂停与同场景会话隔离');
 await (await legacyControl(page,'sc-demo-speed')).selectOption('600');
 await (await legacyControl(page,'sc-autoplay')).click();
 await page.waitForFunction(task=>C.state.conversations[task].phase==='running',first);
 await (await legacyControl(page,'sc-autoplay-pause')).click();
 const paused=await snapshot(first);await page.waitForTimeout(1400);assert.deepEqual(await snapshot(first),paused,'Paused playback must not advance events or steps');
 assert.equal(await page.evaluate(task=>C.state.conversations[task].demoPlayback.status,first),'paused');
 await (await legacyControl(page,'sc-autoplay')).click();
 const second=await start('S05','同一case的新会话必须独立');
 const oldAfterSwitch=await snapshot(first);await page.waitForTimeout(1400);
 assert.deepEqual(await snapshot(first),oldAfterSwitch,'Leaving a playing session must stop its timer');
 assert.equal(await page.evaluate(task=>C.state.conversations[task].demoPlayback.status,first),'paused');
 assert.equal(await page.evaluate(task=>C.state.conversations[task].phase,second),'ready');
 await (await legacyControl(page,'sc-case-select')).selectOption('S07');
 const forecast=await page.evaluate(()=>C.state.runs.S07.taskId);
 assert.notEqual(forecast,second);
 await (await legacyControl(page,'sc-demo-speed')).selectOption('600');
 await (await legacyControl(page,'sc-autoplay')).click();
 await (await legacyControl(page,'sc-case-select')).selectOption('S09');
 const forecastAfterSwitch=await snapshot(forecast);await page.waitForTimeout(1400);
 assert.deepEqual(await snapshot(forecast),forecastAfterSwitch,'Manual case switching must stop previous playback');
 assert.equal(await page.evaluate(()=>C.state.runs.S09.phase),'ready');
 const causal=await page.evaluate(()=>C.state.runs.S09.taskId);
 await (await legacyControl(page,'sc-demo-speed')).selectOption('600');await (await legacyControl(page,'sc-autoplay')).click();
 await page.locator('#role-switch').selectOption('auditor');
 const afterRole=await snapshot(causal);await page.waitForTimeout(1400);assert.deepEqual(await snapshot(causal),afterRole,'Identity change must pause old playback before applying further events');
 assert.equal(await page.evaluate(task=>C.state.conversations[task].demoPlayback.status,causal),'paused');
 await page.locator('#role-switch').selectOption('admin');
 await page.evaluate(task=>C.go('chat/'+task),second);
 await (await legacyControl(page,'sc-demo')).selectOption('completed');
 assert(await page.locator('.sc-current-turn [data-action="sc-artifact-open"]').isVisible());
 assert(await page.locator('.sc-demo-panel [data-action="sc-demo"]').isVisible());
 assert(await page.locator('.sc-chat-main .sc-user-message').count()>0);
 await page.screenshot({path:join(evidence,'conversation-inline-artifact.png'),fullPage:true});
 const messageId=await page.locator('.sc-current-turn').getAttribute('data-message-id');
 await page.locator('.sc-current-turn [data-action="sc-copy-message"]').click();
 await page.waitForFunction(({task,id})=>Boolean(C.state.conversations[task].transcript.find(m=>m.id===id)?.copiedAt),{task:second,id:messageId});
 assert(await page.locator('#toast').innerText().then(t=>t.includes('复制'))||await page.locator('#modal').isVisible(),'Copy action must report success or present a manual-copy fallback');
 if(await page.locator('#modal').isVisible())await page.keyboard.press('Escape');
 await page.locator('.sc-current-turn [data-action="sc-message-feedback"][data-vote="helpful"]').click();
 assert.equal(await page.locator('.sc-current-turn [data-vote="helpful"]').getAttribute('aria-pressed'),'true');
 assert.equal(await page.evaluate(({task,id})=>C.state.conversations[task].transcript.find(m=>m.id===id).feedback,{task:second,id:messageId}),'helpful');
 const preserved=await page.evaluate(({task,id})=>JSON.stringify(C.state.conversations[task].transcript.find(m=>m.id===id).resultSnapshot),{task:second,id:messageId});
 const version=await page.evaluate(task=>C.state.conversations[task].version,second);
 await page.locator('.sc-current-turn [data-action="sc-regenerate"]').click();
 assert.equal(await page.evaluate(task=>C.state.conversations[task].version,second),version+1);
 assert.equal(await page.evaluate(({task,id})=>JSON.stringify(C.state.conversations[task].transcript.find(m=>m.id===id).resultSnapshot),{task:second,id:messageId}),preserved,'Retry keeps the previous response artifact snapshot');
 const originalMessages=await page.evaluate(task=>JSON.stringify(C.state.conversations[task].transcript),second);
 await page.locator('.sc-user-message [data-action="sc-edit-user"]').first().click();
 await page.locator('[data-user-branch-form] textarea').fill('改为分析华东近 30 天的渠道贡献变化');
 await page.locator('[data-action="sc-user-branch-save"]').click();
 const branch=await page.evaluate(()=>C.state.runs.S05.taskId);
 assert.notEqual(branch,second);assert.equal(await page.evaluate(()=>C.state.runs.S05.parentTaskId),second);
 assert.equal(await page.evaluate(task=>JSON.stringify(C.state.conversations[task].transcript),second),originalMessages,'Editing a user message creates a branch and preserves the original transcript');
 await (await legacyControl(page,'sc-decision-menu')).click();await page.locator('[data-action="sc-decision-create"][data-type="execute"]').click();
 assert(await page.locator('.sc-current-turn .sc-decision').isVisible(),'HITL request must be inside the current assistant message');
 await page.waitForTimeout(800);assert.equal(await page.evaluate(()=>C.state.runs.S05.decisions.at(-1).status),'pending','Normal chat must not simulate approval');
 await page.locator('.sc-current-turn [data-action="sc-decide"][data-value="partial"]').click();await page.locator('[data-action="sc-partial-save"]').click();
 assert.equal(await page.evaluate(()=>C.state.runs.S05.decisions.at(-1).status),'partial');
 await page.locator('[data-action="sc-panel-toggle"]').click();
 assert(!await page.locator('.sc-demo-panel').isVisible());assert(await page.locator('.sc-followup textarea').isVisible(),'Conversation composer remains usable with demo panel closed');
 await page.locator('[data-action="sc-panel-toggle"]').click();assert(await page.locator('.sc-demo-panel').isVisible());
 for(const width of [1100,390]){
  await page.setViewportSize({width,height:900});await page.waitForTimeout(220);
  assert(!await page.locator('.sc-demo-panel').isVisible(),`Demo drawer initially closed at ${width}`);
  await page.locator('.sc-followup textarea').fill('尚未发送的补充问题 '+width);
  await page.locator('[data-action="sc-panel-toggle"]').click();
  await page.locator('.sc-demo-panel').waitFor({state:'visible'});
  assert.equal(await page.locator('.sc-demo-panel').getAttribute('role'),'dialog');
  assert.equal(await page.locator('.sc-demo-panel').getAttribute('aria-modal'),'true');
  assert(await page.evaluate(()=>document.querySelector('.sc-demo-panel').contains(document.activeElement)),`Opening drawer focuses its controls at ${width}`);
  await page.keyboard.press('Shift+Tab');assert(await page.evaluate(()=>document.querySelector('.sc-demo-panel').contains(document.activeElement)));
  await page.keyboard.press('Tab');assert(await page.evaluate(()=>document.activeElement.dataset.action==='sc-panel-close'));
  for(let index=0;index<24;index++){await page.keyboard.press('Tab');assert(await page.evaluate(()=>document.querySelector('.sc-demo-panel').contains(document.activeElement)),`Tab cannot escape demo drawer at ${width}`);}
  await page.keyboard.press('Escape');await page.waitForTimeout(220);
  assert(!await page.locator('.sc-demo-panel').isVisible());
  assert(await page.evaluate(()=>document.activeElement.dataset.action==='sc-panel-toggle'));
  assert.equal(await page.locator('.sc-followup textarea').inputValue(),'尚未发送的补充问题 '+width);
  await page.locator('[data-action="sc-panel-toggle"]').click();await page.locator('.sc-demo-drawer-close').click();await page.waitForTimeout(220);
  assert(!await page.locator('.sc-demo-panel').isVisible());
  await page.locator('[data-action="sc-panel-toggle"]').click();await page.locator('.sc-demo-backdrop').click({position:{x:5,y:80}});await page.waitForTimeout(220);
  assert(!await page.locator('.sc-demo-panel').isVisible());
  assert.equal(await page.locator('.sc-followup textarea').inputValue(),'尚未发送的补充问题 '+width);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 }
 assert.deepEqual(errors,[]);
 return {acceptanceRefs:['AC-CHAT-10','AC-CHAT-11','AC-DEMO-01'],pauseFreezesProgress:true,sameScenarioIsolation:true,manualCaseSwitchIsolation:true,identityChangePauses:true,inlineArtifact:true,copyFeedback:true,regenerationKeepsHistory:true,userEditCreatesBranch:true,inlineHITL:true,panelToggle:true,drawers:[1100,390],draftPreserved:true,errors};
}

async function checkWorkspaces(page){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(baseURL+'#plugins');assert.equal(await page.locator('.ws-plugin-card').count(),10);
 await page.locator('main [data-action="ws-category"][data-category="数据集"]').click();assert.equal(await page.locator('.ws-plugin-card').count(),2);
 await page.locator('#ws-plugin-query').fill('not-found-xyz');await page.locator('.ws-search button').click();assert(await page.getByText('没有找到匹配的插件').isVisible());await page.locator('[data-action="ws-clear-search"]').click();
 await page.locator('main [data-action="ws-detail"][data-id="revenue-skill"]').click();await page.locator('dialog [data-action="ws-toggle"]').click();assert(await page.locator('dialog [data-action="ws-apply"]').isDisabled());await page.locator('dialog [data-action="ws-toggle"]').click();await page.locator('dialog [data-action="ws-apply"]').click();
 assert(await page.evaluate(()=>C.route().startsWith('chat/')&&C.state.runs.S05.sourceContext.pluginId==='revenue-skill'&&C.state.runs.S05.sourceContext.pluginVersion==='2.3'));await page.reload();assert(await page.evaluate(()=>Boolean(C.state.runs.S05.sourceContext.inputs)));
 await page.evaluate(()=>C.go('boards'));const before=await page.locator('.ws-kpi strong').first().innerText();await page.locator('#ws-board-period').selectOption('month');await page.locator('#ws-board-region').selectOption('south');await page.locator('.ws-board-filters button[type="submit"]').click();assert.notEqual(await page.locator('.ws-kpi strong').first().innerText(),before);
 await page.locator('[data-action="ws-channel"][data-channel="天猫"]').click();assert.equal(await page.locator('.ws-detail-table tbody tr').count(),1);await page.locator('.ws-detail-table [data-action="ws-board-analyze"]').click();assert(await page.evaluate(()=>C.state.runs.S05.region==='华南'&&C.state.runs.S05.channel==='天猫'&&C.state.runs.S05.sourceContext.period==='month'));
 const south=await page.evaluate(()=>C.state.runs.S05.taskId);await page.locator('#role-switch').selectOption('manager');assert(await page.getByText('无法打开此分析会话',{exact:true}).isVisible());assert.equal(await page.locator(`.conversation-link[href="#chat/${south}"]`).count(),0);
 await page.evaluate(()=>C.go('boards'));assert(await page.locator('#ws-board-region').isDisabled());assert.equal(await page.locator('#ws-board-region').inputValue(),'east');
 for(const board of ['channels','inventory','overview']){await page.locator(`main [data-action="ws-board"][data-board="${board}"]`).click();assert.equal(await page.locator('.ws-kpi').count(),4);}
 await page.locator('.ws-insight-panel [data-action="ws-board-analyze"]').click();assert.equal(await page.evaluate(()=>C.state.runs.S05.region),'华东');
 await page.locator('#role-switch').selectOption('auditor');await page.evaluate(()=>C.go('plugins'));assert(await page.getByText('当前身份无法访问此功能',{exact:true}).isVisible());
 const unchanged=await page.evaluate(()=>{const before=JSON.stringify(C.state.workspaces.enabled);C.handlers['ws-toggle']({dataset:{id:'revenue-skill'}});return before===JSON.stringify(C.state.workspaces.enabled)});assert(unchanged);
 assert.deepEqual(errors,[]);return {pluginCategories:5,plugins:10,boards:3,provenance:true,linkedFilters:true,roleScope:true,errors};
}

const browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})});
const results={};
try{
 for(const [name,fn]of Object.entries({login:checkLogin,common:checkCommon,scenarios:checkScenarios,regressions:checkRegressions,admin:checkAdminPrototype,integration:checkIntegration,navigation:checkNavigation,conversation:checkConversationControls,workspaces:checkWorkspaces})){
  if(process.env.CHECK_SUITES&&!process.env.CHECK_SUITES.split(',').includes(name))continue;
  const context=await browser.newContext({viewport:{width:1440,height:1050}});
  try{
   const page=await context.newPage(),consoleErrors=[];
   page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
   if(name!=='login'){
    await page.goto(baseURL);
    await page.locator('[data-action="login-role"][data-role="analyst"]').click();
   }
   results[name]=await fn(page);assert.deepEqual(consoleErrors,[],`${name}: browser console errors`);
   results[name].consoleErrors=consoleErrors;console.log('PASS '+name);
  }finally{await context.close();}
 }
 console.log(JSON.stringify({baseURL,evidence,results},null,2));
}finally{await browser.close();}
