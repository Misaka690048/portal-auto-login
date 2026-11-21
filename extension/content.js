(() => {
  if (globalThis.__portalRunner) return;
  globalThis.__portalRunner = true;
  if(location.origin!=='http://202.117.144.205:8605') return;
  function initialize(){
  const send=(type,extra={})=>chrome.runtime.sendMessage({type,...extra});
  const visible=e=>!!(e && e.getClientRects().length && getComputedStyle(e).visibility!=='hidden');
  const attr=(e,name)=>e.getAttribute?.(name)||'';
  const compact=value=>String(value||'').replace(/\s+/g,'');
  function findControl(kind,root=document,form=null){
    const label=kind==='login'?/^(登录|登陆|连接)$/:/^(确认|确定)$/;
    const candidates=[...root.querySelectorAll('button,a,input[type=submit],input[type=button],input[type=image],img,[role=button],[onclick],div,span')];
    const ranked=[];
    for(const e of candidates){
      if(!visible(e)||e.disabled||attr(e,'aria-disabled')==='true') continue;
      const labels=[e.innerText,e.value,e.alt,e.title,attr(e,'aria-label')].map(compact).filter(Boolean);
      const id=[e.id,e.name,attr(e,'class')].filter(Boolean).join(' ');
      const handler=attr(e,'onclick')+' '+attr(e,'href');
      const src=attr(e,'src')||e.src||'';
      // Actual SNNU login image supplied from the portal DOM; no text/alt required.
      const portalLoginImage=/(?:^|\/)image\/denglu01\.gif(?:[?#]|$)/i.test(src);
      // Never choose disconnect/cancel controls, even if their IDs contain "login".
      if(labels.some(v=>/取消|断开|退出|注销/.test(v)) || /logout|logoff|disconnect|cancel/i.test(id+' '+handler+' '+src)) continue;
      let score=labels.some(v=>label.test(v))?100:0;
      if(kind==='login'){
        if(portalLoginImage) score=Math.max(score,150);
        if(/(?:^|[^a-z])(?:doLogin|userLogin|login|logon)\s*\(/i.test(handler)) score=Math.max(score,90);
        if(/(?:login|logon)[_-]?(?:btn|button)|(?:btn|button)[_-]?(?:login|logon)/i.test(id)) score=Math.max(score,85);
        if(/(?:^|[/_-])(?:login|logon)(?:[_-](?:btn|button|on|off|normal|hover))?\.(?:png|gif|jpe?g|svg)(?:[?#]|$)/i.test(src)) score=Math.max(score,85);
        // A unique real submit control inside the password's form is a safe fallback.
        if(form && e.form===form && e.type==='submit') score=Math.max(score,50);
      }
      // A plain heading/span saying “登录” is not necessarily a button.
      // Resolve its clickable ancestor and prefer real controls over decorative text.
      const actionable='button,a,input[type=submit],input[type=button],input[type=image],[role=button],[onclick]';
      const target=e.closest?.(actionable)||e;
      const clickable=!!target.matches?.(actionable)||getComputedStyle(target).cursor==='pointer';
      const identified=portalLoginImage||/login|logon/i.test(id+' '+src+' '+handler);
      if(score && (clickable || (kind==='login' && identified))) {
        const previous=ranked.find(item=>item.e===target);
        const priority=score+(clickable?20:0);
        if(previous) previous.score=Math.max(previous.score,priority);
        else ranked.push({e:target,score:priority});
      }
    }
    ranked.sort((a,b)=>b.score-a.score);
    if(!ranked.length)return null;
    const best=ranked.filter(x=>x.score===ranked[0].score);
    // Text on nested wrappers refers to one control; prefer the deepest target.
    const leaves=best.filter(a=>!best.some(b=>a!==b&&a.e.contains?.(b.e)));
    return leaves.length===1?leaves[0].e:null;
  }
  function confirmReady(button){
    if(!button || !visible(button) || button.disabled) return false;
    const modal=button.closest?.('.sweet-alert');
    if(!modal) return true;
    // Portal SweetAlert adds `visible` 500 ms after showing the dialog.
    // Clicking earlier only closes it; handleButton does not call doneFunction.
    return modal.classList.contains('visible') &&
      modal.classList.contains('showSweetAlert') &&
      !modal.classList.contains('hideSweetAlert') &&
      attr(modal,'data-has-done-function')==='true';
  }
  function hasLogoutControl(){
    return [...document.querySelectorAll('a[href],[onclick]')].some(e=>{
      if(!visible(e)) return false;
      const href=attr(e,'href');
      let endpoint=false;
      try {
        const u=new URL(href,location.href);
        endpoint=!!href && u.origin===location.origin && u.pathname==='/snnuportal/logoff';
      } catch {}
      return endpoint || /(?:^|[^a-z])(?:logout|logoff)\s*\(/i.test(attr(e,'onclick'));
    });
  }
  let lastObservation='';
  let stopped=false, busy=false, timer, observer, errorBefore='', submittedHere=false, confirmedAt=0, missingLoginSince=0;
  const cleanup=()=>{stopped=true;clearInterval(timer);observer?.disconnect();chrome.storage.onChanged.removeListener(onStorage);};
  const onStorage=(changes,area)=>{if(area==='local' && changes.enabled?.newValue===false) cleanup();};
  const stop=async reason=>{cleanup();await send('finish',{reason});};
  function formParts(){
    const password=[...document.querySelectorAll('input[type=password]')].find(visible);
    if(!password) return null;
    const root=password.form||password.closest('form')||document.body;
    const fields=[...root.querySelectorAll('input')].filter(e=>visible(e)&&['text','tel','number',''].includes(e.type));
    const account=fields.find(e=>e.name==='account')||fields[0];
    const mobile=[...root.querySelectorAll('input[type=radio]')].find(e=>{
      const label=[...(e.labels||[])].map(l=>l.textContent).join('')+(e.nextSibling?.textContent||'');
      return /移动/.test(label)||/^(mobile|cmcc|中国移动)$/i.test(e.value);
    });
    return {password,account,mobile,root};
  }
  async function step(){
    if(stopped||busy) return;busy=true;
    try {
      const run=await send('state');if(!run){cleanup();return;}
      const body=document.body.innerText;
      // Authentication may redirect to another portal path. Recognize the session
      // before restricting where we are allowed to perform login actions.
      if(/当前登录[账帐]号/.test(compact(body))&&(/断开连接/.test(compact(body))||hasLogoutControl()||(/登录时间/.test(compact(body))&&/上网IP|上网时间/.test(compact(body))))){await stop('已连接');return;}
      if(!['/snnuportal/login.jsp','/snnuportal/login'].includes(location.pathname)){await stop('请在当前页面手动登录');return;}
      const failure=(body.match(/登录失败[^\n]*/)||[])[0]||'';
      if(run.phase==='result'){
        const observation=[...document.querySelectorAll('input[type=password]')].some(visible)?'login_form':'other';
        if(observation!==lastObservation){lastObservation=observation;await send('resultObservation',{observation});}
        const fresh=!submittedHere || failure!==errorBefore;
        if(failure && fresh && Date.now()-confirmedAt>150){
          await stop('登录失败，请在页面查看原因');
        }
        return;
      }
      if(run.phase==='confirm'){
        const confirm=findControl('confirm');
        if(confirmReady(confirm)){const authorized=await send('confirm');if(authorized&&!stopped&&confirmReady(confirm)){confirmedAt=Date.now();confirm.click();await send('clicked',{control:'confirm'});}}
        return;
      }
      const parts=formParts();if(!parts) return;
      if(!run.loginShown && !await send('showLogin')){cleanup();return;}
      const {account,password,mobile,root}=parts;
      if(!account?.value || !password.value) return;
      if(!mobile){await stop('未找到移动选项，需要适配页面');return;}
      if(!mobile.checked) mobile.click();
      const login=findControl('login',root,password.form) || (root!==document.body ? findControl('login',document,password.form) : null);
      if(!login){
        // Some portal scripts render the control after the credential fields.
        missingLoginSince ||= Date.now();
        if(Date.now()-missingLoginSince>=1500) await stop('未找到唯一的登录按钮，需要提供按钮 HTML 适配');
        return;
      }
      missingLoginSince=0;
      if(login.disabled) return;
      errorBefore=failure;
      const permit=await send('submit');
      if(permit&&!stopped){submittedHere=true;login.click();await send('clicked',{control:'login'});}
    }catch {await stop('页面操作失败，请手动登录或检查扩展错误');}
    finally {busy=false;}
  }
  chrome.storage.onChanged.addListener(onStorage);
  observer=new MutationObserver(()=>step());observer.observe(document.body,{childList:true,subtree:true,attributes:true});
  timer=setInterval(step,150);step();
  }
  if(document.readyState==='loading'||!document.body) document.addEventListener('DOMContentLoaded',initialize,{once:true});
  else initialize();
})();
