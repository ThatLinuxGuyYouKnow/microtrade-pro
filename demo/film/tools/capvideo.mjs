// CDP motion capture: screencast + optional slow orbit drag. node >= 22, no deps.
// usage: capvideo.mjs <url> <out.mp4> <seconds> [dragPx]
const [url, out, secs = '12', dragPx = '0'] = process.argv.slice(2);
if (!url || !out) {
  console.error('usage: capvideo.mjs <url> <out.mp4> <seconds> [dragPx]');
  process.exit(1);
}
const { writeFileSync, mkdirSync } = await import('node:fs');
const { execFileSync } = await import('node:child_process');
const framesDir = out + '.frames';
mkdirSync(framesDir, { recursive: true });

const tabs = await (
  await fetch('http://127.0.0.1:9222/json/new?' + encodeURIComponent(url), { method: 'PUT' })
).json();
const ws = new WebSocket(tabs.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const i = ++id;
    pending.set(i, { resolve, reject });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const frames = [];
let n = 0;
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  } else if (msg.method === 'Page.screencastFrame') {
    const p = msg.params;
    writeFileSync(`${framesDir}/f${String(n++).padStart(5, '0')}.jpg`, Buffer.from(p.data, 'base64'));
    ws.send(JSON.stringify({ id: ++id, method: 'Page.screencastFrameAck', params: { sessionId: p.sessionId } }));
  }
};
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = rej;
});
// warm-up: wait for the WebGL canvas, then for shader compile under SwiftShader
for (let i = 0; i < 40; i++) {
  const r = await send('Runtime.evaluate', { expression: `!!document.querySelector('canvas')`, returnByValue: true });
  if (r?.result?.value) break;
  await new Promise((r2) => setTimeout(r2, 2000));
}
await new Promise((r) => setTimeout(r, 14000));
await send('Page.startScreencast', { format: 'jpeg', quality: 78, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });

// slow orbit drag across the canvas centre while recording
const drag = Number(dragPx);
if (drag !== 0) {
  const cx = 700, cy = 300, steps = 40;
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', clickCount: 1 });
  const t0 = Date.now();
  const totalMs = Number(secs) * 1000;
  for (let s = 1; s <= steps; s++) {
    const x = cx + (drag * s) / steps;
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y: cy, button: 'left' });
    const target = t0 + (totalMs * s) / steps;
    await new Promise((r) => setTimeout(r, Math.max(0, target - Date.now())));
  }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx + drag, y: cy, button: 'left', clickCount: 1 });
} else {
  await new Promise((r) => setTimeout(r, Number(secs) * 1000));
}
await send('Page.stopScreencast');
await new Promise((r) => setTimeout(r, 800));
ws.close();
console.log('frames:', n);
execFileSync('ffmpeg', ['-y', '-v', 'error', '-framerate', '30', '-i', `${framesDir}/f%05d.jpg`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', out]);
console.log('wrote', out);
process.exit(0);
