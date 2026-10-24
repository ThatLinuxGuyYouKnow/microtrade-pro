import { useEffect, useState, type ReactNode } from 'react';
import { Check, Copy, X } from 'lucide-react';
import { cx } from '../lib/format';

export function Panel({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return <div className={cx('panel', padded && 'p-5', className)}>{children}</div>;
}

export function SectionHeader({
  eyebrow,
  title,
  right,
  className,
}: {
  eyebrow?: string;
  title?: string;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('flex items-start justify-between gap-4', className)}>
      <div>
        {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
        {title && <h2 className="text-[15px] font-medium tracking-[-0.01em] text-white/90">{title}</h2>}
      </div>
      {right}
    </div>
  );
}

type Tone = 'mint' | 'amber' | 'blue' | 'red' | 'neutral' | 'violet';

const toneText: Record<Tone, string> = {
  mint: 'text-mint-400',
  amber: 'text-solar',
  blue: 'text-flow',
  red: 'text-danger',
  neutral: 'text-white/70',
  violet: 'text-[#B79CF0]',
};

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return <span className={cx('chip', toneText[tone], className)}>{children}</span>;
}

export function Dot({ tone = 'mint', pulse = false }: { tone?: Tone; pulse?: boolean }) {
  const bg: Record<Tone, string> = {
    mint: 'bg-mint-400',
    amber: 'bg-solar',
    blue: 'bg-flow',
    red: 'bg-danger',
    neutral: 'bg-white/40',
    violet: 'bg-[#B79CF0]',
  };
  return <span className={cx('inline-block h-1.5 w-1.5 rounded-full', bg[tone], pulse && 'live-dot')} />;
}

export function Stat({
  label,
  value,
  unit,
  sub,
  tone = 'neutral',
  icon,
  className,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('flex flex-col justify-between', className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="eyebrow">{label}</span>
        {icon && <span className={toneText[tone]}>{icon}</span>}
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className={cx('num text-[26px] leading-none tracking-[-0.03em]', toneText[tone])}>{value}</span>
        {unit && <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-white/35">{unit}</span>}
      </div>
      {sub && <div className="mt-2 text-[11.5px] leading-relaxed text-white/40">{sub}</div>}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'group inline-flex items-center gap-2.5 disabled:opacity-40',
        label ? 'text-[12px] text-white/60' : '',
      )}
    >
      <span
        className={cx(
          'relative h-[18px] w-[32px] rounded-full border transition-colors duration-200',
          checked ? 'border-mint-500/50 bg-mint-500/25' : 'border-white/10 bg-white/[0.06]',
        )}
      >
        <span
          className={cx(
            'absolute top-[2px] h-[12px] w-[12px] rounded-full transition-all duration-200',
            checked ? 'left-[16px] bg-mint-400 shadow-[0_0_8px_rgba(92,225,168,0.6)]' : 'left-[2px] bg-white/45',
          )}
        />
      </span>
      {label}
    </button>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cx('inline-flex rounded-lg border border-white/[0.07] bg-black/30 p-0.5', className)}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cx(
            'rounded-[6px] px-2.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em] transition-all duration-150',
            value === opt.value
              ? 'bg-white/[0.09] text-white'
              : 'text-white/35 hover:text-white/70',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function Meter({ value, tone = 'mint', className }: { value: number; tone?: Tone; className?: string }) {
  const bg: Record<Tone, string> = {
    mint: 'bg-mint-400',
    amber: 'bg-solar',
    blue: 'bg-flow',
    red: 'bg-danger',
    neutral: 'bg-white/40',
    violet: 'bg-[#B79CF0]',
  };
  return (
    <div className={cx('h-1 w-full overflow-hidden rounded-full bg-white/[0.06]', className)}>
      <div
        className={cx('h-full rounded-full transition-all duration-500', bg[tone])}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  width = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className={cx('panel relative z-10 w-full p-6 fade-up', width)}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-[16px] font-medium text-white/95">{title}</h3>
            {subtitle && <p className="mt-1 text-[12px] text-white/40">{subtitle}</p>}
          </div>
          <button className="btn-ghost -mr-2 -mt-1 rounded-md p-2" onClick={onClose} aria-label="Close">
            <X size={15} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        } catch {
          /* clipboard unavailable */
        }
      }}
      className="inline-flex items-center gap-1 font-mono text-[10.5px] text-white/35 transition-colors hover:text-mint-400"
      title={value}
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {label ?? (copied ? 'copied' : 'copy')}
    </button>
  );
}

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.08] py-10 text-center">
      <p className="text-[12.5px] text-white/50">{title}</p>
      {detail && <p className="mt-1 max-w-xs text-[11px] leading-relaxed text-white/30">{detail}</p>}
    </div>
  );
}

export function Spinner({ size = 13 }: { size?: number }) {
  return (
    <span
      className="inline-block animate-spin rounded-full border-2 border-white/20 border-t-mint-400"
      style={{ width: size, height: size }}
    />
  );
}
