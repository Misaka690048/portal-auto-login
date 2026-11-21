import test from 'node:test';
import assert from 'node:assert/strict';
import {PROBE_URL} from '../extension/connectivity.js';
import {portal,live,onlineText} from '../extension/core.js';
function event(){const handlers=[];return {addListener:f=>handlers.push(f),handlers};}
async function harness(enabled=true){
 const activated=[],removed=[],created=[],local={enabled}, session={}, calls={fetch:0,tabs:0,inject:0};
 const tabMap=new Map(),alarms=new Map();let nextTabId=7;
 const storage=data=>({get:async key=>typeof key==='string'?{[key]:data[key]}:{...key,...data},set:async values=>Object.assign(data,values)});
 const chrome={storage:{local:storage(local),session:storage(session)},runtime:{onStartup:event(),onInstalled:event(),onMessage:event(),getURL:p=>'chrome-extension://test/'+p},tabs:{
  onUpdated:event(),onRemoved:event(),
  query:async options=>[...tabMap.values()].filter(t=>(!options?.url || portal(t.url)) && (options?.windowId===undefined || t.windowId===options.windowId)),
  update:async(id,options)=>{
   const tab=tabMap.get(id);if(!tab)throw new Error('missing tab');
   activated.push({id,...options});
   if(options.active)for(const other of tabMap.values())if(other.windowId===tab.windowId)other.active=false;
   Object.assign(tab,options);return {...tab};
  },
  remove:async id=>{if(!tabMap.has(id))throw new Error('missing tab');removed.push(id);tabMap.delete(id);},
  create:async options=>{
   created.push(options);calls.tabs++;
   const tab={id:nextTabId++,windowId:options.windowId??3,status:'complete',url:options.url??'chrome://newtab/',active:options.active??true};
   if(tab.active)for(const other of tabMap.values())if(other.windowId===tab.windowId)other.active=false;
   tabMap.set(tab.id,tab);return {...tab};
  },
  get:async id=>{const tab=tabMap.get(id);if(!tab)throw new Error('missing tab');return {...tab};}
 },scripting:{executeScript:async args=>{assert.deepEqual(args.files,['content.js']);calls.inject++;}},alarms:{create:async(name,options)=>alarms.set(name,options),clear:async name=>alarms.delete(name),onAlarm:event()}};
 globalThis.chrome=chrome;globalThis.fetch=async()=>{calls.fetch++;return {ok:true,text:async()=>'<form>登录</form>'};};
 await import('../extension/background.js?test='+Math.random());
 const msg=(m,sender={tab:{id:7},frameId:0,url:'http://202.117.144.205:8605/snnuportal/login.jsp'})=>new Promise(resolve=>chrome.runtime.onMessage.handlers[0](m,sender,resolve));
 const popup=m=>msg(m,{url:'chrome-extension://test/popup.html'});
 const start=async()=>{chrome.runtime.onStartup.handlers[0]();await popup({type:'status'});};
 return {activated,removed,created,local,session,calls,chrome,msg,popup,start,tabMap,alarms};
}
test('only the exact portal origin is accepted',()=>{assert.equal(portal('http://202.117.144.205:8605/snnuportal/login.jsp'),true);for(const u of ['http://202.117.144.205/snnuportal/login.jsp','https://evil.test/snnuportal/login.jsp','garbage'])assert.equal(portal(u),false);});
test('expired and disabled runs cannot act',()=>{assert.equal(live({active:true,deadline:100},true,99),true);assert.equal(live({active:true,deadline:100},true,100),false);assert.equal(live({active:true,deadline:100},false,99),false);assert.equal(onlineText('当前登录账号 断开连接'),true);assert.equal(onlineText('登录失败'),false);});
test('disabled startup performs no network or tab actions',async()=>{const h=await harness(false);await h.start();assert.deepEqual(h.calls,{fetch:0,tabs:0,inject:0});});
test('startup runs once, and a worker restart does not start work',async()=>{const h=await harness();await h.start();await h.start();assert.equal(h.calls.tabs,1);await import('../extension/background.js?restart='+Math.random());assert.equal(h.calls.tabs,1);});
test('one submission only; retry messages cannot restart the task',async()=>{const h=await harness();await h.start();assert.equal((await h.msg({type:'submit'})).phase,'confirm');assert.equal(await h.msg({type:'submit'}),null);await h.msg({type:'confirm'});assert.equal(await h.msg({type:'retry'}),null);assert.equal(await h.msg({type:'submit'}),null);});
test('successful run cannot reconnect after manual logout',async()=>{const h=await harness();await h.start();await h.msg({type:'finish',reason:'已连接'});assert.equal(await h.msg({type:'state'}),null);h.chrome.tabs.onUpdated.handlers[0](7,{status:'complete'});await h.popup({type:'status'});assert.equal(h.calls.inject,1);await h.start();assert.equal(h.calls.tabs,1);});
test('disable stops the run; reenable only waits for next startup',async()=>{const h=await harness();await h.start();await h.popup({type:'toggle',enabled:false});assert.equal(await h.msg({type:'submit'}),null);await h.popup({type:'toggle',enabled:true});assert.equal(await h.msg({type:'state'}),null);assert.equal(h.calls.tabs,1);});
test('foreign tabs and frames cannot submit',async()=>{const h=await harness();await h.start();assert.equal(await h.msg({type:'submit'},{tab:{id:8},frameId:0,url:'http://202.117.144.205:8605/snnuportal/login.jsp'}),null);assert.equal(await h.msg({type:'submit'},{tab:{id:7},frameId:1,url:'http://202.117.144.205:8605/snnuportal/login.jsp'}),null);assert.equal(h.session.run.phase,'ready');});
test('unreachable portal terminates without opening a tab',async()=>{const h=await harness();globalThis.fetch=async()=>{throw new Error('offline');};await h.start();assert.equal(h.session.run.active,false);assert.equal(h.calls.tabs,0);});
test('already authenticated portal does not open or submit',async()=>{const h=await harness();globalThis.fetch=async()=>({ok:true,text:async()=>'<p>当前登录账号</p><button>断开连接</button>'});await h.start();assert.equal(h.session.run.reason,'已连接');assert.equal(h.calls.tabs,0);});

test('login status reports completed click separately from locating a control',async()=>{
 const h=await harness();await h.start();await h.msg({type:'submit'});
 assert.equal(h.session.run.reason,'已定位登录控件，准备点击');
 await h.msg({type:'clicked',control:'login'});
 assert.equal(h.session.run.reason,'已执行登录点击，等待确认弹窗');
 h.chrome.alarms.onAlarm.handlers[0]({name:'deadline'});await h.popup({type:'status'});
 assert.equal(h.session.run.reason,'已执行登录点击，但未识别到确认弹窗');
 assert.equal(h.session.run.active,false);
});

test('result timeout reports when the login form remains, without retrying',async()=>{
 const h=await harness();await h.start();await h.msg({type:'submit'});await h.msg({type:'confirm'});
 await h.msg({type:'resultObservation',observation:'login_form'});
 assert.equal(h.session.run.reason,'等待登录结果（页面仍有登录表单）');
 h.chrome.alarms.onAlarm.handlers[0]({name:'deadline'});await h.popup({type:'status'});
 assert.equal(h.session.run.reason,'确认后超时，页面仍有登录表单，请查看页面提示');
 assert.equal(h.session.run.phase,'result');assert.equal(h.session.run.active,false);
});

test('completed automatic login opens one active new tab in the same window',async()=>{
 const h=await harness();await h.start();await h.msg({type:'submit'});await h.msg({type:'confirm'});
 const sender={tab:{id:7,windowId:3},frameId:0,url:'http://202.117.144.205:8605/snnuportal/login'};
 await h.msg({type:'finish',reason:'已连接'},sender);
 assert.deepEqual(h.created[1],{active:true,windowId:3});assert.equal(h.session.run.active,false);
 await h.msg({type:'finish',reason:'已连接'},sender);assert.equal(h.created.length,2);
});
test('login failure never opens a new tab',async()=>{
 const h=await harness();await h.start();await h.msg({type:'submit'});await h.msg({type:'finish',reason:'登录失败'});
 assert.equal(h.created.length,1);
});
test('new-tab failure preserves successful authentication and cannot trigger a second login',async()=>{
 const h=await harness();await h.start();await h.msg({type:'submit'});
 h.chrome.tabs.create=async()=>{throw new Error('window closed');};
 await h.msg({type:'finish',reason:'已连接'});
 assert.equal(h.session.run.reason,'已连接，但新标签页打开失败');assert.equal(h.session.run.active,false);
 assert.equal(await h.msg({type:'submit'}),null);
});

test('startup recognizes authenticated HTML with an image-only logout link without opening any tab',async()=>{
 const h=await harness();
 globalThis.fetch=async()=>({ok:true,text:async()=>'<div>当前登录账 号：示例</div><a href="logoff"><img src="image/logout.gif"></a>'});
 await h.start();assert.equal(h.session.run.reason,'已连接');assert.equal(h.calls.tabs,0);assert.equal(h.calls.inject,0);
});
test('startup recognizes a logout form on the authenticated page without opening any tab',async()=>{
 const h=await harness();
 globalThis.fetch=async()=>({ok:true,text:async()=>'<div>当前登录账号：示例</div><form action="/snnuportal/logoff"><input type="image" src="out.gif"></form>'});
 await h.start();assert.equal(h.session.run.reason,'已连接');assert.equal(h.calls.tabs,0);assert.equal(h.calls.inject,0);
});
test('online detection ignores script examples, comments and foreign logout destinations',()=>{
 assert.equal(onlineText('<script>var text="当前登录账号 断开连接";</script><form>用户登录</form>'),false);
 assert.equal(onlineText('<!-- 当前登录账号 断开连接 --><form>用户登录</form>'),false);
 assert.equal(onlineText('<p>当前登录账号</p><a href="http://example.com/snnuportal/logoff"><img src="out.gif"></a>'),false);
});
test('online detection supports encoded whitespace and the portal logout callback',()=>{
 assert.equal(onlineText('<p>当前登录账&nbsp;号</p><a onclick="logoff();"><img src="out.gif"></a>'),true);
});

test('startup recognizes the account and session table when logout is entirely graphical',async()=>{
 const h=await harness();globalThis.fetch=async()=>({ok:true,text:async()=>'<div>当前登录账号：示例</div><span>登录时间：12:00</span><table><tr><th>上网IP</th></tr></table>'});
 await h.start();assert.equal(h.session.run.reason,'已连接');assert.equal(h.created.length,0);
});
test('an unauthenticated startup still shows the login page and injects automation',async()=>{
 const h=await harness();await h.start();assert.equal(h.created.length,1);
 assert.deepEqual(h.created[0],{url:'http://202.117.144.205:8605/snnuportal/login.jsp',active:false});
 assert.equal(h.calls.inject,1);
});

test('internet access skips the campus request and every tab operation',async()=>{
 const h=await harness();const requests=[];
 globalThis.fetch=async(url,options)=>{requests.push(url);assert.equal(url,PROBE_URL);assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');return {status:200,redirected:false,text:async()=> 'Microsoft Connect Test'};};
 await h.start();assert.deepEqual(requests,[PROBE_URL]);assert.equal(h.session.run.reason,'已连接');assert.equal(h.created.length,0);assert.equal(h.calls.inject,0);
});
test('captive portal HTML returned with 200 is not an internet success',async()=>{
 const h=await harness();globalThis.fetch=async()=>({status:200,ok:true,text:async()=>'<form>校园网认证</form>'});
 await h.start();assert.equal(h.created.length,1);assert.equal(h.calls.inject,1);
});
test('probe timeout still permits campus login',async()=>{
 const h=await harness();globalThis.fetch=async url=>{if(url===PROBE_URL)throw new DOMException('timeout','TimeoutError');return {ok:true,text:async()=>'<form>登录</form>'};};
 await h.start();assert.equal(h.created.length,1);assert.equal(h.calls.inject,1);
});
test('successful automatic login closes only the extension-created portal tab after opening the new tab',async()=>{
 const h=await harness();await h.start();await h.msg({type:'submit'});await h.msg({type:'finish',reason:'已连接'});
 assert.equal(h.created.length,2);assert.deepEqual(h.removed,[7]);
});
test('a reused user portal tab is preserved after successful login',async()=>{
 const h=await harness();h.tabMap.set(7,{id:7,windowId:3,status:'complete',url:'http://202.117.144.205:8605/snnuportal/login.jsp'});
 h.chrome.tabs.create=async options=>{h.created.push(options);return {id:8,windowId:3,url:'chrome://newtab/'};};
 await h.start();await h.msg({type:'submit'});await h.msg({type:'finish',reason:'已连接'});
 assert.equal(h.created.length,1);assert.deepEqual(h.removed,[]);
});
test('new-tab failure does not close the authenticated tab',async()=>{
 const h=await harness();await h.start();await h.msg({type:'submit'});h.chrome.tabs.create=async()=>{throw new Error('closed window');};
 await h.msg({type:'finish',reason:'已连接'});assert.deepEqual(h.removed,[]);
});

test('portal checks start in background and activate once only when a login form is detected',async()=>{
 const h=await harness();await h.start();assert.equal(h.created[0].active,false);assert.deepEqual(h.activated,[]);
 await h.msg({type:'showLogin'});await h.msg({type:'showLogin'});
 assert.deepEqual(h.activated,[{id:7,active:true}]);
});
test('already-online fallback closes its temporary background tab without activating it',async()=>{
 const h=await harness();await h.start();h.chrome.tabs.query=async()=>[{id:1},{id:7}];
 await h.msg({type:'finish',reason:'已连接'});
 assert.deepEqual(h.activated,[]);assert.deepEqual(h.removed,[7]);assert.equal(h.created.length,1);
});
test('already-online redirected portal page is removed without activating or opening another tab',async()=>{
 const h=await harness();await h.start();
 const url='http://202.117.144.205:8605/snnuportal/success.jsp';
 h.chrome.tabs.get=async()=>({id:7,windowId:3,url});
 h.chrome.tabs.query=async()=>[{id:1},{id:7}];
 await h.msg({type:'finish',reason:'已连接'},{tab:{id:7,windowId:3},frameId:0,url});
 assert.equal(h.session.run.reason,'已连接');assert.equal(h.session.run.active,false);
 assert.deepEqual(h.activated,[]);assert.deepEqual(h.removed,[7]);assert.equal(h.created.length,1);
});

test('slow loading does not postpone the first page inspection until complete',async()=>{
 const h=await harness();const create=h.chrome.tabs.create;
 h.chrome.tabs.create=async options=>{const tab=await create(options);h.tabMap.get(tab.id).status='loading';return {...tab,status:'loading'};};
 await h.start();assert.equal(h.calls.inject,1);
});
test('timeout removes an unshown owned background tab without activating it',async()=>{
 const h=await harness();await h.start();h.chrome.tabs.query=async()=>[{id:1},{id:7}];
 h.chrome.alarms.onAlarm.handlers[0]({name:'deadline'});await h.popup({type:'status'});
 assert.deepEqual(h.removed,[7]);assert.deepEqual(h.activated,[]);
});
test('timeout preserves a login page that was shown for user interaction',async()=>{
 const h=await harness();await h.start();await h.msg({type:'showLogin'});h.chrome.tabs.query=async()=>[{id:1},{id:7}];
 h.chrome.alarms.onAlarm.handlers[0]({name:'deadline'});await h.popup({type:'status'});
 assert.deepEqual(h.removed,[]);
});
test('a late load event retries interrupted cleanup without restarting login',async()=>{
 const h=await harness();await h.start();h.chrome.tabs.query=async()=>[{id:1},{id:7}];
 let tries=0;h.chrome.tabs.remove=async id=>{if(++tries===1)throw new Error('temporarily busy');h.removed.push(id);};
 h.chrome.alarms.onAlarm.handlers[0]({name:'deadline'});await h.popup({type:'status'});
 h.chrome.tabs.onUpdated.handlers[0](7,{status:'complete'});await h.popup({type:'status'});
 assert.deepEqual(h.removed,[7]);assert.equal(h.created.length,1);assert.equal(h.session.run.active,false);
});
test('cleanup never closes a temporary tab the user navigated to a different site',async()=>{
 const h=await harness();await h.start();h.chrome.tabs.get=async()=>({url:'https://example.com'});h.chrome.tabs.query=async()=>[{id:1},{id:7}];
 h.chrome.alarms.onAlarm.handlers[0]({name:'deadline'});await h.popup({type:'status'});assert.deepEqual(h.removed,[]);
});

const fireCleanup=async h=>{
 h.chrome.alarms.onAlarm.handlers.at(-1)({name:'completed-tab-cleanup'});
 await h.popup({type:'status'});
};
test('successful login reuses the original new tab and leaves only that tab',async()=>{
 const h=await harness();h.tabMap.set(1,{id:1,windowId:3,url:'chrome://newtab/',active:true});
 await h.start();await h.msg({type:'showLogin'});await h.msg({type:'submit'});
 await h.msg({type:'finish',reason:'已连接'});
 assert.equal(h.created.length,1);assert.deepEqual(h.activated,[{id:7,active:true},{id:1,active:true}]);
 assert.deepEqual([...h.tabMap.keys()],[1]);assert.deepEqual(h.removed,[7]);
 assert.equal(h.session.run.cleanup.pending,false);assert.equal(h.alarms.has('completed-tab-cleanup'),false);
 await h.msg({type:'finish',reason:'已连接'});assert.equal(h.created.length,1);
});
for(const extra of [
 {url:'https://www.google.com/search?q=example'},
 {url:'chrome://newtab/',pendingUrl:'https://example.com/'},
 {url:'chrome://newtab/',pinned:true},
 {url:'chrome://newtab/',windowId:4}
])test(`a used, navigating, pinned or other-window tab is not reused: ${JSON.stringify(extra)}`,async()=>{
 const h=await harness();h.tabMap.set(1,{id:1,windowId:3,active:true,...extra});
 await h.start();await h.msg({type:'submit'});await h.msg({type:'finish',reason:'已连接'});
 assert.equal(h.created.length,2);assert.deepEqual(h.activated,[]);assert.equal(h.tabMap.get(1).url,extra.url);
});
test('a new tab that navigates between selection and activation is not reused',async()=>{
 const h=await harness();h.tabMap.set(1,{id:1,windowId:3,url:'chrome://newtab/'});
 await h.start();await h.msg({type:'submit'});const get=h.chrome.tabs.get;
 h.chrome.tabs.get=async id=>{if(id===1)h.tabMap.get(id).url='https://example.com/';return get(id);};
 await h.msg({type:'finish',reason:'已连接'});
 assert.equal(h.created.length,2);assert.deepEqual(h.activated,[]);assert.equal(h.tabMap.get(1).url,'https://example.com/');
});
test('a closed reuse candidate falls back to creating a new tab',async()=>{
 const h=await harness();h.tabMap.set(1,{id:1,windowId:3,url:'chrome://newtab/'});
 await h.start();await h.msg({type:'submit'});const update=h.chrome.tabs.update;
 h.chrome.tabs.update=async(id,options)=>{h.tabMap.delete(id);return update(id,options);};
 await h.msg({type:'finish',reason:'已连接'});assert.equal(h.created.length,2);assert.deepEqual(h.removed,[7]);
});
test('failed removal is retried by an alarm without new login or another homepage',async()=>{
 const h=await harness();h.tabMap.set(1,{id:1,windowId:3,url:'chrome://newtab/'});
 await h.start();await h.msg({type:'submit'});let attempts=0;const remove=h.chrome.tabs.remove;
 h.chrome.tabs.remove=async id=>{if(++attempts===1)throw new Error('busy');return remove(id);};
 await h.msg({type:'finish',reason:'已连接'});
 assert.equal(h.session.run.cleanup.pending,true);assert.equal(h.alarms.has('completed-tab-cleanup'),true);
 await fireCleanup(h);
 assert.equal(attempts,2);assert.deepEqual(h.removed,[7]);assert.equal(h.created.length,1);
 assert.equal(h.calls.inject,1);assert.equal(await h.msg({type:'submit'}),null);
 assert.equal(h.session.run.reason,'已连接');assert.equal(h.alarms.has('completed-tab-cleanup'),false);
});
test('removal retry survives a service worker restart',async()=>{
 const h=await harness();await h.start();await h.msg({type:'submit'});const remove=h.chrome.tabs.remove;
 h.chrome.tabs.remove=async()=>{throw new Error('busy');};await h.msg({type:'finish',reason:'已连接'});
 h.chrome.tabs.remove=remove;await import('../extension/background.js?cleanupRestart='+Math.random());
 await fireCleanup(h);assert.deepEqual(h.removed,[7]);assert.equal(h.created.length,2);
});
test('permanent removal failures stop after three attempts and explain the leftover page',async()=>{
 const h=await harness();await h.start();await h.msg({type:'submit'});let attempts=0;
 h.chrome.tabs.remove=async()=>{attempts++;throw new Error('busy');};await h.msg({type:'finish',reason:'已连接'});
 await fireCleanup(h);await fireCleanup(h);await fireCleanup(h);
 assert.equal(attempts,3);assert.equal(h.session.run.cleanup.pending,false);
 assert.equal(h.session.run.reason,'已连接，认证页未能自动关闭，请手动关闭');
 assert.equal(h.alarms.has('completed-tab-cleanup'),false);assert.equal(h.created.length,2);
});
test('switching off cancels pending cleanup even if enabled again before the alarm',async()=>{
 const h=await harness();await h.start();await h.msg({type:'submit'});let attempts=0;
 h.chrome.tabs.remove=async()=>{attempts++;throw new Error('busy');};await h.msg({type:'finish',reason:'已连接'});
 await h.popup({type:'toggle',enabled:false});await h.popup({type:'toggle',enabled:true});await fireCleanup(h);
 assert.equal(attempts,1);assert.equal(h.session.run.cleanup.pending,false);assert.equal(h.created.length,2);
});
for(const change of [
 {pendingUrl:'https://example.com/'},
 {url:'https://example.com/'},
 {url:'http://202.117.144.205:8605/snnuportal/logoff'},
 {active:true},
 {pinned:true}
])test(`cleanup retry preserves a tab taken over by the user: ${JSON.stringify(change)}`,async()=>{
 const h=await harness();await h.start();await h.msg({type:'submit'});const remove=h.chrome.tabs.remove;
 h.chrome.tabs.remove=async()=>{throw new Error('busy');};await h.msg({type:'finish',reason:'已连接'});
 Object.assign(h.tabMap.get(7),change);h.chrome.tabs.remove=remove;await fireCleanup(h);
 assert.deepEqual(h.removed,[]);assert.equal(h.session.run.cleanup.pending,false);
});
test('cleanup retry cannot close the last remaining tab in a window',async()=>{
 const h=await harness();await h.start();await h.msg({type:'submit'});const remove=h.chrome.tabs.remove;
 h.chrome.tabs.remove=async()=>{throw new Error('busy');};await h.msg({type:'finish',reason:'已连接'});
 h.tabMap.delete(8);h.chrome.tabs.remove=remove;await fireCleanup(h);
 assert.deepEqual(h.removed,[]);assert.equal(h.session.run.cleanup.pending,false);
});
test('manual closure clears pending cleanup without another operation',async()=>{
 const h=await harness();await h.start();await h.msg({type:'submit'});
 h.chrome.tabs.remove=async()=>{throw new Error('busy');};await h.msg({type:'finish',reason:'已连接'});
 h.tabMap.delete(7);h.chrome.tabs.onRemoved.handlers[0](7);await h.popup({type:'status'});
 assert.equal(h.session.run.cleanup.pending,false);assert.equal(h.alarms.has('completed-tab-cleanup'),false);
});
