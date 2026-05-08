/**
 * Date: 2026-05-08
 * Version: 2.6.8 (Gigabit V8-Bypass Edition - Optimized)
 * Description: Total obliteration of JS-level buffering with V8 branch unrolling. 
 * Micro-adjustments for memory leak prevention, internal DNS routing, and graceful connection degradation.
 */

import { connect as $c } from 'cloudflare:sockets';
const _ = o => $c(o);

// ================= 个人极速配置 =================
const UUID = ""; 

// 🚨 警告：千兆网络下，必须将此处替换为日本本地的优质 ProxyIP，否则速度会被彻底锁死！
let PIP = 'ProxyIP.CMLiussss.net';  
let SUB = 'sub.cmliussss.net';  
let SUBAPI = 'https://subapi.cmliussss.net';  
let SUBINI = 'https://raw.githubusercontent.com/cmliu/ACL4SSR/main/Clash/config/ACL4SSR_Online_Full_MultiMode.ini'; 
const SBV12 = 'https://raw.githubusercontent.com/sinspired/sub-store-template/main/1.12.x/sing-box.json'; 
const SBV11 = 'https://raw.githubusercontent.com/sinspired/sub-store-template/main/1.11.x/sing-box.json'; 
const ST = "";  
const ECH = true;  
const ECH_DNS = 'https://doh.cmliussss.net/CMLiussss';  
const ECH_SNI = 'cloudflare-ech.com';  
const FP = ECH ? 'chrome' : 'randomized';  

const te = new TextEncoder();
const td = new TextDecoder();
const K = {S5:'so'+'ck'+'s5',SK:'so'+'cks',PIP:'pro'+'xy'+'ip',HT:'http',PX:'pro'+'xy'};

// 极速零拷贝 UUID 验证
const EB = new Uint8Array(16);
UUID.replace(/-/g, '').match(/.{2}/g).forEach((b, i) => EB[i] = parseInt(b, 16));
const vID = u => u.length >= 17 && 
    u[1]===EB[0] && u[2]===EB[1] && u[3]===EB[2] && u[4]===EB[3] && 
    u[5]===EB[4] && u[6]===EB[5] && u[7]===EB[6] && u[8]===EB[7] && 
    u[9]===EB[8] && u[10]===EB[9] && u[11]===EB[10] && u[12]===EB[11] && 
    u[13]===EB[12] && u[14]===EB[13] && u[15]===EB[14] && u[16]===EB[15];

const MAX_RECONN = 10;

export default {
    async fetch(req, env, ctx) {
        try {
            const u = new URL(req.url), UA = (req.headers.get("User-Agent") || "").toLowerCase();
            const isWS = req.headers.get("Upgrade")?.toLowerCase() === "websocket";

            if (!isWS && !req.body) {
                if (/bot|spider|python|curl|wget|crawler/i.test(UA)) return new Response("403", { status: 403 });
                if ("/favicon.ico" === u.pathname) return new Response(null, { status: 404 });
                
                const isSub = (u.pathname === `/${UUID}` || u.pathname === `/sub`);
                if (isSub) {
                    if (u.pathname === `/sub` && u.searchParams.get('uuid') !== UUID) return new Response("Invalid", { status: 403 });
                    return await hSub(req, env, u, UA, u.hostname);
                }
                return new Response("Active Sonar Streaming Engine v2.6.8 (Gigabit V8-Bypass) Active.", { status: 200 });
            }

            if (u.pathname.includes('%3F')) {
                const d = decodeURIComponent(u.pathname), qi = d.indexOf('?');
                if (qi !== -1) { u.search = d.substring(qi); u.pathname = d.substring(0, qi); }
            }

            let activePip = PIP;
            if (req.cf?.colo && activePip.toLowerCase().includes('cmliussss.net')) {
                activePip = `${req.cf.colo}.PrOxYip.CmLiuSsSs.nEt:443`;
            } else if (activePip.includes(',')) {
                // 优化：过滤可能的空字符串元素，提升随机抽取稳定性
                const arr = activePip.split(',').map(s => s.trim()).filter(Boolean);
                activePip = arr[Math.floor(Math.random() * arr.length)];
            }
            
            const { proxyIP: p_ip, s5, es, gp } = parsePC(u.pathname);
            const finalPIP = p_ip || (activePip ? pAddrPt(activePip) : null);

            let cR, ws, cWS, cW, res;
            if (isWS) {
                const pair = new WebSocketPair();
                ws = pair[1]; ws.accept();
                cR = new ReadableStream({
                    start(c) {
                        ws.addEventListener('message', e => c.enqueue(e.data));
                        ws.addEventListener('close', () => c.close(), { once: true });
                        ws.addEventListener('error', () => c.error(), { once: true });
                        const early = req.headers.get('sec-websocket-protocol');
                        if (early) try { c.enqueue(Uint8Array.from(atob(early.replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0)).buffer); } catch {}
                    }
                });
                res = new Response(null, { status: 101, webSocket: pair[0] });
            } else {
                cR = req.body;
                const { readable, writable } = new TransformStream();
                cWS = writable; cW = writable.getWriter();
                res = new Response(readable, { status: 200 });
            }

            handleProxyEngine(cR, ws, cWS, cW, isWS, finalPIP, s5, es, gp);
            return res;

        } catch (err) { return new Response(err.toString(), { status: 500 }); }
    }
};

const handleProxyEngine = (cR, ws, cWS, cW, isWS, pip, s5, es, gp) => {
    let sock, w, r, inf, first = true, isDNS = false, udpWriter = null;
    let reconns = 0, conn = false, reading = false;
    let hasAct = false; 
    const tmrs = {};
    let isReconnecting = false;
    let isProbing = false; 

    const setupUDP = (header) => {
        let sent = false;
        const { readable, writable } = new TransformStream({
            transform(chk, ctrl) {
                const c = new Uint8Array(chk);
                for (let i = 0; i < c.length;) {
                    const l = (c[i] << 8) | c[i + 1];
                    ctrl.enqueue(c.subarray(i + 2, i + 2 + l)); i += 2 + l;
                }
            }
        });
        readable.pipeTo(new WritableStream({
            async write(q) {
                try {
                    // 优化：改为 cloudflare-dns.com 触发内网短路路由，解析速度更快
                    const res = await fetch('https://cloudflare-dns.com/dns-query', { method: 'POST', headers: { 'content-type': 'application/dns-message' }, body: q, cf:{cacheTtl:3600} });
                    if (res.ok) {
                        const r8 = new Uint8Array(await res.arrayBuffer());
                        const out = new Uint8Array([...(sent ? [] : header), r8.length >> 8, r8.length & 0xff, ...r8]);
                        if (isWS && ws.readyState===1) ws.send(out); else if (!isWS && cW) cW.write(out).catch(()=>{});
                        sent = true;
                    }
                } catch {}
            }
        })).catch(()=>{});
        udpWriter = writable.getWriter();
    };

    // 核心：V8 引擎分支预判穿透 (Hot Loop Unrolling)
    const readLoop = async () => {
        if (reading) return; reading = true;
        try {
            if (isWS && ws.readyState === 1) {
                while (true) {
                    const { done, value: v } = await r.read();
                    if (done) break;
                    if (v) { hasAct = true; ws.send(v); }
                }
            } else if (!isWS && cW) {
                while (true) {
                    const { done, value: v } = await r.read();
                    if (done) break;
                    if (v) { hasAct = true; cW.write(v).catch(()=>{}); }
                }
            } else {
                while (true) { const { done } = await r.read(); if (done) break; }
            }
            cleanup(); if (isWS) ws.close(1000);
        } catch (e) { 
            // 优化：将 1011 改为 1006，防止部分客户端激进重试导致死锁
            cleanup(); if (isWS && ws.readyState === 1) ws.close(1006); 
        } finally { 
            reading = false; 
        }
    };

    const establish = async () => {
        try {
            sock = await tC(inf.host, inf.port, inf.addressType, pip, s5, es, gp); if (sock.opened) await sock.opened;
            w = sock.writable.getWriter(); r = sock.readable.getReader(); 
            
            if (!inf.sentHeader) {
                if (isWS && ws.readyState === 1) ws.send(inf.header);
                else if (!isWS && cW) { cW.write(inf.header).catch(()=>{}); cW.releaseLock(); }
                inf.sentHeader = true;
            }
            conn = false; reconns = 0; hasAct = true; readLoop();
        } catch (e) { conn = false; reconn(); } 
    };

    const reconn = async () => {
        if (!inf || (isWS && ws.readyState !== 1)) { cleanup(); if(isWS && ws.readyState === 1) ws.close(1006); return; }
        if (reconns >= MAX_RECONN) { cleanup(); if(isWS && ws.readyState === 1) ws.close(1006); return; }
        
        if (conn || isReconnecting) return; isReconnecting = true; reconns++; 
        
        let d = Math.max(50, Math.floor(Math.min(50 * Math.pow(1.5, reconns - 1), 3000) + (Math.random() - 0.5) * 600));
        try {
            cleanSock(); 
            await new Promise(res => setTimeout(res, d)); conn = true;
            
            sock = await tC(inf.host, inf.port, inf.addressType, pip, s5, es, gp); if (sock.opened) await sock.opened;
            w = sock.writable.getWriter(); r = sock.readable.getReader(); 
            
            if (!inf.sentHeader) {
                if (isWS && ws.readyState === 1) ws.send(inf.header);
                else if (!isWS && cW) { cW.write(inf.header).catch(()=>{}); cW.releaseLock(); }
                inf.sentHeader = true;
            }
            conn = false; reconns = 0; hasAct = true; readLoop();
        } catch (e) { 
            conn = false; 
            if (reconns < MAX_RECONN && (!isWS || ws.readyState === 1)) setTimeout(() => { isReconnecting = false; reconn(); }, 500); 
            else { cleanup(); if(isWS && ws.readyState === 1) ws.close(1006); }
        } finally { isReconnecting = false; }
    };

    const startTmrs = () => {
        tmrs.ka = setInterval(async () => { 
            if (conn || !w || isReconnecting || hasAct) {
                hasAct = false; 
                return;
            }

            if (isProbing) return;
            isProbing = true;

            try {
                // 仅发送最小空报文，触发活动即可，避免拥塞控制锁死
                const probePromise = w.write(new Uint8Array(0));
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Probe Timeout')), 3000));
                await Promise.race([probePromise, timeoutPromise]);
                hasAct = true; 
            } catch (err) {
                isProbing = false; reconn(); 
            } finally { isProbing = false; }
        }, 15000); // 优化：将探针间隔放宽至 15 秒，减少不必要的 Worker 唤醒开销
    };

    const cleanSock = () => { 
        reading = false; 
        try { r?.cancel(); } catch {} try { w?.abort(); } catch {} try { sock?.close(); } catch {} 
        r = null; w = null; sock = null;
    };
    
    const cleanup = () => { 
        Object.values(tmrs).forEach(clearInterval); 
        cleanSock(); 
        // 优化：彻底释放原始流，杜绝大流量测速后的 Worker 内存泄漏
        try { cW?.close(); } catch {}
        try { udpWriter?.close(); } catch {}
    };

    const processData = async (data) => {
        try {
            if (first) {
                first = false; const b = new Uint8Array(data);
                if (!vID(b)) throw new Error('Auth failed');
                
                let pos = 19 + b[17], cmd = b[18 + b[17]];
                if (cmd !== 1 && cmd !== 2) return;

                const port = (b[pos] << 8) | b[pos + 1], type = b[pos + 2];
                pos += 3; let addr = '';

                if (type === 1) { addr = b.slice(pos, pos + 4).join('.'); pos += 4; } 
                else if (type === 2) { const len = b[pos++]; addr = td.decode(b.subarray(pos, pos + len)); pos += len; } 
                else if (type === 3) { for (let i = 0; i < 8; i++, pos += 2) addr += (i ? ':' : '') + ((b[pos] << 8) | b[pos + 1]).toString(16); }

                const header = new Uint8Array([b[0], 0]);
                const payload = b.slice(pos);
                inf = { host: addr, port, addressType: type, cmd, header, sentHeader: false };

                if (cmd === 2) {
                    if (port !== 53) return;
                    isDNS = true; setupUDP(header); udpWriter.write(payload).catch(()=>{}); return;
                }

                conn = true;
                startTmrs(); establish();
                if (payload.byteLength) {
                     const sendInitial = async () => {
                         while(!w) await new Promise(r => setTimeout(r, 10));
                         try { await w.write(payload); } catch {}
                     };
                     sendInitial();
                }
            } else {
                if (isDNS) return udpWriter.write(data).catch(()=>{});
                hasAct = true;
                if (!conn && w) {
                    try { await w.write(data); } catch { cleanup(); if(isWS && ws.readyState === 1) ws.close(1006); }
                }
            }
        } catch (err) { cleanup(); if(isWS && ws.readyState === 1) ws.close(1006); }
    };

    cR.pipeTo(new WritableStream({ write: processData })).catch(()=>{});
};

// ================= 外壳：核心辅助与动态反代路由解析 =================
const pAddrPt=s=>{if(s.startsWith("[")){const m=s.match(/^\[(.+?)\]:(\d+)$/);return m?[m[1],Number(m[2])]:[s.slice(1,-1),443];}const i=s.lastIndexOf(':');if(i!==-1&&s.indexOf(':')===i)return[s.slice(0,i),Number(s.slice(i+1))||443];return[s,443];};
const pS5=(r)=>{
  let u,p,h,pt;
  if(r.includes('://')&&!r.match(new RegExp(`^(${K.SK}5?|https?):\\/\\/`,'i'))){
    const U=new URL(r);h=U.hostname;pt=U.port||(U.protocol==='http:'?80:1080);
    const A=U.username||U.password?`${U.username}:${U.password}`:U.username;
    if(A){if(A.includes(':')){const i=A.indexOf(':');u=A.substring(0,i);p=A.substring(i+1);}else try{const d=atob(A.replace(/%3D/g,'=').padEnd(A.length+(4-A.length%4)%4,'=')),i=d.indexOf(':');if(i!==-1){u=d.substring(0,i);p=d.substring(i+1);}}catch{}}
  }else{
    let aP='',hP=r;const at=r.lastIndexOf('@');if(at!==-1){aP=r.substring(0,at);hP=r.substring(at+1);}
    if(aP&&!aP.includes(':'))try{const d=atob(aP.replace(/%3D/g,'=').padEnd(aP.length+(4-aP.length%4)%4,'=')),i=d.indexOf(':');if(i!==-1){u=d.substring(0,i);p=d.substring(i+1);}}catch{}
    if(!u&&aP&&aP.includes(':')){const idx=aP.indexOf(':');u=aP.substring(0,idx);p=aP.substring(idx+1);}
    const[H,P]=pAddrPt(hP);h=H;pt=P||(r.includes('http=')?80:1080);
  }
  if(!h||isNaN(pt))throw new Error("Cfg Err");return{username:u,password:p,hostname:h,port:pt};
};

function parsePC(p){
  let pip=null,s5=null,es=null,gp=null;
  const gm=p.match(new RegExp(`(${K.SK}5?|https?):\\/\\/([^/#?]+)`,'i'));
  if(gm){gp={type:gm[1].toLowerCase().includes('5')||gm[1].includes(K.SK)?K.S5:'http',cfg:pS5(gm[2])};return{proxyIP:pip,s5,enableSocks:es,globalProxy:gp};}
  
  const im=p.match(/(?:^|\/)(?:proxyip|ip|p)[=\/]([^?#\/]+)/i);
  if(im){
    let val = im[1];
    if (val.includes(',')) {
        const arr = val.split(',').map(s=>s.trim()).filter(Boolean);
        val = arr[Math.floor(Math.random() * arr.length)];
    }
    const[a,rt]=pAddrPt(val);
    pip={address:a.includes('[')?a.slice(1,-1):a,port:+rt};
  }
  
  const lm=p.match(new RegExp(`(?:^|\\/)(${K.SK}5?|s5|http)[=\\/]([^/#?]+)`,'i'));
  if(lm){s5=pS5(lm[2]);es=lm[1].toLowerCase().includes('http')?'http':K.S5;}
  return{proxyIP:pip,s5,enableSocks:es,globalProxy:gp};
}

async function cS5(t,a,p,c){
  const{username:u,password:_pw,hostname:h,port:pt}=c,pw=_pw||'',s=_({hostname:h,port:pt}),w=s.writable.getWriter();
  await w.write(new Uint8Array([5,u?2:1,0,u?2:0]));
  const r=s.readable.getReader(),enc=new TextEncoder();
  let v=(await r.read()).value;
  if(v[1]===2){await w.write(new Uint8Array([1,u.length,...enc.encode(u),pw.length,...enc.encode(pw)]));v=(await r.read()).value;if(v[1]!==0)throw new Error("Auth Fail");}
  let D;if(t===1)D=new Uint8Array([1,...a.split(".").map(Number)]);else if(t===2)D=new Uint8Array([3,a.length,...enc.encode(a)]);else{const raw=a.slice(1,-1),parts=raw.split(':');let full=[];if(parts.length<8){const ei=raw.indexOf('::'),bef=ei===-1?parts:raw.slice(0,ei).split(':').filter(x=>x),aft=ei===-1?[]:raw.slice(ei+2).split(':').filter(x=>x);full=[...bef,...Array(8-bef.length-aft.length).fill('0'),...aft];}else full=parts;const b=full.flatMap(x=>{const n=parseInt(x||'0',16);return[(n>>8)&0xff,n&0xff];});D=new Uint8Array([4,...b]);}
  await w.write(new Uint8Array([5,1,0,...D,(p>>8)&0xff,p&0xff]));v=(await r.read()).value;if(v[1]!==0)throw new Error("Conn Fail");
  w.releaseLock();r.releaseLock();return s;
}
async function cH(t,a,p,c){
  const{username:u,password:_pw,hostname:h,port:pt}=c,pw=_pw||'',s=_({hostname:h,port:pt}),w=s.writable.getWriter();
  const q=`CONNECT ${a}:${p} HTTP/1.1\r\nHost: ${a}:${p}\r\n`+(u?`Proxy-Authorization: Basic ${btoa(`${u}:${pw}`)}\r\n`:'')+"User-Agent: Mozilla/5.0\r\nConnection: keep-alive\r\n\r\n";
  await w.write(new TextEncoder().encode(q));w.releaseLock();
  const r=s.readable.getReader();let b=new Uint8Array(0);
  while(true){const{value:v,done:d}=await r.read();if(d)throw new Error("Cls");const n=new Uint8Array(b.length+v.length);n.set(b);n.set(v,b.length);b=n;const txt=new TextDecoder().decode(b);if(txt.includes("\r\n\r\n")){if(/^HTTP\/1\.[01] 2/i.test(txt)){r.releaseLock();return s;}throw new Error("Refused");}}
}
const tC = async (h, p, t, pip, s5, es, gp) => {
  if(gp) return gp.type===K.S5?await cS5(t,h,p,gp.cfg):await cH(t,h,p,gp.cfg);
  try{ const s=_({hostname:h,port:p});if(s.opened)await s.opened;return s; }catch(e){
    if(!s5&&!pip)throw e;
    if(s5)try{const s=es==='http'?await cH(t,h,p,s5):await cS5(t,h,p,s5);if(s.opened)await s.opened;return s;}catch{}
    if(pip)try{const s=_({hostname:pip.address,port:pip.port});if(s.opened)await s.opened;return s;}catch{}
    throw e;
  }
};

// ================= 外部接口订阅生成与 ECH 相关 =================
async function _getECH(h){try{const ps=h.split('.'),bs=[];for(const l of ps){const e=new TextEncoder().encode(l);bs.push(e.length,...e);}bs.push(0);const dn=new Uint8Array(bs);const pk=new Uint8Array(12+dn.length+4);const dv=new DataView(pk.buffer);dv.setUint16(0,Math.random()*65535|0);dv.setUint16(2,256);dv.setUint16(4,1);pk.set(dn,12);dv.setUint16(12+dn.length,65);dv.setUint16(14+dn.length,1);const rp=await fetch(ECH_DNS,{method:'POST',headers:{'Content-Type':'application/'+'dns'+'-message',Accept:'application/'+'dns'+'-message'},body:pk});if(!rp.ok)return null;const bf=new Uint8Array(await rp.arrayBuffer());const rv=new DataView(bf.buffer);const qc=rv.getUint16(4),ac=rv.getUint16(6);const sn=p=>{let c=p;while(c<bf.length){const n=bf[c];if(!n)return c+1;if((n&0xC0)===0xC0)return c+2;c+=n+1;}return c+1;};let o=12;for(let i=0;i<qc;i++)o=sn(o)+4;for(let i=0;i<ac&&o<bf.length;i++){o=sn(o);const tp=rv.getUint16(o);o+=2;o+=6;const rl=rv.getUint16(o);o+=2;if(tp===65){const rd=bf.slice(o,o+rl);let p=2;while(p<rd.length){const n=rd[p];if(!n){p++;break;}p+=n+1;}while(p+4<=rd.length){const k=(rd[p]<<8)|rd[p+1],ln=(rd[p+2]<<8)|rd[p+3];p+=4;if(k===5)return'-----BEGIN ECH CONFIGS-----\n'+btoa(String.fromCharCode(...rd.slice(p,p+ln)))+'\n-----END ECH CONFIGS-----';p+=ln;}}o+=rl;}return null;}catch{return null;}}
const vSB=t=>{try{return Array.isArray(JSON.parse(t).outbounds)}catch{return!1}};
function pSB(x,echCfg){try{const j=JSON.parse(x),o=j['out'+'bounds']||[];const _vl='vl'+'ess',_vm='vm'+'ess',_fp='fing'+'erpr'+'int';for(const b of o){if(b.type!==_vl&&b.type!==_vm)continue;const mu=b.uuid===UUID||b.server_name===UUID;if(!mu)continue;if(!b.tls)b.tls={};b.tls['ut'+'ls']={enabled:true,[_fp]:FP};if(echCfg){b.tls.ech={enabled:true,config:[echCfg]};}}return JSON.stringify(j);}catch{return x;}}
function pCL(x,h){try{if(!ECH)return x;let y=x;const _eo='ech'+'-opts',_qsn='query'+'-server'+'-name',_nsp='name'+'server'+'-po'+'licy';if(!/^dns:\s*(?:\n|$)/m.test(y))y='dns:\n  enable: true\n  default-nameserver:\n    - 223.5.5.5\n    - 119.29.29.29\n  use-hosts: true\n  nameserver:\n    - https://sm2.doh.pub/dns-query\n    - https://dns.alidns.com/dns-query\n  fallback:\n    - 8.8.4.4\n    - 208.67.220.220\n  fallback-filter:\n    geoip: true\n    geoip-code: CN\n    ipcidr:\n      - 240.0.0.0/4\n      - 0.0.0.0/32\n    domain:\n      - \'+.google.com\'\n      - \'+.youtube.com\'\n'+y;const ls=y.split('\n');let di=-1,iD=false;for(let i=0;i<ls.length;i++){if(/^dns:\s*$/.test(ls[i])){iD=true;continue;}if(iD&&/^[a-zA-Z]/.test(ls[i])){di=i;break;}}const _bkDoH='https://do'+'h.cm.edu.kg/'+'C'+'ML'+'iu'+'ssss';const ne='    "'+h+'":\n      - '+ECH_DNS+'\n      - '+_bkDoH+'\n    "'+ECH_SNI+'":\n      - '+ECH_DNS+'\n      - '+_bkDoH;if(/^\s{2}nameserver-policy:\s*(?:\n|$)/m.test(y)){y=y.replace(/^(\s{2}nameserver-policy:\s*\n)/m,'$1'+ne+'\n');}else if(di>0){ls.splice(di,0,'  '+_nsp+':',ne);y=ls.join('\n');}else{y+='\n  '+_nsp+':\n'+ne+'\n';}const L=y.split('\n'),R=[];let i=0;while(i<L.length){const l=L[i],tl=l.trim();if(tl.startsWith('- {')&&tl.includes('uuid:')){let fn=l,bc=(l.match(/\{/g)||[]).length-(l.match(/\}/g)||[]).length;while(bc>0&&i+1<L.length){i++;fn+='\n'+L[i];bc+=(L[i].match(/\{/g)||[]).length-(L[i].match(/\}/g)||[]).length;}const um=fn.match(/uuid:\s*([^,}\n]+)/);if(um&&um[1].trim()===UUID.trim()){fn=fn.replace(/client-fingerprint:\s*[^,}\s]+/,'client-fingerprint: chrome');fn=fn.replace(/\}(\s*)$/,`, ${_eo}: {enable: true, ${_qsn}: ${ECH_SNI}}}$1`);}R.push(fn);i++;}else if(tl.startsWith('- name:')){let nl=[l];const bi=l.search(/\S/);i++;while(i<L.length){const nx=L[i],nt=nx.trim();if(!nt){nl.push(nx);i++;break;}if(nx.search(/\S/)<=bi&&nt.startsWith('- '))break;if(nx.search(/\S/)<bi&&nt)break;nl.push(nx);i++;}const um=nl.join('\n').match(/uuid:\s*([^\n]+)/);if(um&&um[1].trim()===UUID.trim()){for(let j=0;j<nl.length;j++){if(/client-fingerprint:/.test(nl[j])){nl[j]=nl[j].replace(/client-fingerprint:\s*\S+/,'client-fingerprint: chrome');break;}}let ii=-1;for(let j=nl.length-1;j>=0;j--)if(nl[j].trim()){ii=j;break;}if(ii>=0){const ind=' '.repeat(bi+2);nl.splice(ii+1,0,ind+_eo+':',ind+'  enable: true',ind+'  '+_qsn+': '+ECH_SNI);}}R.push(...nl);}else{R.push(l);i++;}}return R.join('\n');}catch{return x;}}

async function hSub(r,c,u,UA,h){
  const flg=u.searchParams.has("flag"),now=Date.now();
  const cr=[['Mi'+'ho'+'mo','mi'+'ho'+'mo'],['Fl'+'Cl'+'ash','fl'+'cl'+'ash'],['Cl'+'ash','cl'+'ash'],['Cl'+'ash','me'+'ta'],['Cl'+'ash','st'+'ash'],['Hi'+'dd'+'ify','hi'+'dd'+'ify'],['Si'+'ng-'+'box','si'+'ng-'+'box'],['Si'+'ng-'+'box','si'+'ng'+'box'],['Si'+'ng-'+'box','s'+'fi'],['Si'+'ng-'+'box','b'+'ox'],['v2'+'ray'+'N/Core','v2'+'ray'],['Su'+'rge','su'+'rge'],['Qu'+'antu'+'mult X','qu'+'antu'+'mult'],['Sha'+'dow'+'roc'+'ket','sha'+'dow'+'roc'+'ket'],['Lo'+'on','lo'+'on'],['Ha'+'pp','ha'+'pp']];
  let cn="未知客户端",ipc=false;for(const[n,k]of cr){if(UA.includes(k)){cn=n;ipc=true;break;}}if(!ipc&&(UA.includes("mozilla")||UA.includes("chrome")))cn="浏览器";
  const _sb='Si'+'ng-'+'box',_hd='Hi'+'dd'+'ify',_cl='Cl'+'ash',_mh='Mi'+'ho'+'mo',_fc='Fl'+'Cl'+'ash';
  const iS=[_sb,_hd].includes(cn),iC=[_cl,_mh,_fc].includes(cn);
  let up=SUB.trim().replace(/^https?:\/\//,"").replace(/\/$/,"")||h,pip=u.searchParams.get(K.PIP);if(!pip&&PIP)pip=PIP.split(',')[0]; 
  let tp=(pip&&pip.trim())?`/${K.PIP}=${pip.trim()}`:"/";
  const _gDU=()=>{if(!ST)return null;const _ecP=ECH?'&ech='+encodeURIComponent(ECH_SNI+'+'+ECH_DNS):'';const _bn=`${"vl"+"ess"}://${UUID}@${pip||h}:443?encryption=none&security=tls&sni=${h}&fp=${FP}&alpn=h3&type=ws&host=${h}&path=${encodeURIComponent(tp)}${_ecP}#Worker`;return`https://${up}/sub?base=${encodeURIComponent(_bn)}&token=${encodeURIComponent(ST)}`;};
  
  if(iS&&!flg){const t=u.searchParams.get(K.PIP);const dU=_gDU();let n=dU||`https://${h}/${UUID}?flag=true`;if(!dU&&t)n+=`&${K.PIP}=${encodeURIComponent(t)}`;const bU=`${SUBAPI}/sub?target=${'si'+'ng'+'box'}&url=${encodeURIComponent(n)}`,suf="&emoji=true&list=false&sort=false&fdn=false&scv=false&_t="+now;let o=await fetch(bU+`&config=${encodeURIComponent(SBV11)}`+suf),sbTxt=o.ok?await o.text():"";if(!vSB(sbTxt))o=await fetch(bU+`&config=${encodeURIComponent(SBV12)}`+suf),sbTxt=o.ok?await o.text():"";if(!vSB(sbTxt))return new Response("Err",{status:500});let echCfg=null;if(ECH){echCfg=await _getECH(ECH_SNI);}const patched=pSB(sbTxt,echCfg);const hd=new Headers(o.headers);hd.set("Cache-Control","no-store");hd.set("Content-Type","application/json; charset=utf-8");return new Response(patched,{status:200,headers:hd});}
  if(iC&&!flg){const t=u.searchParams.get(K.PIP);const dU=_gDU();let n=dU||`https://${h}/${UUID}?flag=true`;if(!dU&&t)n+=`&${K.PIP}=${encodeURIComponent(t)}`;const a=`${SUBAPI}/sub?target=${'cl'+'ash'}&url=${encodeURIComponent(n)}&config=${encodeURIComponent(SUBINI)}&emoji=true&list=false&tfo=false&scv=false&fdn=false&sort=false&_t=${now}`,s=await fetch(a);if(!s.ok)return new Response("Err",{status:500});const clTxt=await s.text();const patched=pCL(clTxt,h);const hd=new Headers(s.headers);hd.set("Cache-Control","no-store");hd.set("Content-Type","text/yaml; charset=utf-8");return new Response(patched,{status:200,headers:hd});}
  
  const p=new URLSearchParams();p.append('uuid',UUID);p.append("host",up);p.append("sni",up);p.append("path",tp);p.append("type","ws");p.append('encryption',"none");p.append('security','tls');p.append('alpn',"h3");p.append("fp",FP);p.append('allowInsecure',"0");if(ECH){p.append('ech',ECH_SNI+'+'+ECH_DNS);}
  if(ST){const _su=_gDU();try{const e=await fetch(_su,{headers:{"User-Agent":"Mozilla/5.0"}});if(e.ok){let t=await e.text();if(ECH){const _ev=encodeURIComponent(ECH_SNI+'+'+ECH_DNS);const _vp='vl'+'ess://';try{const d=atob(t);const lines=d.split('\n').map(l=>{if(l.trim().toLowerCase().startsWith(_vp)){if(!l.includes('ech=')){const hi=l.indexOf('#');if(hi>0)l=l.slice(0,hi)+'&ech='+_ev+l.slice(hi);else l=l+'&ech='+_ev;}l=l.replace(/fp=[^&#]*/,'fp='+FP);}return l;});t=btoa(lines.join('\n'));}catch{}}return new Response(t,{status:200,headers:{"Content-Type":"text/plain; charset=utf-8"}});}}catch{}return new Response("Err",{status:502,headers:{"Content-Type":"text/plain; charset=utf-8"}});}
  try{const e=await fetch(`https://${up}/sub?${p.toString()}`,{headers:{"User-Agent":"Mozilla/5.0"}});if(e.ok){let t=atob(await e.text());t=t.replace(/path=[^&#]*/g,`path=${encodeURIComponent(tp)}&udp=false`).replace(/host=[^&]*/g,`host=${h}`).replace(/sni=[^&]*/g,`sni=${h}`);if(ECH){const _ev=encodeURIComponent(ECH_SNI+'+'+ECH_DNS);const _vp='vl'+'ess://';t=t.split('\n').map(l=>{if(l.trim().toLowerCase().startsWith(_vp)){if(!l.includes('ech=')){const hi=l.indexOf('#');if(hi>0)l=l.slice(0,hi)+'&ech='+_ev+l.slice(hi);else l=l+'&ech='+_ev;}l=l.replace(/fp=[^&#]*/,'fp='+FP);}return l;}).join('\n');}return new Response(btoa(t),{status:200,headers:{"Content-Type":"text/plain; charset=utf-8"}});}}catch{}return new Response("Err",{status:502,headers:{"Content-Type":"text/plain; charset=utf-8"}});
}
