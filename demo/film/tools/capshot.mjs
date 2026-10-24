// Minimal CDP screenshot client: node >= 22, no deps.
const [url, outfile, waitMs = '12000'] = process.argv.slice(2);
if (!url || !outfile) {
  console.error('usage: capshot.mjs <url> <outfile.png> [waitMs]');
  process.exit(1);
}
const tabs = await (await fetch('http://127.0.0.1:9222/json/new?' + encodeURIComponent(url), { method: 'PUT' })).json();
const wsUrl = tabs.webSocketDebuggerUrl;
const ws = new WebSocket(wsUrl);
let id = 0;
const pending = new Map();
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const i = ++id;
    pending.set(i, { resolve, reject });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
}
ws.onmessage = (ev) => {
  try {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  } catch {}
};
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = rej;
});
await new Promise((r) => setTimeout(r, Number(waitMs)));
const { data } = await send('Page.captureScreenshot', { format: 'png' });
const { writeFileSync } = await import('node:fs');
writeFileSync(outfile, Buffer.from(data, 'base64'));
console.log('wrote', outfile);
ws.close();
process.exit(0);
