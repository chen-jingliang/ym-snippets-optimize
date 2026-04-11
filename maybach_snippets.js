import { connect } from 'cloudflare:sockets';

const te = new TextEncoder();
const td = new TextDecoder();

const myID = '78f2c50b-9062-4f73-823d-f2c15d3e332c';

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
        
        if (!isWS && !req.body) {
            return new Response("OK", { status: 200 });
        }

        const u = new URL(req.url);
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
        let pParam = pParamInput || dynamicProxy;
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
                    } else if (mode === 'p' && pParam) {
                        const [ph, pp] = pParam.split(':');
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
                const YIELD_LIMIT = 1024 * 1024; // Strict 1MB threshold for Snippets CPU limits

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
                                if (bSz >= 65536) flush(); // 64KB boundary alignment
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
