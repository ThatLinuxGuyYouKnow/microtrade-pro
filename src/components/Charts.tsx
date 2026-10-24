import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { cx } from '../lib/format';

export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (next && next > 40) setWidth(next);
    });
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

export interface ChartSeries {
  key: string;
  label?: string;
  color: string;
  values: (number | null)[];
  width?: number;
  dashed?: boolean;
  fill?: boolean;
  dot?: boolean;
}

export interface ChartBand {
  upper: number[];
  lower: number[];
  color: string;
}

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const fraction = value / 10 ** exponent;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * 10 ** exponent;
}

interface TimeSeriesProps {
  labels: string[];
  series: ChartSeries[];
  bands?: ChartBand[];
  height?: number;
  formatY?: (value: number) => string;
  formatValue?: (value: number) => string;
  yMax?: number;
  yMin?: number;
  xTickEvery?: number;
  markerIndex?: number;
  onHoverIndex?: (index: number | null) => void;
  legend?: boolean;
  className?: string;
  zeroLine?: boolean;
}

export function TimeSeriesChart({
  labels,
  series,
  bands = [],
  height = 230,
  formatY = (v) => String(Math.round(v)),
  formatValue,
  yMax,
  yMin,
  xTickEvery = 4,
  markerIndex,
  onHoverIndex,
  legend = false,
  className,
  zeroLine = false,
}: TimeSeriesProps) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const uid = useId().replace(/:/g, '');
  const pad = { left: 40, right: 12, top: 12, bottom: 22 };
  const innerW = Math.max(40, width - pad.left - pad.right);
  const innerH = Math.max(40, height - pad.top - pad.bottom);

  const computed = useMemo(() => {
    const values = [
      ...series.flatMap((s) => s.values.filter((v): v is number => v != null)),
      ...bands.flatMap((b) => b.upper.filter((v) => v != null)),
      ...bands.flatMap((b) => b.lower.filter((v) => v != null)),
    ];
    let max = yMax ?? niceMax(Math.max(0.1, ...values) * 1.12);
    let min = yMin ?? 0;
    if (yMin == null && values.some((v) => v < 0)) min = -niceMax(Math.max(0.1, Math.abs(Math.min(...values))) * 1.1);
    if (max === min) max = min + 1;
    return { max, min };
  }, [series, bands, yMax, yMin]);

  const { max, min } = computed;
  const n = labels.length;
  const x = (i: number) => pad.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => pad.top + innerH - ((v - min) / (max - min)) * innerH;

  const pathFor = (values: (number | null)[]) => {
    let d = '';
    let started = false;
    values.forEach((v, i) => {
      if (v == null) {
        started = false;
        return;
      }
      const px = x(i);
      const py = y(v);
      d += started ? ` L ${px.toFixed(2)} ${py.toFixed(2)}` : `M ${px.toFixed(2)} ${py.toFixed(2)}`;
      started = true;
    });
    return d;
  };

  const areaFor = (values: (number | null)[]) => {
    const base = y(Math.max(min, 0));
    let d = '';
    let startIdx = -1;
    let lastIdx = -1;
    values.forEach((v, i) => {
      if (v == null) return;
      if (startIdx < 0) startIdx = i;
      lastIdx = i;
    });
    if (startIdx < 0) return '';
    values.forEach((v, i) => {
      if (v == null || i < startIdx || i > lastIdx) return;
      d += i === startIdx ? `M ${x(i)} ${base} L ${x(i)} ${y(v)}` : ` L ${x(i)} ${y(v)}`;
    });
    d += ` L ${x(lastIdx)} ${base} Z`;
    return d;
  };

  const bandPath = (b: ChartBand) => {
    const up = b.upper;
    const low = b.lower;
    let d = '';
    up.forEach((v, i) => {
      d += i === 0 ? `M ${x(i)} ${y(v)}` : ` L ${x(i)} ${y(v)}`;
    });
    for (let i = low.length - 1; i >= 0; i--) d += ` L ${x(i)} ${y(low[i])}`;
    return `${d} Z`;
  };

  const gridValues = [0, 0.25, 0.5, 0.75, 1].map((t) => min + (max - min) * t);
  const active = hover ?? markerIndex ?? null;
  const tickIndices = labels.map((_, i) => i).filter((i) => i % xTickEvery === 0);

  return (
    <div className={cx('w-full', className)} ref={ref}>
      {legend && (
        <div className="mb-3 flex flex-wrap items-center gap-4">
          {series.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5 text-[10.5px] text-white/45">
              <span className="h-[2px] w-3.5 rounded-full" style={{ background: s.color }} />
              {s.label ?? s.key}
            </span>
          ))}
        </div>
      )}
      <div className="relative" style={{ height }}>
        <svg
          width={width}
          height={height}
          onMouseMove={(event) => {
            const rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
            const rel = event.clientX - rect.left - pad.left;
            const idx = Math.round((rel / innerW) * (n - 1));
            const clamped = Math.max(0, Math.min(n - 1, idx));
            setHover(clamped);
            onHoverIndex?.(clamped);
          }}
          onMouseLeave={() => {
            setHover(null);
            onHoverIndex?.(null);
          }}
          className="overflow-visible"
        >
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`grad-${uid}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity="0.22" />
                <stop offset="100%" stopColor={s.color} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>

          {gridValues.map((v, i) => (
            <g key={i}>
              <line
                x1={pad.left}
                x2={pad.left + innerW}
                y1={y(v)}
                y2={y(v)}
                stroke="rgba(255,255,255,0.045)"
                strokeDasharray={i === 0 ? '0' : '3 5'}
              />
              <text
                x={pad.left - 8}
                y={y(v) + 3}
                textAnchor="end"
                className="font-mono"
                fontSize={9}
                fill="rgba(255,255,255,0.28)"
              >
                {formatY(v)}
              </text>
            </g>
          ))}

          {zeroLine && min < 0 && (
            <line x1={pad.left} x2={pad.left + innerW} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,0.14)" />
          )}

          {bands.map((b, i) => (
            <path key={i} d={bandPath(b)} fill={b.color} stroke="none" />
          ))}

          {series.map((s) => (
            <g key={s.key}>
              {s.fill && <path d={areaFor(s.values)} fill={`url(#grad-${uid}-${s.key})`} />}
              <path
                d={pathFor(s.values)}
                fill="none"
                stroke={s.color}
                strokeWidth={s.width ?? 1.6}
                strokeDasharray={s.dashed ? '4 4' : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {s.dot &&
                s.values.map((v, i) =>
                  v == null ? null : (
                    <circle key={i} cx={x(i)} cy={y(v)} r={1.8} fill="#0a0f0d" stroke={s.color} strokeWidth={1.4} />
                  ),
                )}
            </g>
          ))}

          {labels.map((_, i) =>
            tickIndices.includes(i) ? (
              <text
                key={i}
                x={x(i)}
                y={height - 4}
                textAnchor={i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'}
                className="font-mono"
                fontSize={9}
                fill="rgba(255,255,255,0.28)"
              >
                {labels[i]}
              </text>
            ) : null,
          )}

          {active != null && active >= 0 && active < n && (
            <g>
              <line
                x1={x(active)}
                x2={x(active)}
                y1={pad.top}
                y2={pad.top + innerH}
                stroke="rgba(255,255,255,0.22)"
                strokeDasharray="3 3"
              />
              {series.map((s) => {
                const v = s.values[active];
                return v == null ? null : (
                  <circle key={s.key} cx={x(active)} cy={y(v)} r={3} fill="#0a0f0d" stroke={s.color} strokeWidth={1.6} />
                );
              })}
            </g>
          )}
        </svg>

        {active != null && active >= 0 && active < n && (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-[132px] rounded-lg border border-white/10 bg-[#0b100e]/95 px-3 py-2 shadow-2xl backdrop-blur-md"
            style={{
              left: Math.min(Math.max(x(active) - 66, 4), Math.max(8, width - 150)),
            }}
          >
            <div className="mb-1.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-white/35">
              {labels[active]}
            </div>
            {series.map((s) => {
              const v = s.values[active];
              if (v == null) return null;
              return (
                <div key={s.key} className="flex items-center justify-between gap-4 py-0.5">
                  <span className="flex items-center gap-1.5 text-[10.5px] text-white/50">
                    <span className="h-1 w-1 rounded-full" style={{ background: s.color }} />
                    {s.label ?? s.key}
                  </span>
                  <span className="num text-[11px] text-white/85">
                    {formatValue ? formatValue(v) : v.toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function Sparkline({
  values,
  color = '#5CE1A8',
  height = 30,
  filled = true,
}: {
  values: number[];
  color?: string;
  height?: number;
  filled?: boolean;
}) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const uid = useId().replace(/:/g, '');
  const safe = values.length ? values : [0, 0];
  const min = Math.min(...safe);
  const max = Math.max(...safe);
  const span = max - min || 1;
  const step = width / Math.max(1, safe.length - 1);
  const points = safe.map((v, i) => `${i * step},${height - ((v - min) / span) * (height - 4) - 2}`);
  const d = `M ${points.join(' L ')}`;
  const area = `${d} L ${width},${height} L 0,${height} Z`;

  return (
    <div ref={ref} style={{ height }} className="w-full">
      <svg width={width} height={height} preserveAspectRatio="none">
        <defs>
          <linearGradient id={`spark-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.24" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {filled && <path d={area} fill={`url(#spark-${uid})`} />}
        <path d={d} fill="none" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export function DepthBar({
  bids,
  asks,
  marker,
  className,
}: {
  bids: { price: number; qty: number }[];
  asks: { price: number; qty: number }[];
  marker?: number;
  className?: string;
}) {
  const maxQty = Math.max(1, ...bids.map((b) => b.qty), ...asks.map((a) => a.qty));
  return (
    <div className={cx('space-y-3', className)}>
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="eyebrow text-mint-400/70">Bids</span>
          <span className="font-mono text-[9.5px] text-white/25">buyers · $/kWh</span>
        </div>
        {bids.slice(0, 6).map((b, i) => (
          <div key={i} className="flex items-center gap-2 py-[2px]">
            <span className="w-12 text-right font-mono text-[10px] text-white/45">{b.price.toFixed(3)}</span>
            <div className="h-[6px] flex-1 overflow-hidden rounded-sm bg-white/[0.04]">
              <div
                className="h-full rounded-sm bg-mint-500/60"
                style={{ width: `${Math.max(2, (b.qty / maxQty) * 100)}%` }}
              />
            </div>
            <span className="w-11 font-mono text-[9.5px] text-white/30">{b.qty.toFixed(1)}</span>
          </div>
        ))}
      </div>
      {marker ? (
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-white/10" />
          <span className="font-mono text-[10px] text-solar">clear ${marker.toFixed(3)}</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>
      ) : null}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="eyebrow text-solar/70">Asks</span>
          <span className="font-mono text-[9.5px] text-white/25">sellers · $/kWh</span>
        </div>
        {asks.slice(0, 6).map((a, i) => (
          <div key={i} className="flex items-center gap-2 py-[2px]">
            <span className="w-12 text-right font-mono text-[10px] text-white/45">{a.price.toFixed(3)}</span>
            <div className="h-[6px] flex-1 overflow-hidden rounded-sm bg-white/[0.04]">
              <div
                className="h-full rounded-sm bg-solar/50"
                style={{ width: `${Math.max(2, (a.qty / maxQty) * 100)}%` }}
              />
            </div>
            <span className="w-11 font-mono text-[9.5px] text-white/30">{a.qty.toFixed(1)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
