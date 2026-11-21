export const BASE = 'http://202.117.144.205:8605/snnuportal/';
export function portal(url) {
  try { const u = new URL(url); return u.origin === new URL(BASE).origin && u.pathname.startsWith('/snnuportal/'); } catch { return false; }
}
export function live(run, enabled, now = Date.now()) {
  return !!(enabled && run?.active && now < run.deadline);
}
// Runs in the service worker before any visible tab is created.
// Keep HTML attributes: the portal can render logout as an image-only link.
function decodeEntities(value) {
  return value.replace(/&(?:nbsp|ensp|emsp);/gi,' ').replace(/&amp;/gi,'&')
    .replace(/&#(x[0-9a-f]+|[0-9]+);?/gi,(_,code)=>{
      const n=code[0].toLowerCase()==='x'?parseInt(code.slice(1),16):parseInt(code,10);
      return n>0 && n<=0x10ffff?String.fromCodePoint(n):'';
    });
}
export function onlineText(content) {
  const html=String(content).replace(/<!--[\s\S]*?-->/g,'')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'');
  const text=decodeEntities(html.replace(/<[^>]*>/g,'')).replace(/\s+/g,'');
  if(!/当前登录[账帐]号/.test(text)) return false;
  if(/断开连接/.test(text)) return true;
  // Session table shown in the supplied authenticated-page screenshot.
  if(/登录时间/.test(text) && /上网IP|上网时间/.test(text)) return true;
  for(const tag of html.matchAll(/<(?:a|button|form|input|img|div|span)\b[^>]*>/gi)) {
    for(const a of tag[0].matchAll(/\b(href|action|onclick)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi)) {
      const value=decodeEntities(a[2]??a[3]??a[4]??'');
      if(a[1].toLowerCase()==='onclick') {
        if(/(?:^|[^a-z])(?:logout|logoff)\s*\(/i.test(value)) return true;
      } else {
        try {
          const u=new URL(value,BASE);
          if(u.origin===new URL(BASE).origin && u.pathname==='/snnuportal/logoff') return true;
        } catch {}
      }
    }
  }
  return false;
}
