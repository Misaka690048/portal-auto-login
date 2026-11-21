import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
async function fixture(variant='text'){
 const actions=[],listeners={};let tick,modal=false,run={phase:'ready',active:true};
 class Input {
  constructor(type,value=''){this.type=type;this._value=value;this.labels=[];this.id='';this.name='';this.placeholder='';}
  get value(){return this._value;}set value(v){this._value=v;}
  getClientRects(){return [1];}dispatchEvent(){}
 }
 const account=new Input('text','test-account'),password=new Input('password','test-password');
 const mobile=new Input('radio','mobile');mobile.nextSibling={textContent:'移动'};mobile.click=()=>{mobile.checked=true;actions.push('mobile');};
 const login={matches:()=>true,innerText:'登录',getClientRects:()=>[1],click:()=>{actions.push('login');modal=true;}};
 if(variant==='img') {delete login.innerText;login.src='/snnuportal/images/login.gif';}
 if(variant==='div') {delete login.innerText;login.id='login_btn';}
 if(variant==='onclick') {delete login.innerText;login.getAttribute=n=>n==='onclick'?'return doLogin();':null;}
 if(variant==='spaces') {login.innerText='   ';login.title='登 录';}
 if(variant==='disconnect') {login.innerText='断开连接';login.id='login_btn';}
 if(variant==='unknown') {delete login.innerText;}
 if(variant.startsWith('denglu')) {
   delete login.innerText;
   login.matches=()=>false;
   login.src=variant==='denglu-absolute'?'http://202.117.144.205:8605/snnuportal/image/denglu01.gif?v=1':'image/denglu01.gif';
   login.getAttribute=name=>name==='src'?login.src:null;
   if(variant==='denglu-parent') {
     const parent={matches:()=>true,click:login.click};
     login.closest=()=>parent;
     login.click=()=>actions.push('WRONG_CHILD');
   }
 }

 const confirm={matches:()=>true,innerText:'确认',getClientRects:()=>modal?[1]:[],click:()=>{actions.push('confirm');modal=false;}};
 const swalClasses=new Set(['sweet-alert','showSweetAlert']);
 const swalModal={classList:{contains:c=>swalClasses.has(c)},getAttribute:n=>n==='data-has-done-function'?'true':null};
 if(variant==='sweetalert') {
   confirm.closest=selector=>selector==='.sweet-alert'?swalModal:null;
   confirm.click=()=>{actions.push(swalClasses.has('visible')?'confirm':'CLOSED_WITHOUT_SUBMIT');modal=false;};
 }
 const heading={innerText:'登录',getClientRects:()=>[1],click:()=>actions.push('WRONG_HEADING')};
 const root={querySelectorAll:s=>s==='input'?[account,password]:s==='input[type=radio]'?[mobile]:[heading,login]};password.form=root;
 const body={innerText:'用户登录'};
 const extraControls=[];
 const doc={body,querySelectorAll:s=>s==='input[type=password]'?[password]:[heading,login,confirm,...extraControls],addEventListener:(n,f)=>listeners[n]=f,removeEventListener(){}};
 const context={document:doc,location:{origin:'http://202.117.144.205:8605',href:'http://202.117.144.205:8605/snnuportal/login.jsp',pathname:'/snnuportal/login.jsp'},Node:{DOCUMENT_POSITION_PRECEDING:2},HTMLInputElement:Input,HTMLImageElement:class{},Event:class{},Date,URL,MutationObserver:class{observe(){}disconnect(){}},getComputedStyle:()=>({visibility:'visible'}),setInterval:f=>{tick=f;return 1;},clearInterval(){},chrome:{storage:{onChanged:{addListener:f=>listeners.storage=f,removeListener(){}}},runtime:{sendMessage:async m=>{
 if(m.type==='state')return run?.active?{...run}:null;
 if(m.type==='showLogin'){run.loginShown=true;return {...run};}
 if(m.type==='submit'){assert.equal(run.phase,'ready');run.phase='confirm';actions.push('submit');return {...run};}
 if(m.type==='confirm'){run.phase='result';return {...run};}
 if(m.type==='finish'){run.active=false;actions.push(m.reason);}
 }}}};
 if(variant==='parsing'){doc.body=null;doc.readyState='loading';}
 vm.runInNewContext(fs.readFileSync(new URL('../extension/content.js',import.meta.url),'utf8'),context);
 const drain=()=>new Promise(r=>setImmediate(r));await drain();
 return {ready:async()=>{doc.body=body;doc.readyState='interactive';listeners.DOMContentLoaded();await drain();},location:context.location,actions,body,account,password,listeners,extraControls,swalClasses,swalModal,step:async()=>{tick();await drain();},run};
}
test('normal login selects mobile, submits, then confirms before detecting success',async()=>{
 const f=await fixture();assert.deepEqual(f.actions,['mobile','submit','login']);await f.step();assert.deepEqual(f.actions,['mobile','submit','login','confirm']);f.body.innerText='当前登录账号 断开连接';await f.step();assert.equal(f.actions.at(-1),'已连接');await f.step();assert.equal(f.actions.filter(x=>x==='login').length,1);
});
test('switching off prevents pending confirmation',async()=>{
 const f=await fixture();f.listeners.storage({enabled:{newValue:false}},'local');await f.step();assert.equal(f.actions.includes('confirm'),false);
});

for(const variant of ['img','div','onclick','spaces'])test(`login control variant: ${variant}`,async()=>{const f=await fixture(variant);assert.deepEqual(f.actions,['mobile','submit','login']);await f.step();assert.equal(f.actions.at(-1),'confirm');});
for(const variant of ['disconnect','unknown'])test(`does not click unsupported or disconnect control: ${variant}`,async()=>{const f=await fixture(variant);assert.deepEqual(f.actions,['mobile']);assert.equal(f.run.phase,'ready');});

test('a decorative login heading cannot outrank an image button',async()=>{const f=await fixture('img');assert.equal(f.actions.includes('WRONG_HEADING'),false);assert.equal(f.actions.includes('login'),true);});

for(const variant of ['denglu-image','denglu-absolute','denglu-parent'])test(`actual portal image: ${variant}`,async()=>{
 const f=await fixture(variant);
 assert.deepEqual(f.actions,['mobile','submit','login']);
 await f.step();assert.equal(f.actions.at(-1),'confirm');
 assert.equal(f.actions.includes('WRONG_CHILD'),false);
});
test('success page with an image-only logout link is recognized',async()=>{
 const f=await fixture();await f.step();
 f.body.innerText='当前登录账号：测试账号';
 f.extraControls.push({getClientRects:()=>[1],getAttribute:name=>name==='href'?'/snnuportal/logoff':null});
 await f.step();assert.equal(f.actions.at(-1),'已连接');
});
test('success labels tolerate layout whitespace',async()=>{
 const f=await fixture();await f.step();f.body.innerText='当前登录账 号：测试账号\n断 开 连 接';
 await f.step();assert.equal(f.actions.at(-1),'已连接');
});
test('a logout link alone does not count as authenticated',async()=>{
 const f=await fixture();await f.step();
 f.extraControls.push({getClientRects:()=>[1],getAttribute:name=>name==='href'?'/snnuportal/logoff':null});
 await f.step();assert.notEqual(f.actions.at(-1),'已连接');
});

test('SweetAlert must reach its visible state before confirmation',async()=>{
 const f=await fixture('sweetalert');
 await f.step();assert.equal(f.run.phase,'confirm');
 assert.deepEqual(f.actions,['mobile','submit','login']);
 f.swalClasses.add('visible');await f.step();
 assert.equal(f.run.phase,'result');assert.equal(f.actions.at(-1),'confirm');
 assert.equal(f.actions.includes('CLOSED_WITHOUT_SUBMIT'),false);
});
test('closing SweetAlert cannot be confirmed even with a stale visible class',async()=>{
 const f=await fixture('sweetalert');f.swalClasses.add('visible');f.swalClasses.add('hideSweetAlert');
 await f.step();assert.equal(f.run.phase,'confirm');assert.equal(f.actions.includes('confirm'),false);
});
test('turning off while SweetAlert opens prevents its later confirmation',async()=>{
 const f=await fixture('sweetalert');await f.step();f.listeners.storage({enabled:{newValue:false}},'local');
 f.swalClasses.add('visible');await f.step();assert.deepEqual(f.actions,['mobile','submit','login']);
});

test('unexpected logout page stops without another submit',async()=>{
 const f=await fixture();f.location.pathname='/snnuportal/logoff';await f.step();
 assert.equal(f.actions.at(-1),'请在当前页面手动登录');
 assert.equal(f.actions.filter(a=>a==='submit').length,1);
});

test('success is recognized from the account and session table without logout text',async()=>{
 const f=await fixture();f.body.innerText='当前登录账号：示例\n登录时间：12:00\n上网IP';
 await f.step();assert.equal(f.actions.at(-1),'已连接');
});

test('early injection waits for DOM parsing but does not require all page resources to finish',async()=>{
 const f=await fixture('parsing');assert.deepEqual(f.actions,[]);
 await f.ready();assert.deepEqual(f.actions,['mobile','submit','login']);
});

for(const path of ['/snnuportal/success.jsp','/snnuportal/login;jsessionid=test-session','/snnuportal/login/']) {
 test(`already authenticated redirect is recognized before restricting login actions: ${path}`,async()=>{
  const f=await fixture('parsing');
  f.location.pathname=path;f.location.href=f.location.origin+path;
  f.body.innerText='当前登录账号：示例\n登录时间：12:00\n上网IP';
  await f.ready();
  assert.deepEqual(f.actions,['已连接']);
  assert.equal(f.run.loginShown,undefined);
 });
}
test('an unknown unauthenticated page cannot activate or submit the login form',async()=>{
 const f=await fixture('parsing');f.location.pathname='/snnuportal/unknown.jsp';
 await f.ready();assert.deepEqual(f.actions,['请在当前页面手动登录']);
 assert.equal(f.run.loginShown,undefined);
});
test('a redirected success after confirmation finishes without another submission',async()=>{
 const f=await fixture();await f.step();
 f.location.pathname='/snnuportal/success.jsp';f.body.innerText='当前登录账号：示例 断开连接';
 await f.step();await f.step();
 assert.deepEqual(f.actions,['mobile','submit','login','confirm','已连接']);
});
