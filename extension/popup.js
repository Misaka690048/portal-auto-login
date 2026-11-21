const toggle=document.querySelector('#enabled'),status=document.querySelector('#status'),line=document.querySelector('.status-line');
let saving=false;
function render(s){
  toggle.checked=!!s.enabled;
  const reason=s.run?.reason||'等待下次启动 Chrome';
  status.title=reason;
  if(!s.enabled) status.textContent='已关闭';
  else if(s.run?.active) status.textContent=s.run.reason==='正在检测'?'正在检测…':'正在连接…';
  else if(reason.includes('等待下次启动')) status.textContent='下次启动时自动连接';
  else status.textContent=reason;
  line.dataset.tone=s.enabled?'brand':'muted';
}
async function refresh(){try{render(await chrome.runtime.sendMessage({type:'status'}));toggle.disabled=saving;}catch{status.textContent='状态读取失败，请重新打开';toggle.disabled=true;}}
toggle.addEventListener('change',async()=>{
  saving=true;toggle.disabled=true;
  try{render(await chrome.runtime.sendMessage({type:'toggle',enabled:toggle.checked}));}
  catch{toggle.checked=!toggle.checked;status.textContent='设置未保存，请重试';}
  finally{saving=false;toggle.disabled=false;}
});
chrome.storage.onChanged.addListener(()=>{if(!saving) refresh();});
refresh();
