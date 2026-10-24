import express from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Engine } from './sim/engine.js';

const PORT = Number(process.env.PORT ?? 8787);
const app = express();
app.use(cors());
app.use(express.json({ limit: '256kb' }));

let engine: Engine = await Engine.create();

const subscribers = new Set<express.Response>();

function broadcast() {
  let payload: string;
  try {
    payload = `data: ${JSON.stringify(engine.snapshot())}\n\n`;
  } catch (error) {
    console.error('[stream] snapshot failed', error);
    return;
  }
  for (const res of subscribers) {
    try {
      res.write(payload);
    } catch {
      subscribers.delete(res);
    }
  }
}

setInterval(broadcast, 2500);
engine.on('update', broadcast);

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    clock: engine.clock,
    marketDay: engine.marketDay,
    agents: engine.households.length,
    blocks: engine.ledger.totalBlocks,
    uptimeSec: Math.round(process.uptime()),
  });
});

app.get('/api/state', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(engine.snapshot());
});

app.get('/api/forecast/:id', (req, res) => {
  const forecast = engine.forecasts[req.params.id];
  const tomorrow = engine.tomorrowForecasts?.[req.params.id] ?? null;
  if (!forecast && !tomorrow) {
    res.status(404).json({ error: 'forecast not found' });
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  res.json({ forecast, tomorrow });
});

app.post('/api/actions/day-ahead', (_req, res) => {
  const result = engine.runDayAhead();
  broadcast();
  res.json({ ...result, state: engine.snapshot() });
});

app.post('/api/actions/advance', (req, res) => {
  const hours = Math.max(1, Math.min(24, Number(req.body?.hours ?? 1)));
  engine.advance(hours);
  broadcast();
  res.json({ ok: true, state: engine.snapshot() });
});

app.post('/api/actions/running', (req, res) => {
  engine.setRunning(Boolean(req.body?.running));
  broadcast();
  res.json({ ok: true, running: engine.running });
});

app.post('/api/actions/speed', (req, res) => {
  engine.setSpeed(Number(req.body?.speed ?? 1));
  broadcast();
  res.json({ ok: true, speed: engine.speed });
});

app.post('/api/actions/agent/:id', (req, res) => {
  const result = engine.updateAgent(req.params.id, {
    strategy: req.body?.strategy,
    autonomy: typeof req.body?.autonomy === 'boolean' ? req.body.autonomy : undefined,
    riskAppetite: typeof req.body?.riskAppetite === 'number' ? req.body.riskAppetite : undefined,
  });
  broadcast();
  res.status(result.ok ? 200 : 400).json(result);
});

app.post('/api/actions/order', (req, res) => {
  const { householdId, side, slot, qtyKwh, price } = req.body ?? {};
  if (!householdId || !side || !slot || !qtyKwh || !price) {
    res.status(400).json({ ok: false, message: 'householdId, side, slot, qtyKwh and price are required' });
    return;
  }
  const result = engine.placeOrder({ householdId, side, slot, qtyKwh: Number(qtyKwh), price: Number(price) });
  broadcast();
  res.status(result.ok ? 200 : 400).json(result);
});

app.post('/api/actions/rec/:serial/retire', (req, res) => {
  const result = engine.retireCertificate(req.params.serial);
  broadcast();
  res.status(result.ok ? 200 : 400).json(result);
});

app.post('/api/actions/verify', (_req, res) => {
  res.json(engine.verifyChain());
});

app.post('/api/actions/reset', async (_req, res) => {
  engine.removeAllListeners();
  engine = await Engine.reset();
  engine.on('update', broadcast);
  broadcast();
  res.json({ ok: true, state: engine.snapshot() });
});

app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  res.write(`retry: 3000\n\n`);
  subscribers.add(res);
  res.write(`data: ${JSON.stringify(engine.snapshot())}\n\n`);
  req.on('close', () => {
    subscribers.delete(res);
  });
});

const dist = join(process.cwd(), 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(join(dist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`\n  MicroTrade Pro · simulation node listening on http://localhost:${PORT}`);
  console.log(`  clock ${engine.clock} · ${engine.households.length} agents · ${engine.ledger.totalBlocks} blocks\n`);
});
