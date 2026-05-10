import { connect } from 'cloudflare:sockets';

const te = new TextEncoder();
const td = new TextDecoder();

const myID = '';

let PIP = 'ProxyIP.CMLiussss.net';  
let SUB = 'owo.o00o.ooo';  
let SUBAPI = 'https://subapi.cmliussss.net';  
let SUBINI = 'https://raw.githubusercontent.com/cmliu/ACL4SSR/main/Clash/config/ACL4SSR_Online_Full_MultiMode.ini'; 
const SBV12 = 'https://raw.githubusercontent.com/sinspired/sub-store-template/main/1.12.x/sing-box.json'; 
const SBV11 = 'https://raw.githubusercontent.com/sinspired/sub-store-template/main/1.11.x/sing-box.json'; 
const ST = "";  
const ECH = true;  
const ECH_DNS = 'https://odvr.nic.cz/doh';  
const ECH_SNI = 'cloudflare-ech.com';  
const FP = ECH ? 'chrome' : 'randomized';

const EXPECTED_BYTES = new Uint8Array(16);
{
    const hex = myID.replace(/-/g, '');
    for (let i = 0; i < 16; i++) {
        EXPECTED_BYTES[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    }
}

function verifyID(data) {
    const u8 = new Uint8Array(data);
    if (u8.length < 17) return false;
    for (let i = 0; i < 16; i++) {
        if (u8[i + 1] !== EXPECTED_BYTES[i]) return false;
    }
    return true;
}

export default {
    async fetch(req, env) {
        const isWS = req.headers.get('Upgrade')?.toLowerCase() === 'websocket';
        const u = new URL(req.url);
        
        // 订阅路由拦截
        if (!isWS && !req.body) {
            const UA = (req.headers.get("User-Agent") || "").toLowerCase();
            const isSub = (u.pathname === `/${myID}` || u.pathname === `/sub`);
            if (isSub) {
                if (u.pathname === `/sub` && u.searchParams.get('uuid') !== myID) return new Response("Invalid", { status: 403 });
                return await hSub(req, env, u, UA, u.hostname);
            }
            return new Response("OK", { status: 200 });
        }

        if (u.pathname.includes('%3F')) {
            const decoded = decodeURIComponent(u.pathname);
            const queryIndex = decoded.indexOf('?');
            if (queryIndex !== -1) {
                u.search = decoded.substring(queryIndex);
                u.pathname = decoded.substring(0, queryIndex);
            }
        }

        let sParam = u.pathname.split('/s=')[1];
        let gParam = u.pathname.split('/g=')[1];
        let pParamInput = u.pathname.split('/p=')[1];
        
        const colo = req.cf?.colo || 'LAX';
        const dynamicProxy = `${colo}.PrOxYip.CmLiuSsSs.nEt:443`;
        
        let mode = 'default';
        // 优先级：1. 手动指定的 proxyip -> 2. 全局配置的 PIP -> 3. 动态 CF 节点
        let pParam = pParamInput || PIP || dynamicProxy;
        let skJson;

        if (sParam && !gParam) {
            mode = 's'; skJson = getSKJson(sParam);
        } else if (gParam) {
            mode = 'g'; skJson = getSKJson(gParam);
        } else if (pParamInput) {
            mode = 'p'; 
        }

        let clientRead, clientWrite, response, ws;

        if (isWS) {
            const pair = new WebSocketPair();
            ws = pair[1];
            ws.accept();
            clientRead = new ReadableStream({
                start(ctrl) {
                    ws.addEventListener('message', e => ctrl.enqueue(e.data));
                    ws.addEventListener('close', () => ctrl.close());
                    ws.addEventListener('error', () => ctrl.error());
                    const early = req.headers.get('sec-websocket-protocol');
                    if (early) {
                        try {
                            ctrl.enqueue(Uint8Array.from(atob(early.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)).buffer);
                        } catch { }
                    }
                }
            });
            response = new Response(null, { status: 101, webSocket: pair[0] });
        } else {
            clientRead = req.body;
            const { readable, writable } = new TransformStream();
            clientWrite = writable.getWriter();
            response = new Response(readable, { status: 200 });
        }

        let remote = null, udpWriter = null, isDNS = false;

        clientRead.pipeTo(new WritableStream({
            async write(data) {
                if (isDNS) {
                    try { await udpWriter?.write(data); } catch (e) {}
                    return;
                }
                if (remote) {
                    try {
                        const w = remote.writable.getWriter();
                        await w.write(data);
                        w.releaseLock();
                    } catch (e) {}
                    return;
                }

                const u8 = new Uint8Array(data);
                if (u8.length < 24) return;
                
                if (!verifyID(u8)) {
                    try { if (isWS && ws.readyState === 1) ws.close(1008); } catch {}
                    return;
                }

                const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
                const optLen = view.getUint8(17);
                const cmd = view.getUint8(18 + optLen);
                if (cmd !== 1 && cmd !== 2) return;

                let pos = 19 + optLen;
                const port = view.getUint16(pos);
                const type = view.getUint8(pos + 2);
                pos += 3;

                let addr = '';
                if (type === 1) {
                    addr = `${view.getUint8(pos)}.${view.getUint8(pos + 1)}.${view.getUint8(pos + 2)}.${view.getUint8(pos + 3)}`;
                    pos += 4;
                } else if (type === 2) {
                    const len = view.getUint8(pos++);
                    addr = td.decode(u8.subarray(pos, pos + len));
                    pos += len;
                } else if (type === 3) {
                    const ipv6 = [];
                    for (let i = 0; i < 8; i++, pos += 2) ipv6.push(view.getUint16(pos).toString(16));
                    addr = ipv6.join(':');
                } else return;

                const header = new Uint8Array([u8[0], 0]);
                const payload = u8.slice(pos);

                if (cmd === 2) {
                    if (port !== 53) return;
                    isDNS = true;
                    let dnsSent = false;
                    const { readable, writable } = new TransformStream({
                        transform(chunk, ctrl) {
                            const chunkU8 = new Uint8Array(chunk);
                            for (let i = 0; i < chunkU8.length;) {
                                const len = new DataView(chunkU8.buffer, chunkU8.byteOffset + i, 2).getUint16(0);
                                ctrl.enqueue(chunkU8.slice(i + 2, i + 2 + len));
                                i += 2 + len;
                            }
                        }
                    });

                    readable.pipeTo(new WritableStream({
                        async write(query) {
                            try {
                                const resp = await fetch('https://1.1.1.1/dns-query', {
                                    method: 'POST',
                                    headers: { 'content-type': 'application/dns-message' },
                                    body: query
                                });
                                if (resp.ok) {
                                    const result = new Uint8Array(await resp.arrayBuffer());
                                    const out = new Uint8Array([...(dnsSent ? [] : header), result.length >> 8, result.length & 0xff, ...result]);
                                    if (isWS && ws.readyState === 1) ws.send(out);
                                    else if (!isWS) await clientWrite.write(out).catch(() => {});
                                    dnsSent = true;
                                }
                            } catch { }
                        }
                    })).catch(() => {});
                    udpWriter = writable.getWriter();
                    try { await udpWriter.write(payload); } catch (e) {}
                    return;
                }

                let sock = null;

                try {
                    if (mode === 's' && skJson) {
                        sock = await sConnect(addr, port, skJson);
                    } else if (mode === 'p' && pParamInput) {
                        const [ph, pp] = pParamInput.split(':');
                        sock = connect({ hostname: ph, port: +(pp || port) });
                        await sock.opened;
                    } else if (mode === 'd') {
                        sock = connect({ hostname: addr, port });
                        await sock.opened;
                    } else {
                        try {
                            sock = connect({ hostname: addr, port });
                            await sock.opened;
                        } catch (err) {
                            const [ph, pp] = pParam.split(':');
                            sock = connect({ hostname: ph, port: +(pp || 443) });
                            await sock.opened;
                        }
                    }
                } catch (err) {}

                if (!sock) {
                    try { if (isWS && ws.readyState === 1) ws.close(1011); } catch {}
                    try { clientWrite.close(); } catch {}
                    return;
                }

                remote = sock;

                try {
                    if (isWS && ws.readyState === 1) ws.send(header);
                    else if (!isWS) clientWrite.write(header).catch(() => {});
                } catch {}

                try {
                    const w = sock.writable.getWriter();
                    await w.write(payload);
                    w.releaseLock();
                } catch (e) {
                    try { if (isWS && ws.readyState === 1) ws.close(1011); } catch {}
                    try { sock.close(); } catch {}
                    return;
                }

                const reader = sock.readable.getReader();
                const batch = [];
                let bSz = 0;
                let bTmr = null;

                let bytesSinceYield = 0;
                const YIELD_LIMIT = 1024 * 1024; 

                const flush = () => {
                    if (!bSz) return;
                    try {
                        let out;
                        if (batch.length === 1) {
                            out = batch[0]; 
                        } else {
                            out = new Uint8Array(bSz);
                            let off = 0;
                            for (const c of batch) {
                                out.set(c, off);
                                off += c.length;
                            }
                        }
                        if (isWS && ws.readyState === 1) ws.send(out);
                        else if (!isWS) clientWrite.write(out).catch(() => {});
                    } catch {}
                    
                    batch.length = 0; 
                    bSz = 0;
                    if (bTmr) { clearTimeout(bTmr); bTmr = null; }
                };

                (async () => {
                    try {
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) { flush(); break; }
                            if (!value || value.byteLength === 0) continue;

                            bytesSinceYield += value.byteLength;
                            if (bytesSinceYield >= YIELD_LIMIT) {
                                await new Promise(r => setTimeout(r, 1)); 
                                bytesSinceYield = 0;
                            }

                            if (value.byteLength < 32768) {
                                batch.push(value);
                                bSz += value.byteLength;
                                if (bSz >= 65536) flush(); 
                                else if (!bTmr) bTmr = setTimeout(flush, 15);
                            } else {
                                flush(); 
                                try {
                                    if (isWS && ws.readyState === 1) ws.send(value);
                                    else if (!isWS) clientWrite.write(value).catch(() => {});
                                } catch {}
                            }
                        }
                    } catch (_) {
                    } finally {
                        flush();
                        try { reader.releaseLock(); } catch { }
                        if (!isWS) { try { clientWrite.close(); } catch { } }
                    }
                })();

            }
        })).catch(() => { }).finally(() => {
            try { remote?.close(); } catch {}
        });

        return response;
    }
};

const SK_CACHE = new Map();

function getSKJson(path) {
    const cached = SK_CACHE.get(path);
    if (cached) return cached;

    const hasAuth = path.includes('@');
    const [cred, server] = hasAuth ? path.split('@') : [null, path];
    const [user = null, pass = null] = hasAuth ? cred.split(':') : [null, null];
    const [host, port = 443] = server.split(':');
    const result = { user, pass, host, port: +port };

    SK_CACHE.set(path, result);
    return result;
}

async function sConnect(targetHost, targetPort, skJson) {
    const sock = connect({
        hostname: skJson.host,
        port: skJson.port
    });
    await sock.opened;
    const w = sock.writable.getWriter();
    const r = sock.readable.getReader();
    await w.write(new Uint8Array([5, 2, 0, 2]));
    const auth = (await r.read()).value;
    if (auth[1] === 2 && skJson.user) {
        const user = te.encode(skJson.user);
        const pass = te.encode(skJson.pass);
        await w.write(new Uint8Array([1, user.length, ...user, pass.length, ...pass]));
        await r.read();
    }
    const domain = te.encode(targetHost);
    await w.write(new Uint8Array([5, 1, 0, 3, domain.length, ...domain, targetPort >> 8, targetPort & 0xff]));
    await r.read();
    w.releaseLock();
    r.releaseLock();
    return sock;
}

// ================= 从代码2接入的外部接口订阅与 ECH 逻辑 =================
async function _getECH(h){try{const ps=h.split('.'),bs=[];for(const l of ps){const e=new TextEncoder().encode(l);bs.push(e.length,...e);}bs.push(0);const dn=new Uint8Array(bs);const pk=new Uint8Array(12+dn.length+4);const dv=new DataView(pk.buffer);dv.setUint16(0,Math.random()*65535|0);dv.setUint16(2,256);dv.setUint16(4,1);pk.set(dn,12);dv.setUint16(12+dn.length,65);dv.setUint16(14+dn.length,1);const rp=await fetch(ECH_DNS,{method:'POST',headers:{'Content-Type':'application/'+'dns'+'-message',Accept:'application/'+'dns'+'-message'},body:pk});if(!rp.ok)return null;const bf=new Uint8Array(await rp.arrayBuffer());const rv=new DataView(bf.buffer);const qc=rv.getUint16(4),ac=rv.getUint16(6);const sn=p=>{let c=p;while(c<bf.length){const n=bf[c];if(!n)return c+1;if((n&0xC0)===0xC0)return c+2;c+=n+1;}return c+1;};let o=12;for(let i=0;i<qc;i++)o=sn(o)+4;for(let i=0;i<ac&&o<bf.length;i++){o=sn(o);const tp=rv.getUint16(o);o+=2;o+=6;const rl=rv.getUint16(o);o+=2;if(tp===65){const rd=bf.slice(o,o+rl);let p=2;while(p<rd.length){const n=rd[p];if(!n){p++;break;}p+=n+1;}while(p+4<=rd.length){const k=(rd[p]<<8)|rd[p+1],ln=(rd[p+2]<<8)|rd[p+3];p+=4;if(k===5)return'-----BEGIN ECH CONFIGS-----\n'+btoa(String.fromCharCode(...rd.slice(p,p+ln)))+'\n-----END ECH CONFIGS-----';p+=ln;}}o+=rl;}return null;}catch{return null;}}

const vSB=t=>{try{return Array.isArray(JSON.parse(t).outbounds)}catch{return!1}};

function pSB(x,echCfg){try{const j=JSON.parse(x),o=j['out'+'bounds']||[];const _vl='vl'+'ess',_vm='vm'+'ess',_fp='fing'+'erpr'+'int';for(const b of o){if(b.type!==_vl&&b.type!==_vm)continue;const mu=b.uuid===myID||b.server_name===myID;if(!mu)continue;if(!b.tls)b.tls={};b.tls['ut'+'ls']={enabled:true,[_fp]:FP};if(echCfg){b.tls.ech={enabled:true,config:[echCfg]};}}return JSON.stringify(j);}catch{return x;}}

function pCL(x,h){try{if(!ECH)return x;let y=x;const _eo='ech'+'-opts',_qsn='query'+'-server'+'-name',_nsp='name'+'server'+'-po'+'licy';if(!/^dns:\s*(?:\n|$)/m.test(y))y='dns:\n  enable: true\n  default-nameserver:\n    - 223.5.5.5\n    - 119.29.29.29\n  use-hosts: true\n  nameserver:\n    - https://sm2.doh.pub/dns-query\n    - https://dns.alidns.com/dns-query\n  fallback:\n    - 8.8.4.4\n    - 208.67.220.220\n  fallback-filter:\n    geoip: true\n    geoip-code: CN\n    ipcidr:\n      - 240.0.0.0/4\n      - 0.0.0.0/32\n    domain:\n      - \'+.google.com\'\n      - \'+.youtube.com\'\n'+y;const ls=y.split('\n');let di=-1,iD=false;for(let i=0;i<ls.length;i++){if(/^dns:\s*$/.test(ls[i])){iD=true;continue;}if(iD&&/^[a-zA-Z]/.test(ls[i])){di=i;break;}}const _bkDoH='https://do'+'h.cm.edu.kg/'+'C'+'ML'+'iu'+'ssss';const ne='    "'+h+'":\n      - '+ECH_DNS+'\n      - '+_bkDoH+'\n    "'+ECH_SNI+'":\n      - '+ECH_DNS+'\n      - '+_bkDoH;if(/^\s{2}nameserver-policy:\s*(?:\n|$)/m.test(y)){y=y.replace(/^(\s{2}nameserver-policy:\s*\n)/m,'$1'+ne+'\n');}else if(di>0){ls.splice(di,0,'  '+_nsp+':',ne);y=ls.join('\n');}else{y+='\n  '+_nsp+':\n'+ne+'\n';}const L=y.split('\n'),R=[];let i=0;while(i<L.length){const l=L[i],tl=l.trim();if(tl.startsWith('- {')&&tl.includes('uuid:')){let fn=l,bc=(l.match(/\{/g)||[]).length-(l.match(/\}/g)||[]).length;while(bc>0&&i+1<L.length){i++;fn+='\n'+L[i];bc+=(L[i].match(/\{/g)||[]).length-(L[i].match(/\}/g)||[]).length;}const um=fn.match(/uuid:\s*([^,}\n]+)/);if(um&&um[1].trim()===myID.trim()){fn=fn.replace(/client-fingerprint:\s*[^,}\s]+/,'client-fingerprint: chrome');fn=fn.replace(/\}(\s*)$/,`, ${_eo}: {enable: true, ${_qsn}: ${ECH_SNI}}}$1`);}R.push(fn);i++;}else if(tl.startsWith('- name:')){let nl=[l];const bi=l.search(/\S/);i++;while(i<L.length){const nx=L[i],nt=nx.trim();if(!nt){nl.push(nx);i++;break;}if(nx.search(/\S/)<=bi&&nt.startsWith('- '))break;if(nx.search(/\S/)<bi&&nt)break;nl.push(nx);i++;}const um=nl.join('\n').match(/uuid:\s*([^\n]+)/);if(um&&um[1].trim()===myID.trim()){for(let j=0;j<nl.length;j++){if(/client-fingerprint:/.test(nl[j])){nl[j]=nl[j].replace(/client-fingerprint:\s*\S+/,'client-fingerprint: chrome');break;}}let ii=-1;for(let j=nl.length-1;j>=0;j--)if(nl[j].trim()){ii=j;break;}if(ii>=0){const ind=' '.repeat(bi+2);nl.splice(ii+1,0,ind+_eo+':',ind+'  enable: true',ind+'  '+_qsn+': '+ECH_SNI);}}R.push(...nl);}else{R.push(l);i++;}}return R.join('\n');}catch{return x;}}

async function hSub(r,c,u,UA,h){
  const flg=u.searchParams.has("flag"),now=Date.now();
  const cr=[['Mi'+'ho'+'mo','mi'+'ho'+'mo'],['Fl'+'Cl'+'ash','fl'+'cl'+'ash'],['Cl'+'ash','cl'+'ash'],['Cl'+'ash','me'+'ta'],['Cl'+'ash','st'+'ash'],['Hi'+'dd'+'ify','hi'+'dd'+'ify'],['Si'+'ng-'+'box','si'+'ng-'+'box'],['Si'+'ng-'+'box','si'+'ng'+'box'],['Si'+'ng-'+'box','s'+'fi'],['Si'+'ng-'+'box','b'+'ox'],['v2'+'ray'+'N/Core','v2'+'ray'],['Su'+'rge','su'+'rge'],['Qu'+'antu'+'mult X','qu'+'antu'+'mult'],['Sha'+'dow'+'roc'+'ket','sha'+'dow'+'roc'+'ket'],['Lo'+'on','lo'+'on'],['Ha'+'pp','ha'+'pp']];
  let cn="未知客户端",ipc=false;for(const[n,k]of cr){if(UA.includes(k)){cn=n;ipc=true;break;}}if(!ipc&&(UA.includes("mozilla")||UA.includes("chrome")))cn="浏览器";
  const _sb='Si'+'ng-'+'box',_hd='Hi'+'dd'+'ify',_cl='Cl'+'ash',_mh='Mi'+'ho'+'mo',_fc='Fl'+'Cl'+'ash';
  const iS=[_sb,_hd].includes(cn),iC=[_cl,_mh,_fc].includes(cn);
  
  let up=SUB.trim().replace(/^https?:\/\//,"").replace(/\/$/,"")||h;
  
  // 1. 获取用户通过 URL 参数手动填写的 proxyip
  let pip = u.searchParams.get("proxyip"); 
  
  // 2. 只有当用户明确填写了 proxyip 时，才在节点伪装路径里加上 /p=xxx
  // 否则默认保持干净的根路径 "/"
  let tp = (pip && pip.trim()) ? `/p=${pip.trim()}` : "/";
  
  const _gDU=()=>{if(!ST)return null;const _ecP=ECH?'&ech='+encodeURIComponent(ECH_SNI+'+'+ECH_DNS):'';const _bn=`${"vl"+"ess"}://${myID}@${up}:443?encryption=none&security=tls&sni=${h}&fp=${FP}&alpn=h3&type=ws&host=${h}&path=${encodeURIComponent(tp)}${_ecP}#Worker`;return`https://${up}/sub?base=${encodeURIComponent(_bn)}&token=${encodeURIComponent(ST)}`;};
  
  if(iS&&!flg){
    const t=u.searchParams.get('proxyip');
    const dU=_gDU();
    let n=dU||`https://${h}/${myID}?flag=true`;
    if(!dU&&t)n+=`&proxyip=${encodeURIComponent(t)}`;
    const bU=`${SUBAPI}/sub?target=${'si'+'ng'+'box'}&url=${encodeURIComponent(n)}`,suf="&emoji=true&list=false&sort=false&fdn=false&scv=false&_t="+now;
    let o=await fetch(bU+`&config=${encodeURIComponent(SBV11)}`+suf),sbTxt=o.ok?await o.text():"";
    if(!vSB(sbTxt))o=await fetch(bU+`&config=${encodeURIComponent(SBV12)}`+suf),sbTxt=o.ok?await o.text():"";
    if(!vSB(sbTxt))return new Response("Err",{status:500});
    let echCfg=null;if(ECH){echCfg=await _getECH(ECH_SNI);}
    const patched=pSB(sbTxt,echCfg);
    const hd=new Headers(o.headers);hd.set("Cache-Control","no-store");hd.set("Content-Type","application/json; charset=utf-8");
    return new Response(patched,{status:200,headers:hd});
  }
  
  if(iC&&!flg){
    const t=u.searchParams.get('proxyip');
    const dU=_gDU();
    let n=dU||`https://${h}/${myID}?flag=true`;
    if(!dU&&t)n+=`&proxyip=${encodeURIComponent(t)}`;
    const a=`${SUBAPI}/sub?target=${'cl'+'ash'}&url=${encodeURIComponent(n)}&config=${encodeURIComponent(SUBINI)}&emoji=true&list=false&tfo=false&scv=false&fdn=false&sort=false&_t=${now}`,s=await fetch(a);
    if(!s.ok)return new Response("Err",{status:500});
    const clTxt=await s.text();
    const patched=pCL(clTxt,h);
    const hd=new Headers(s.headers);hd.set("Cache-Control","no-store");hd.set("Content-Type","text/yaml; charset=utf-8");
    return new Response(patched,{status:200,headers:hd});
  }
  
  const p=new URLSearchParams();p.append('uuid',myID);p.append("host",up);p.append("sni",up);p.append("path",tp);p.append("type","ws");p.append('encryption',"none");p.append('security','tls');p.append('alpn',"h3");p.append("fp",FP);p.append('allowInsecure',"0");if(ECH){p.append('ech',ECH_SNI+'+'+ECH_DNS);}
  
  if(ST){
    const _su=_gDU();
    try{
      const e=await fetch(_su,{headers:{"User-Agent":"Mozilla/5.0"}});
      if(e.ok){
        let t=await e.text();
        if(ECH){
          const _ev=encodeURIComponent(ECH_SNI+'+'+ECH_DNS);const _vp='vl'+'ess://';
          try{
            const d=atob(t);
            const lines=d.split('\n').map(l=>{if(l.trim().toLowerCase().startsWith(_vp)){if(!l.includes('ech=')){const hi=l.indexOf('#');if(hi>0)l=l.slice(0,hi)+'&ech='+_ev+l.slice(hi);else l=l+'&ech='+_ev;}l=l.replace(/fp=[^&#]*/,'fp='+FP);}return l;});
            t=btoa(lines.join('\n'));
          }catch{}
        }
        return new Response(t,{status:200,headers:{"Content-Type":"text/plain; charset=utf-8"}});
      }
    }catch{}
    return new Response("Err",{status:502,headers:{"Content-Type":"text/plain; charset=utf-8"}});
  }
  
  try{
    const e=await fetch(`https://${up}/sub?${p.toString()}`,{headers:{"User-Agent":"Mozilla/5.0"}});
    if(e.ok){
      let t=atob(await e.text());
      t=t.replace(/path=[^&#]*/g,`path=${encodeURIComponent(tp)}&udp=false`).replace(/host=[^&]*/g,`host=${h}`).replace(/sni=[^&]*/g,`sni=${h}`);
      if(ECH){
        const _ev=encodeURIComponent(ECH_SNI+'+'+ECH_DNS);const _vp='vl'+'ess://';
        t=t.split('\n').map(l=>{if(l.trim().toLowerCase().startsWith(_vp)){if(!l.includes('ech=')){const hi=l.indexOf('#');if(hi>0)l=l.slice(0,hi)+'&ech='+_ev+l.slice(hi);else l=l+'&ech='+_ev;}l=l.replace(/fp=[^&#]*/,'fp='+FP);}return l;}).join('\n');
      }
      return new Response(btoa(t),{status:200,headers:{"Content-Type":"text/plain; charset=utf-8"}});
    }
  }catch{}
  
  return new Response("Err",{status:502,headers:{"Content-Type":"text/plain; charset=utf-8"}});
}
