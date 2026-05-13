// Version: v2.0.3-Stable-Fixed | Time: 2026-05-12 23:45:00 (北京时间)
// 
// ==================== 架构简要说明 ====================
// 1. 核心网关: 自动识别流量类型。订阅请求归 1.1.6，WS 转发归 graintcp。
// 2. 极速引擎 (graintcp): 修复了路由逻辑，恢复"直连优先，代理兜底"策略，防止CF墙杀。
// 3. 智能缓冲: 引入 mkQ/mkDn 高低水位队列，优化拼包，减少 CPU 占用。
// 4. 生态兼容: 1.1.6 代码完整保留在内部，支持所有原有路由和伪装逻辑。
// 5. 格式优化: 彻底解决了长行代码导致编辑器报错的问题。
// ======================================================

import { connect } from 'cloudflare:sockets';

// ==========================================
// 全局基础配置 (统一在这里修改)
// ==========================================
const myID = ''; 
let SUB = 'owo.o00o.ooo'; 

let PIP = 'ProxyIP.CMLiussss.net';  
let SUBAPI = 'https://subapi.cmliussss.net';  
let SUBINI = 'https://raw.githubusercontent.com/cmliu/ACL4SSR/main/Clash/config/ACL4SSR_Online_Full_MultiMode.ini'; 
const SBV12 = 'https://raw.githubusercontent.com/sinspired/sub-store-template/main/1.12.x/sing-box.json'; 
const SBV11 = 'https://raw.githubusercontent.com/sinspired/sub-store-template/main/1.11.x/sing-box.json'; 
const ST = "";  
const ECH = true;  
const ECH_DNS = 'https://dns.alidns.com/dns-query';  
const ECH_SNI = 'cloudflare-ech.com';  
const FP = ECH ? 'chrome' : 'randomized';

// ==========================================
// 第一部分：graintcp 极速转发引擎 (数据面)
// ==========================================
const CFG = { 
  chunk: 64 * 1024, 
  dnPack: 32 * 1024, 
  dnTail: 512, 
  dnMs: 0, 
  upPack: 16 * 1024, 
  upQMax: 256 * 1024, 
  maxED: 8 * 1024, 
  concur: 2 
};

const hex = c => (c > 64 ? c + 9 : c) & 0xF;
const idB = new Uint8Array(16);
const dec = new TextDecoder(); 

let pIdx = 0;
for (let i = 0; i < 16; i++) { 
  let c = myID.charCodeAt(pIdx++); 
  if (c === 45) c = myID.charCodeAt(pIdx++); 
  let h = hex(c); 
  c = myID.charCodeAt(pIdx++); 
  if (c === 45) c = myID.charCodeAt(pIdx++); 
  idB[i] = h << 4 | hex(c); 
}

const [I0, I1, I2, I3, I4, I5, I6, I7, I8, I9, I10, I11, I12, I13, I14, I15] = idB;

const matchID = c => 
  c[1] === I0 && c[2] === I1 && c[3] === I2 && c[4] === I3 && 
  c[5] === I4 && c[6] === I5 && c[7] === I6 && c[8] === I7 && 
  c[9] === I8 && c[10] === I9 && c[11] === I10 && c[12] === I11 && 
  c[13] === I12 && c[14] === I13 && c[15] === I14 && c[16] === I15;

const addr = (t, b) => {
  if (t === 1) return `${b[0]}.${b[1]}.${b[2]}.${b[3]}`;
  if (t === 3) return dec.decode(b);
  return `[${Array.from({ length: 8 }, (_, i) => 
    ((b[i * 2] << 8) | b[i * 2 + 1]).toString(16)).join(':')}]`;
};

// 修复后的并发连接机制：直连优先，ProxyIP 作为失败回退兜底
const raceSprout = async (f, targetHost, targetPort, proxyIPPool) => { 
    if (!f?.connect) throw new Error('connect unavailable'); 

    // 策略 1: 优先尝试直连目标（多并发竞速）
    let ts = [];
    for (let i = 0; i < CFG.concur; i++) {
        const s = f.connect({ hostname: targetHost, port: targetPort });
        ts.push(s.opened.then(() => s));
    }

    try {
        const w = await Promise.any(ts);
        ts.forEach(t => t.then(s => s !== w && s.close(), () => {}));
        return w;
    } catch (err) {
        // 策略 2: 直连失败时（如CF墙杀），回退到 ProxyIP 代理池
        if (proxyIPPool && proxyIPPool.length > 0) {
            const fallbackTs = proxyIPPool.map(proxyStr => {
                const [ph, pp] = proxyStr.split(':');
                const s = f.connect({ hostname: ph, port: +(pp || targetPort || 443) });
                return s.opened.then(() => s);
            });
            try {
                const fw = await Promise.any(fallbackTs);
                fallbackTs.forEach(t => t.then(s => s !== fw && s.close(), () => {}));
                return fw;
            } catch (fallbackErr) {
                throw fallbackErr;
            }
        }
        throw err;
    }
};

const parseAddr = (b, o, t) => { 
  const l = t === 3 ? b[o++] : t === 1 ? 4 : t === 4 ? 16 : null; 
  if (l === null) return null; 
  const n = o + l; 
  return n > b.length ? null : { targetAddrBytes: b.subarray(o, n), dataOffset: n }; 
};

// 优化了 VLESS 解析，提取出 cmd 指令类型
const vless = c => { 
  if (c.length < 24 || !matchID(c)) return null; 
  let optLen = c[17];
  let cmd = c[18 + optLen]; // 获取指令类型 (1: TCP, 2: UDP)
  let o = 19 + optLen; 
  const p = (c[o] << 8) | c[o + 1]; 
  let t = c[o + 2]; 
  if (t !== 1) t += 1; 
  const a = parseAddr(c, o + 3, t); 
  return a ? { cmd, addrType: t, ...a, port: p } : null; 
};

const mkQ = (cap, qCap = cap, itemsMax = Math.max(1, qCap >> 8)) => { 
  let q = [], h = 0, qB = 0, buf = null; 
  const trim = () => { if (h > 32 && h * 2 >= q.length) { q = q.slice(h); h = 0; } }; 
  const take = () => { 
    if (h >= q.length) return null; 
    const d = q[h]; 
    q[h++] = undefined; 
    qB -= d.byteLength; 
    trim(); 
    return d; 
  }; 
  return { 
    get bytes() { return qB; }, 
    get empty() { return h >= q.length; }, 
    clear() { q = []; h = 0; qB = 0; }, 
    sow(d) { 
      const n = d?.byteLength || 0; 
      if (!n) return 1; 
      if (qB + n > qCap || q.length - h >= itemsMax) return 0; 
      q.push(d); 
      qB += n; 
      return 1; 
    }, 
    bundle(d) { 
      d ||= take(); 
      if (!d || h >= q.length || d.byteLength >= cap) return [d, 0]; 
      let n = d.byteLength, e = h; 
      while (e < q.length) { 
        const x = q[e], nn = n + x.byteLength; 
        if (nn > cap) break; 
        n = nn; 
        e++; 
      } 
      if (e === h) return [d, 0]; 
      const out = buf ||= new Uint8Array(cap); 
      out.set(d); 
      for (let o = d.byteLength; h < e;) { 
        const x = q[h]; 
        q[h++] = undefined; 
        qB -= x.byteLength; 
        out.set(x, o); 
        o += x.byteLength; 
      } 
      trim(); 
      return [out.subarray(0, n), 1]; 
    } 
  }; 
};

const mkDn = w => { 
  const cap = CFG.dnPack, tail = CFG.dnTail, low = Math.max(4096, tail << 3); 
  let pb = new Uint8Array(cap), p = 0, tp = 0, mq = 0, gen = 0, qk = 0, qr = 0; 
  const reap = () => { 
    if (tp) { clearTimeout(tp); tp = 0; }
    mq = 0; 
    if (!p) return; 
    w.send(pb.subarray(0, p).slice()); 
    pb = new Uint8Array(cap); 
    p = 0; 
    qr = 0; 
  }; 
  const ripen = () => { 
    if (tp || mq) return; 
    mq = 1; qk = gen; 
    queueMicrotask(() => { 
      mq = 0; 
      if (!p || tp) return; 
      if (cap - p < tail) return reap(); 
      tp = setTimeout(() => { 
        tp = 0; 
        if (!p) return; 
        if (cap - p < tail) return reap(); 
        if (qr < 2 && (gen !== qk || p < low)) { qr++; qk = gen; return ripen(); } 
        reap(); 
      }, Math.max(CFG.dnMs, 1)); 
    }); 
  }; 
  return { 
    send(u) { 
      let o = 0, n = u?.byteLength || 0; 
      if (!n) return; 
      while (o < n) { 
        if (!p && n - o >= cap) { 
          const m = Math.min(cap, n - o); 
          w.send(o || m !== n ? u.subarray(o, o + m) : u); 
          o += m; 
          continue; 
        } 
        const m = Math.min(cap - p, n - o); 
        pb.set(u.subarray(o, o + m), p); 
        p += m; 
        o += m; 
        gen++; 
        if (p === cap || cap - p < tail) reap(); else ripen(); 
      } 
    }, 
    reap 
  }; 
};

const mill = async (rd, w) => { 
  const r = rd.getReader({ mode: 'byob' });
  const tx = mkDn(w); 
  let buf = new ArrayBuffer(CFG.chunk); 
  try { 
    for (;;) { 
      const { done, value: v } = await r.read(new Uint8Array(buf, 0, CFG.chunk)); 
      if (done) break; 
      if (!v?.byteLength) continue; 
      if (v.byteLength >= (CFG.chunk >> 1)) {
        tx.reap(); 
        w.send(v); 
        buf = new ArrayBuffer(CFG.chunk);
      } else {
        tx.send(v.slice()); 
        buf = v.buffer;
      }
    } 
    tx.reap(); 
  } catch {} finally { 
    try { tx.reap(); } catch {} 
    try { r.releaseLock(); } catch {} 
  } 
};

const graintcpWS = async (req, proxyIPPool) => {
    const [client, server] = Object.values(new WebSocketPair()); 
    server.accept(); 
    
    const edStr = req.headers.get('sec-websocket-protocol'); 
    let ed = null;
    if (edStr && edStr.length <= CFG.maxED * 4 / 3 + 4) {
        try {
            ed = new Uint8Array(Array.from(atob(edStr.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)));
        } catch (e) {}
    }
      
    let curW = null, sock = null, closed = false, busy = false;
    const uq = mkQ(CFG.upPack, CFG.upQMax, CFG.upQMax >> 8);
    const wither = () => { 
      if (closed) return; 
      closed = true; 
      uq.clear(); 
      try { curW?.releaseLock(); } catch {} 
      try { sock?.close(); } catch {} 
      try { server.close(); } catch {} 
    };
    
    const toU8 = d => d instanceof Uint8Array ? d : 
      ArrayBuffer.isView(d) ? new Uint8Array(d.buffer, d.byteOffset, d.byteLength) : 
      new Uint8Array(d);
      
    const sow = d => { const u = toU8(d); if (uq.sow(u)) return 1; wither(); return 0; };
    
    const thresh = async () => { 
      if (busy || closed) return; 
      busy = true; 
      try { 
        for (;;) {
          if (closed) break; 
          if (!sock) { 
            const [d] = uq.bundle(); 
            if (!d) break; 
            const r = vless(d); 
            if (!r) throw wither(); 
            
            // 安全阻断非 TCP 流量 (防止处理 UDP 导致线程崩溃)
            if (r.cmd === 2) {
                server.close(1000);
                return;
            }

            server.send(new Uint8Array([d[0], 0])); 
            const host = addr(r.addrType, r.targetAddrBytes);
            const port = r.port;
            const payload = d.subarray(r.dataOffset); 
            
            sock = await raceSprout({ connect }, host, port, proxyIPPool); 
            if (!sock) throw wither(); 
            
            curW = sock.writable.getWriter(); 
            const [first] = uq.bundle(payload); 
            if (first?.byteLength) await curW.write(first); 
            
            mill(sock.readable, server).finally(() => wither()); 
            continue; 
          }
          const [d] = uq.bundle(); 
          if (!d) break; 
          await curW.write(d);
        } 
      } catch { wither(); } finally { 
        busy = false; 
        if (!uq.empty && !closed) queueMicrotask(thresh); 
      } 
    };
    
    if (ed && sow(ed)) thresh();
    server.addEventListener('message', e => { if (!closed) { sow(e.data) && thresh(); } });
    server.addEventListener('close', () => wither()); 
    server.addEventListener('error', () => wither());
    
    return new Response(null, { 
        status: 101, 
        webSocket: client, 
        headers: edStr ? { 'Sec-WebSocket-Protocol': edStr } : {} 
    }); 
};

// ==========================================
// 第二部分：原 1.1.6 逻辑核心 (Control Plane)
// ==========================================

const te = new TextEncoder();
const td = new TextDecoder();
const EXPECTED_BYTES = new Uint8Array(16);
{ 
  const hex_str = myID.replace(/-/g, ''); 
  for (let i = 0; i < 16; i++) { 
    EXPECTED_BYTES[i] = parseInt(hex_str.substring(i * 2, i * 2 + 2), 16); 
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

const legacyApp = {
    async fetch(req, env) {
        const isWS = req.headers.get('Upgrade')?.toLowerCase() === 'websocket';
        const u = new URL(req.url);
        
        if (!isWS && !req.body) {
            const UA = (req.headers.get("User-Agent") || "").toLowerCase();
            const isSub = (u.pathname === `/${myID}` || u.pathname === `/sub`);
            if (isSub) {
                if (u.pathname === `/sub` && u.searchParams.get('uuid') !== myID) 
                  return new Response("Invalid", { status: 403 });
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

        let sParam = u.pathname.split('/s=')[1], gParam = u.pathname.split('/g=')[1];
        let pParamInput = u.pathname.split('/p=')[1];
        const colo = req.cf?.colo || 'LAX';
        const dynamicProxy = `${colo}.PrOxYip.CmLiuSsSs.nEt:443`;
        
        let mode = 'default', skJson, proxyIPPool = [];

        if (sParam && !gParam) { 
            mode = 's'; skJson = getSKJson(sParam); 
        } else if (gParam) { 
            mode = 'g'; skJson = getSKJson(gParam); 
        } else if (pParamInput) { 
            mode = 'p'; proxyIPPool.push(pParamInput); 
        } else { 
            if (PIP) proxyIPPool.push(PIP); 
            proxyIPPool.push(dynamicProxy); 
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
                let addrStr = '';
                
                if (type === 1) { 
                    addrStr = `${view.getUint8(pos)}.${view.getUint8(pos+1)}.${view.getUint8(pos+2)}.${view.getUint8(pos+3)}`; 
                    pos += 4; 
                } else if (type === 2) { 
                    const len = view.getUint8(pos++); 
                    addrStr = td.decode(u8.subarray(pos, pos + len)); 
                    pos += len; 
                } else if (type === 3) { 
                    const ipv6 = []; 
                    for (let i = 0; i < 8; i++, pos += 2) ipv6.push(view.getUint16(pos).toString(16)); 
                    addrStr = ipv6.join(':'); 
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
                        sock = await sConnect(addrStr, port, skJson); 
                    } else if (mode === 'd') { 
                        sock = connect({ hostname: addrStr, port }); 
                        await sock.opened; 
                    } else {
                        try { 
                            sock = connect({ hostname: addrStr, port }); 
                            await sock.opened; 
                        } catch (err) { 
                            sock = null; 
                        }
                        if (!sock && proxyIPPool.length > 0) {
                            for (const proxy of proxyIPPool) {
                                try { 
                                    const [ph, pp] = proxy.split(':'); 
                                    sock = connect({ hostname: ph, port: +(pp || 443) }); 
                                    await sock.opened; 
                                    break; 
                                } catch (e) { sock = null; }
                            }
                        }
                    }
                } catch (err) {}
                
                if (!sock) { 
                    try { if (isWS && ws.readyState === 1) ws.close(1011); } catch {} 
                    try { clientWrite.close(); } catch {} 
                    return; 
                }
                
                sock.closed.catch(() => {}); 
                remote = sock;
                
                try {
                    if (isWS && ws.readyState === 1) ws.send(header); 
                    else if (!isWS) clientWrite.write(header).catch(() => {});
                    const w = sock.writable.getWriter(); 
                    await w.write(payload); 
                    w.releaseLock();
                } catch (e) { 
                    try { sock.close(); } catch {} 
                    return; 
                }
                
                const reader = sock.readable.getReader(); 
                const batch = []; 
                let bSz = 0, bTmr = null, bytesSinceYield = 0;
                
                const flush = () => {
                    if (!bSz) return;
                    try {
                        let out = batch.length === 1 ? batch[0] : new Uint8Array(bSz);
                        if (batch.length > 1) { 
                            let off = 0; 
                            for (const c of batch) { out.set(c, off); off += c.length; } 
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
                            if (bytesSinceYield >= 1048576) { 
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
                    } catch (_) {} finally {
                        flush(); 
                        try { reader.releaseLock(); } catch { }
                        if (!isWS) { try { clientWrite.close(); } catch { } }
                        try { if (isWS && ws.readyState === 1) ws.close(1000); } catch { }
                    }
                })();
            }
        })).catch(() => { }).finally(() => { try { remote?.close(); } catch {} });
        
        return response;
    }
};

const SK_CACHE = new Map();
function getSKJson(path) { 
  const cached = SK_CACHE.get(path); 
  if (cached) return cached;
  const hasAuth = path.includes('@');
  const [cred, srv] = hasAuth ? path.split('@') : [null, path];
  const [user = null, pass = null] = hasAuth ? cred.split(':') : [null, null];
  const [h, p = 443] = srv.split(':');
  const res = { user, pass, host: h, port: +p }; 
  SK_CACHE.set(path, res); 
  return res; 
}

async function sConnect(tH, tP, sk) {
  const sock = connect({ hostname: sk.host, port: sk.port }); 
  await sock.opened;
  const w = sock.writable.getWriter(), r = sock.readable.getReader();
  await w.write(new Uint8Array([5, 2, 0, 2]));
  const auth = (await r.read()).value;
  if (auth[1] === 2 && sk.user) {
    const u = te.encode(sk.user), p = te.encode(sk.pass);
    await w.write(new Uint8Array([1, u.length, ...u, p.length, ...p])); 
    await r.read();
  }
  const dom = te.encode(tH);
  await w.write(new Uint8Array([5, 1, 0, 3, dom.length, ...dom, tP >> 8, tP & 0xff]));
  await r.read(); 
  w.releaseLock(); 
  r.releaseLock(); 
  return sock;
}

async function hSub(r, c, u, UA, h) {
    const now = Date.now(); 
    let up = SUB.trim() || h;
    let pip = u.searchParams.get("proxyip");
    let tp = (pip && pip.trim()) ? `/p=${pip.trim()}` : "/";
    
    const _gDU = () => {
        if (!ST) return null;
        try {
            const uu = new URL(`vless://${myID}@${up}:443`);
            uu.searchParams.set('encryption', 'none'); 
            uu.searchParams.set('security', 'tls');
            uu.searchParams.set('sni', h); 
            uu.searchParams.set('fp', FP); 
            uu.searchParams.set('alpn', 'h2,http/1.1');
            uu.searchParams.set('type', 'ws'); 
            uu.searchParams.set('host', h); 
            uu.searchParams.set('path', tp);
            if (ECH) uu.searchParams.set('ech', ECH_SNI + '+' + ECH_DNS); 
            uu.hash = 'Worker';
            return `https://${up}/sub?base=${encodeURIComponent(uu.toString())}&token=${encodeURIComponent(ST)}`;
        } catch { return null; }
    };
    
    if (UA.includes('box') || UA.includes('hiddify')) {
        const dU = _gDU();
        const bU = `${SUBAPI}/sub?target=singbox&url=${encodeURIComponent(dU || `https://${h}/${myID}?flag=true${pip ? `&proxyip=${encodeURIComponent(pip)}` : ''}`)}&config=${encodeURIComponent(SBV11)}&emoji=true&_t=${now}`;
        const o = await fetch(bU); 
        if (!o.ok) return new Response("Err", { status: 500 });
        return new Response(pSB(await o.text(), ECH ? await _getECH(ECH_SNI) : null, h, FP), { status: 200, headers: { "Content-Type": "application/json; charset=utf-8" } });
    }
    
    if (UA.includes('clash') || UA.includes('mihomo')) {
        const dU = _gDU();
        const a = `${SUBAPI}/sub?target=clash&url=${encodeURIComponent(dU || `https://${h}/${myID}?flag=true${pip ? `&proxyip=${encodeURIComponent(pip)}` : ''}`)}&config=${encodeURIComponent(SUBINI)}&emoji=true&_t=${now}`;
        const s = await fetch(a); 
        if (!s.ok) return new Response("Err", { status: 500 });
        return new Response(pCL(await s.text(), h, FP), { status: 200, headers: { "Content-Type": "text/yaml; charset=utf-8" } });
    }
    
    const p = new URLSearchParams(); 
    p.append('uuid', myID); 
    p.append("host", up); 
    p.append("sni", h); 
    p.append("path", tp); 
    p.append("type", "ws"); 
    p.append('encryption', "none"); 
    p.append('security', 'tls'); 
    p.append('alpn', "h2,http/1.1"); 
    p.append("fp", FP);
    if (ECH) p.append('ech', ECH_SNI + '+' + ECH_DNS);
    
    try {
        const e = await fetch(`https://${up}/sub?${p.toString()}`, { headers: { "User-Agent": "Mozilla/5.0" } });
        if (e.ok) { 
            let t = await e.text(); 
            try { t = atob(t); } catch { } 
            t = t.split('\n').map(l => fixVless(l, h, tp, FP, ECH, ECH_SNI, ECH_DNS)).join('\n'); 
            return new Response(btoa(t), { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } }); 
        }
    } catch { }
    
    return new Response("Err", { status: 502 });
}

// ==========================================
// 第三部分：核心网关分流器 (The Bridge)
// ==========================================

export default {
    async fetch(req, env) {
        const isWS = req.headers.get('Upgrade')?.toLowerCase() === 'websocket';
        const u = new URL(req.url);

        const sParam = u.pathname.split('/s=')[1];
        const gParam = u.pathname.split('/g=')[1];

        // 协同逻辑：WS 请求且非特殊代理路由，进入极速引擎
        if (isWS && !sParam && !gParam) {
            let pParamInput = u.pathname.split('/p=')[1];
            let proxyIPPool = [];
            const colo = req.cf?.colo || 'LAX';
            const dynamicProxy = `${colo}.PrOxYip.CmLiuSsSs.nEt:443`;

            if (pParamInput) { 
                proxyIPPool.push(decodeURIComponent(pParamInput)); 
            } else { 
                if (PIP) proxyIPPool.push(PIP); 
                proxyIPPool.push(dynamicProxy); 
            }

            return await graintcpWS(req, proxyIPPool);
        }

        // HTTP 及 特殊路由请求回退至 1.1.6 体系
        return await legacyApp.fetch(req, env);
    }
};

// ==========================================
// 1.1.6 附属辅助函数 (完整保留，已展开多行防报错)
// ==========================================

async function _getECH(h) {
    try {
        const ps = h.split('.');
        const bs = [];
        for (const l of ps) {
            const e = new TextEncoder().encode(l);
            bs.push(e.length, ...e);
        }
        bs.push(0);
        const dn = new Uint8Array(bs);
        const pk = new Uint8Array(12 + dn.length + 4);
        const dv = new DataView(pk.buffer);
        dv.setUint16(0, Math.random() * 65535 | 0);
        dv.setUint16(2, 256);
        dv.setUint16(4, 1);
        pk.set(dn, 12);
        dv.setUint16(12 + dn.length, 65);
        dv.setUint16(14 + dn.length, 1);
        
        const rp = await fetch(ECH_DNS, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/dns-message',
                Accept: 'application/dns-message'
            },
            body: pk
        });
        
        if (!rp.ok) return null;
        const bf = new Uint8Array(await rp.arrayBuffer());
        const rv = new DataView(bf.buffer);
        const qc = rv.getUint16(4), ac = rv.getUint16(6);
        
        const sn = p => {
            let c = p;
            while (c < bf.length) {
                const n = bf[c];
                if (!n) return c + 1;
                if ((n & 0xC0) === 0xC0) return c + 2;
                c += n + 1;
            }
            return c + 1;
        };
        
        let o = 12;
        for (let i = 0; i < qc; i++) o = sn(o) + 4;
        
        for (let i = 0; i < ac && o < bf.length; i++) {
            o = sn(o);
            const tp = rv.getUint16(o);
            o += 2;
            o += 6;
            const rl = rv.getUint16(o);
            o += 2;
            if (tp === 65) {
                const rd = bf.slice(o, o + rl);
                let p = 2;
                while (p < rd.length) {
                    const n = rd[p];
                    if (!n) { p++; break; }
                    p += n + 1;
                }
                while (p + 4 <= rd.length) {
                    const k = (rd[p] << 8) | rd[p + 1], ln = (rd[p + 2] << 8) | rd[p + 3];
                    p += 4;
                    if (k === 5) return '-----BEGIN ECH CONFIGS-----\n' + btoa(String.fromCharCode(...rd.slice(p, p + ln))) + '\n-----END ECH CONFIGS-----';
                    p += ln;
                }
            }
            o += rl;
        }
        return null;
    } catch {
        return null;
    }
}

const fixVless = (link, h, tp, FP, ECH, ECH_SNI, ECH_DNS) => {
    if (!link.trim().toLowerCase().startsWith('vless://')) return link;
    try {
        const u = new URL(link);
        u.searchParams.set('sni', h);
        u.searchParams.set('host', h);
        u.searchParams.set('path', tp);
        u.searchParams.set('fp', FP);
        u.searchParams.set('alpn', 'h2,http/1.1');
        u.searchParams.set('type', 'ws');
        if (ECH) {
            u.searchParams.set('ech', ECH_SNI + '+' + ECH_DNS);
        } else {
            u.searchParams.delete('ech');
        }
        return u.toString();
    } catch {
        return link;
    }
};

function pSB(x, echCfg, h, FP) {
    try {
        const j = JSON.parse(x);
        const o = j.outbounds || [];
        for (const b of o) {
            if (b.type !== 'vless' && b.type !== 'vmess') continue;
            if (b.uuid !== myID && b.server_name !== myID) continue;
            if (!b.tls) b.tls = {};
            b.tls.server_name = h;
            b.tls.utls = { enabled: true, fingerprint: FP };
            if (echCfg) {
                b.tls.ech = { enabled: true, config: [echCfg] };
            }
            if (b.transport && b.transport.type === 'ws') {
                if (!b.transport.headers) b.transport.headers = {};
                b.transport.headers.Host = h;
            }
        }
        return JSON.stringify(j);
    } catch {
        return x;
    }
}

function pCL(x, h, FP) {
    try {
        if (!ECH) return x;
        let y = x;
        if (!/^dns:\s*(?:\n|$)/m.test(y)) {
            y = 'dns:\n  enable: true\n  default-nameserver:\n    - 223.5.5.5\n    - 119.29.29.29\n  use-hosts: true\n  nameserver:\n    - https://sm2.doh.pub/dns-query\n    - https://dns.alidns.com/dns-query\n  fallback:\n    - 8.8.4.4\n    - 208.67.220.220\n  fallback-filter:\n    geoip: true\n    geoip-code: CN\n    ipcidr:\n      - 240.0.0.0/4\n      - 0.0.0.0/32\n    domain:\n      - \'+.google.com\'\n      - \'+.youtube.com\'\n' + y;
        }
        const L = y.split('\n');
        const R = [];
        let i = 0;
        
        while (i < L.length) {
            const l = L[i];
            const tl = l.trim();
            if (tl.startsWith('- {') && tl.includes('uuid:')) {
                let fn = l;
                if (fn.includes(myID)) {
                    fn = fn.replace(/client-fingerprint:\s*[^,}\s]+/, 'client-fingerprint: ' + FP);
                    fn = fn.replace(/\}(\s*)$/, `, ech-opts: {enable: true, query-server-name: ${ECH_SNI}}}$1`);
                }
                R.push(fn);
                i++;
            } else if (tl.startsWith('- name:')) {
                let nl = [l];
                i++;
                while (i < L.length && L[i].search(/\S/) > l.search(/\S/)) {
                    nl.push(L[i]);
                    i++;
                }
                if (nl.join('\n').includes(myID)) {
                    for (let j = 0; j < nl.length; j++) {
                        if (/client-fingerprint:/.test(nl[j])) {
                            nl[j] = nl[j].replace(/client-fingerprint:\s*\S+/, 'client-fingerprint: ' + FP);
                        }
                    }
                    let ii = -1;
                    for (let j = nl.length - 1; j >= 0; j--) {
                        if (nl[j].trim()) {
                            ii = j;
                            break;
                        }
                    }
                    if (ii >= 0) {
                        const ind = ' '.repeat(l.search(/\S/) + 2);
                        nl.splice(ii + 1, 0, ind + 'ech-opts:', ind + '  enable: true', ind + '  query-server-name: ' + ECH_SNI);
                    }
                }
                R.push(...nl);
            } else {
                R.push(l);
                i++;
            }
        }
        return R.join('\n');
    } catch {
        return x;
    }
}
