// Execute only the relevant saved portal functions, with all DOM/network effects stubbed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const dir=new URL('../page-source/陕西师范大学网络Portal_files/',import.meta.url);
const available=['sweetalert.js','login.js'].every(name=>fs.existsSync(new URL(name,dir)));
function between(source,start,end){const a=source.indexOf(start);assert.ok(a>=0,start);const b=source.indexOf(end,a+start.length);assert.ok(b>a,end);return source.slice(a+start.length,b);}
function portalHarness(){
 const swalSource=fs.readFileSync(new URL('sweetalert.js',dir),'utf8');
 const loginSource=fs.readFileSync(new URL('login.js',dir),'utf8');
 const classes=new Set(),timers=[];let params,submissions=0,closes=0;
 const button={className:'confirm',tagName:'BUTTON',style:{},focus(){}};
 const modal={getAttribute:name=>name==='data-has-done-function'?'true':name==='data-timer'?'null':null,querySelector:()=>button};
 const dom={hasClass:(_,c)=>classes.has(c),isDescendant:(_,el)=>el===button,fadeIn(){},show(){},addClass:(_,c)=>classes.add(c),removeClass:(_,c)=>classes.delete(c)};
 const jquery=selector=>({val:()=>selector.includes('yys')?'mobile':null,submit:()=>submissions++});jquery.trim=s=>s.trim();
 const context=vm.createContext({e:{},t:{activeElement:null},v:()=>modal,h:()=>({}),l:dom,setTimeout:(fn,ms)=>timers.push({fn,ms}),sweetAlert:{close:()=>closes++},document:{forms:[{account:{value:'fake-account'},password:{value:'fake-password'},issave:{checked:false}}]},$:jquery,alert:()=>assert.fail('unexpected validation alert')});
 const openBody=between(swalSource,'}, g = function (n) {','}, w = function () {');
 const open=vm.runInContext('(function(n){'+openBody+'})',context);
 context.swal=(options,callback)=>{params={...options,doneFunction:callback};open(callback);};context.swal.close=context.sweetAlert.close;
 const clickBody=between(swalSource,'3: [function (t, n, o) {','}, {"./handle-dom":');
 const exports={};
 const require=name=>name==='./handle-dom'?dom:name==='./utils'?{colorLuminance:()=>''}:{};
 vm.runInContext('(function(t,n,o){'+clickBody+'})',context)(require,{exports},exports);
 const loginFn='function loginSubmit'+between(loginSource,'function loginSubmit','function check()');
 vm.runInContext(loginFn,context);context.loginSubmit(false);
 return {timers,click:()=>exports.default.handleButton({type:'click',target:button},params,modal),stats:()=>({submissions,closes})};
}
test('saved portal source: early confirm only closes; ready confirm submits the form', {skip:!available},()=>{
 const early=portalHarness();assert.equal(early.timers[0].ms,500);early.click();
 assert.deepEqual(early.stats(),{submissions:0,closes:1});
 const ready=portalHarness();ready.timers.find(t=>t.ms===500).fn();ready.click();
 assert.equal(ready.stats().submissions,1);
});
