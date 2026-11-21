import { internetReachable } from './connectivity.js';
import { BASE, portal, live, onlineText } from './core.js';
let queue = Promise.resolve();
const serial = fn => { const p = queue.then(fn); queue = p.catch(() => {}); return p; };
const state = async () => ({ ...(await chrome.storage.local.get({enabled:false})), ...(await chrome.storage.session.get('run')) });
const CLEANUP_ALARM='completed-tab-cleanup';
function unusedNewTab(tab) {
  return !tab.pinned && !tab.audible && !tab.pendingUrl &&
    ['chrome://newtab/','chrome://new-tab-page/','chrome-search://local-ntp/local-ntp.html','about:blank'].includes(tab.url);
}
async function showNewTab(sender) {
  // Determine the window again in case the login tab has been moved.
  const current=await chrome.tabs.get(sender.tab.id);
  const windowId=current.windowId ?? sender.tab.windowId;
  if(Number.isInteger(windowId)) {
    const tabs=await chrome.tabs.query({windowId});
    for(const candidate of tabs.filter(t=>t.id!==sender.tab.id && unusedNewTab(t))) {
      try {
        const latest=await chrome.tabs.get(candidate.id);
        if(latest.windowId!==windowId || !unusedNewTab(latest)) continue;
        // Only activate; never replace a URL or overwrite a user's page.
        await chrome.tabs.update(candidate.id,{active:true});
        return;
      } catch { /* Candidate was closed or moved; try another before creating one. */ }
    }
  }
  const options={active:true};
  if(Number.isInteger(windowId)) options.windowId=windowId;
  await chrome.tabs.create(options);
}
async function stopCompletedCleanup(reason) {
  const {run}=await state();
  if(run?.cleanup?.pending) {
    await chrome.storage.session.set({run:{...run,cleanup:{...run.cleanup,pending:false},...(reason?{reason}:{})}});
  }
  await chrome.alarms.clear(CLEANUP_ALARM);
}
async function cleanupCompletedTab() {
  const {run,enabled}=await state();
  if(!run?.cleanup?.pending) return;
  if(!enabled || run.active || !run.createdTab) {await stopCompletedCleanup();return;}
  const cleanup={...run.cleanup,attempts:run.cleanup.attempts+1};
  await chrome.storage.session.set({run:{...run,cleanup}});
  // Persist a fallback before touching the tab; a worker restart won't lose it.
  await chrome.alarms.create(CLEANUP_ALARM,{when:Date.now()+30000});
  try {
    const tab=await chrome.tabs.get(run.tabId);
    if(!portal(tab.url) || tab.url!==cleanup.url || tab.pendingUrl || tab.pinned || tab.active || tab.audible) {
      await stopCompletedCleanup();return;
    }
    const options={};
    if(Number.isInteger(tab.windowId)) options.windowId=tab.windowId;
    if((await chrome.tabs.query(options)).length<=1) {await stopCompletedCleanup();return;}
    await chrome.tabs.remove(run.tabId);
    await stopCompletedCleanup();
  } catch {
    if(cleanup.attempts>=3) await stopCompletedCleanup('已连接，认证页未能自动关闭，请手动关闭');
  }
}
async function cleanupBackgroundTab() {
  const {run}=await state();
  // Only disposable tabs that have never been presented as a login UI.
  if(!run || run.active || !run.createdTab || run.loginShown || run.submittedAt || run.backgroundCleaned) return;
  try {
    const tab=await chrome.tabs.get(run.tabId);
    if(!portal(tab.url)) return;
    const options={};
    if(Number.isInteger(tab.windowId)) options.windowId=tab.windowId;
    if((await chrome.tabs.query(options)).length<=1) return;
    await chrome.tabs.remove(run.tabId);
    await chrome.storage.session.set({run:{...run,backgroundCleaned:true}});
  } catch { /* A later tab update can retry cleanup without restarting authentication. */ }
}
async function finish(reason) {
  const {run} = await state();
  await chrome.storage.session.set({run:{...run, active:false, reason, ended:Date.now()}});
  await chrome.alarms.clear('deadline');
  await cleanupBackgroundTab();
}
async function inject(tabId) {
  const s = await state();
  if (!live(s.run,s.enabled) || s.run.tabId !== tabId) return;
  const tab = await chrome.tabs.get(tabId);
  if (!portal(tab.url)) return;
  try {
    await chrome.scripting.executeScript({target:{tabId},files:['content.js'],injectImmediately:true});
  } catch(error) {
    // Navigation may replace the document while the early injection is in flight.
    if(tab.status!=='loading') throw error;
  }
}
async function startup() {
  const s = await state();
  if (s.run?.started || !s.enabled) return;
  const run = {active:true, started:Date.now(), deadline:Date.now()+25000, phase:'ready', reason:'正在检测'};
  await chrome.storage.session.set({run});
  await chrome.alarms.create('deadline',{when:run.deadline});
  // A successful external probe ends startup without touching the campus portal.
  if(await internetReachable()){await finish('已连接');return;}
  // Only the login endpoint is fetched. Never probe logoff (it may terminate a session).
  try {
    const r = await fetch(BASE+'login.jsp',{credentials:'include',cache:'no-store',signal:AbortSignal.timeout(4000)});
    if (!r.ok) throw new Error('HTTP');
    const html = await r.text();
    if (onlineText(html)) { await finish('已连接'); return; }
  } catch { await finish('认证服务器不可达，请确认已连接校园网'); return; }
  // Opening this tab also permits Chrome to fill the saved credentials.
  const tabs = await chrome.tabs.query({url:'http://202.117.144.205/*'});
  const existing = tabs.find(t=>portal(t.url)&&new URL(t.url).pathname!=='/snnuportal/logoff');
  const tab = existing || await chrome.tabs.create({url:BASE+'login.jsp',active:false});
  await chrome.storage.session.set({run:{...run,tabId:tab.id,createdTab:!existing,reason:'正在登录'}});
  await inject(tab.id);
}
chrome.runtime.onStartup.addListener(()=>serial(startup).catch(()=>serial(()=>finish('启动检测失败'))));
chrome.runtime.onInstalled.addListener(()=>serial(async()=>{
  const s = await chrome.storage.local.get('enabled');
  if (s.enabled === undefined) await chrome.storage.local.set({enabled:false});
  await finish('等待下次启动 Chrome');
}));
chrome.tabs.onUpdated.addListener((id,change)=>{
  if(change.status==='loading' || change.status==='complete' || (change.url && portal(change.url))) serial(async()=>{
    const {run}=await state();
    if(run?.tabId!==id) return;
    if(run.cleanup?.pending && change.url && change.url!==run.cleanup.url) await stopCompletedCleanup();
    if(run.active) await inject(id);
    else await cleanupBackgroundTab();
  }).catch(()=>serial(()=>finish('无法操作认证页面')));
});
chrome.tabs.onRemoved.addListener(id=>serial(async()=>{
  const {run}=await state();if(run?.tabId!==id) return;
  if(run.active) await finish('认证页面已关闭');
  else if(run.cleanup?.pending) await stopCompletedCleanup();
}));
chrome.alarms.onAlarm.addListener(a=>{
  if(a.name===CLEANUP_ALARM) {serial(cleanupCompletedTab).catch(()=>{});return;}
  if(a.name==='deadline') serial(async()=>{
  const {run}=await state();
  if(!run?.active) return;
  const reason=run.phase==='confirm'
    ? (run.loginClicked?'已执行登录点击，但未识别到确认弹窗':'已定位登录控件，但未收到点击完成回报')
    : run.phase==='result'?(run.resultObservation==='login_form'?'确认后超时，页面仍有登录表单，请查看页面提示':'确认后超时，未识别到成功或失败结果'):'等待页面或账号自动填写超时';
  await finish(reason);
});});
chrome.runtime.onMessage.addListener((m,sender,respond)=>{
  serial(async()=>{
    if (!sender.tab && sender.url === chrome.runtime.getURL('popup.html')) {
      if(m.type==='status') return state();
      if(m.type==='toggle' && typeof m.enabled==='boolean') {
        await chrome.storage.local.set({enabled:m.enabled});
        await stopCompletedCleanup();
        await finish(m.enabled?'等待下次启动 Chrome':'自动连接已关闭');
        return state();
      }
      return null;
    }
    const s = await state();
    if (!portal(sender.url) || sender.frameId !== 0 || sender.tab?.id !== s.run?.tabId || !live(s.run,s.enabled)) return null;
    const run = s.run;
    if(m.type==='state') return run;
    if(m.type==='finish') {
      const reason=String(m.reason).slice(0,100);
      const showDestination=reason==='已连接' && !!run.submittedAt;
      // Persist completion before switching tabs: repeated reports cannot open more.
      await finish(reason);
      if(showDestination){
        try {
          await showNewTab(sender);
        } catch { await finish('已连接，但新标签页打开失败'); return null; }
      }
      if(showDestination && run.createdTab){
        const {run:completed}=await state();
        await chrome.storage.session.set({run:{...completed,cleanup:{pending:true,attempts:0,url:sender.url}}});
        await cleanupCompletedTab();
      }
      return null;
    }
    if(m.type==='resultObservation' && run.phase==='result' && ['login_form','other'].includes(m.observation)) {
      const next={...run,resultObservation:m.observation,reason:m.observation==='login_form'
        ?'等待登录结果（页面仍有登录表单）':'等待登录结果（尚未识别到成功状态）'};
      await chrome.storage.session.set({run:next});return next;
    }
    if(m.type==='clicked') {
      if(m.control==='login' && run.phase==='confirm') {
        const next={...run,loginClicked:true,reason:'已执行登录点击，等待确认弹窗'};
        await chrome.storage.session.set({run:next}); return next;
      }
      if(m.control==='confirm' && run.phase==='result') {
        const next={...run,reason:'已执行确认点击，等待登录结果'};
        await chrome.storage.session.set({run:next}); return next;
      }
      return null;
    }
    if(m.type==='showLogin' && run.phase==='ready') {
      if(run.loginShown) return run;
      const next={...run,loginShown:true};
      await chrome.storage.session.set({run:next});
      try { await chrome.tabs.update(run.tabId,{active:true}); }
      catch { await finish('无法显示认证页面'); return null; }
      return next;
    }
    if(m.type==='submit') {
      if(run.phase!=='ready') return null;
      const next={...run,phase:'confirm',loginClicked:false,reason:'已定位登录控件，准备点击',submittedAt:Date.now()};
      await chrome.storage.session.set({run:next}); return next;
    }
    if(m.type==='confirm' && run.phase==='confirm') {
      const next={...run,phase:'result',reason:'已找到确认弹窗，准备确认'}; await chrome.storage.session.set({run:next});return next;
    }

    return null;
  }).then(respond,()=>respond(null));
  return true;
});
