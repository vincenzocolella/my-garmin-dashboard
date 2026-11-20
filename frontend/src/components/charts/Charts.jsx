import { useId, useLayoutEffect, useRef, useState } from 'react';
import { fmt, fmtDay, isNum, linreg, sum } from '../../lib/util';

export const C = {
  cyan: '#00F0FF', emerald: '#10B981', amber: '#F59E0B', crimson: '#EF4444', violet: '#A78BFA',
  blue: '#3B82F6', slate: '#64748B', grid: '#1F2937', text: '#6B7280',
};

function useMeasure() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

function niceTicks(lo, hi, count = 4) {
  const span = hi - lo || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + step * 1e-9; t += step) out.push(Math.round(t * 1e6) / 1e6);
  return out;
}

function segments(points) {
  const segs = [];
  let cur = [];
  for (const p of points) {
    if (p) cur.push(p);
    else if (cur.length) {
      segs.push(cur);
      cur = [];
    }
  }
  if (cur.length) segs.push(cur);
  return segs;
}
const pathOf = (seg) => seg.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');

function Tooltip({ x, width, children }) {
  const left = x > width / 2;
  return (
    <div
      className="pointer-events-none absolute top-1 z-10 min-w-36 rounded-md border border-edge bg-void/95 px-3 py-2 text-xs shadow-xl"
      style={left ? { right: width - x + 10 } : { left: x + 10 }}
    >
      {children}
    </div>
  );
}

function Empty({ height, text }) {
  return <div className="flex items-center justify-center text-sm text-gray-600" style={{ height }}>{text}</div>;
}

/**
 * Category/time chart: line, area, grouped bar, stacked bar series on a left and optional right axis,
 * with ±band overlays, horizontal y-zones, vertical x-windows, reference lines and a hover tooltip.
 */
export function TimeChart({
  rows, xKey = 'date', xFormat = fmtDay, series, left = {}, right, bands = [], refLines = [], zones = [], windows = [],
  height = 220, barColor, tooltipExtra, emptyText = 'Nessun dato nel periodo',
}) {
  const [ref, width] = useMeasure();
  const [hover, setHover] = useState(null);
  const gid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const n = rows.length;
  const hasData = n > 0 && series.some((s) => rows.some((r) => isNum(r[s.key])));
  const M = { t: 10, r: right ? 46 : 14, b: 22, l: 42 };
  const iw = Math.max(10, width - M.l - M.r);
  const ih = height - M.t - M.b;
  const step = iw / Math.max(1, n);
  const xAt = (i) => M.l + step * (i + 0.5);

  const domain = (axis, cfg = {}) => {
    const ss = series.filter((s) => (s.axis ?? 'left') === axis);
    let vals = [];
    const stacks = ss.filter((s) => s.type === 'stack');
    if (stacks.length) rows.forEach((r) => vals.push(sum(stacks.map((s) => r[s.key]))));
    ss.filter((s) => s.type !== 'stack').forEach((s) => rows.forEach((r) => vals.push(r[s.key])));
    bands.filter((b) => (b.axis ?? 'left') === axis).forEach((b) => rows.forEach((r) => vals.push(r[b.lo], r[b.hi])));
    refLines.filter((l) => (l.axis ?? 'left') === axis).forEach((l) => vals.push(l.y));
    vals = vals.filter(isNum);
    let lo = cfg.min ?? (vals.length ? Math.min(...vals) : 0);
    let hi = cfg.max ?? (vals.length ? Math.max(...vals) : 1);
    if (cfg.min == null && ss.some((s) => ['bar', 'stack', 'area'].includes(s.type))) lo = Math.min(lo, 0);
    if (hi === lo) hi = lo + 1;
    const pad = (hi - lo) * 0.08;
    if (cfg.min == null && lo !== 0) lo -= pad;
    if (cfg.max == null) hi += pad;
    const ticks = niceTicks(lo, hi, 4);
    if (cfg.min == null) lo = Math.min(lo, ticks[0]);
    if (cfg.max == null) hi = Math.max(hi, ticks.at(-1));
    const y = (v) => M.t + ih - ((v - lo) / (hi - lo)) * ih;
    const format = cfg.format ?? ((v) => fmt(v, hi - lo < 5 ? 1 : 0));
    return { lo, hi, y, format, ticks: ticks.filter((t) => t >= lo - 1e-9 && t <= hi + 1e-9) };
  };
  const axes = { left: domain('left', left) };
  if (right) axes.right = domain('right', right);

  const xLabelEvery = Math.max(1, Math.ceil(n / Math.max(1, iw / 64)));
  const barSeries = series.filter((s) => s.type === 'bar');
  const stackAxes = [...new Set(series.filter((s) => s.type === 'stack').map((s) => s.axis ?? 'left'))];
  const groups = barSeries.length + stackAxes.length;
  const bw = Math.max(1, Math.min(28, (step * 0.72) / Math.max(1, groups)));
  const groupOffset = (g) => (g - (groups - 1) / 2) * bw;

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - rect.left - M.l) / step);
    setHover(i >= 0 && i < n ? i : null);
  };

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {!width ? null : !hasData ? (
        <Empty height={height} text={emptyText} />
      ) : (
        <svg width={width} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img">
          <defs>
            {series.filter((s) => s.type === 'area').map((s) => (
              <linearGradient key={s.key} id={`${gid}-${s.key}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity="0.35" />
                <stop offset="100%" stopColor={s.color} stopOpacity="0" />
              </linearGradient>
            ))}
            <clipPath id={`${gid}-clip`}><rect x={M.l} y={M.t} width={iw} height={ih} /></clipPath>
          </defs>

          {/* y zones */}
          <g clipPath={`url(#${gid}-clip)`}>
            {zones.map((z, i) => {
              const ax = axes[z.axis ?? 'left'];
              const y1 = ax.y(Math.min(ax.hi, z.to ?? ax.hi));
              const y2 = ax.y(Math.max(ax.lo, z.from ?? ax.lo));
              return y2 > y1 ? (
                <g key={i}>
                  <rect x={M.l} y={y1} width={iw} height={y2 - y1} fill={z.color} fillOpacity={0.08} />
                  {z.label && y2 - y1 > 12 && <text x={M.l + iw - 4} y={y1 + 11} textAnchor="end" fontSize="9" fill={z.color} opacity={0.8}>{z.label}</text>}
                </g>
              ) : null;
            })}
            {windows.map((w, i) => (
              <g key={`w${i}`}>
                <rect x={xAt(w.from) - step / 2} y={M.t} width={(w.to - w.from + 1) * step} height={ih} fill={w.color} opacity={0.12} />
                <rect x={xAt(w.from) - step / 2} y={M.t} width={(w.to - w.from + 1) * step} height={2} fill={w.color} />
              </g>
            ))}
          </g>

          {/* grid + axes */}
          {axes.left.ticks.map((t) => (
            <g key={`l${t}`}>
              <line x1={M.l} x2={M.l + iw} y1={axes.left.y(t)} y2={axes.left.y(t)} stroke={C.grid} strokeDasharray="2 4" />
              <text x={M.l - 6} y={axes.left.y(t) + 3} textAnchor="end" fontSize="10" fill={C.text} className="num">{axes.left.format(t)}</text>
            </g>
          ))}
          {axes.right?.ticks.map((t) => (
            <text key={`r${t}`} x={M.l + iw + 6} y={axes.right.y(t) + 3} fontSize="10" fill={C.text} className="num">{axes.right.format(t)}</text>
          ))}
          {left.label && <text x={4} y={M.t + 2} fontSize="9" fill={C.text} dominantBaseline="hanging">{left.label}</text>}
          {right?.label && <text x={width - 4} y={M.t + 2} fontSize="9" fill={C.text} textAnchor="end" dominantBaseline="hanging">{right.label}</text>}
          {rows.map((r, i) =>
            i % xLabelEvery === 0 ? (
              <text key={`x${i}`} x={xAt(i)} y={height - 6} textAnchor="middle" fontSize="10" fill={C.text} className="num">{xFormat(r[xKey], r)}</text>
            ) : null,
          )}

          <g clipPath={`url(#${gid}-clip)`}>
            {/* bands */}
            {bands.map((b, bi) => {
              const ax = axes[b.axis ?? 'left'];
              const pts = rows.map((r, i) => (isNum(r[b.lo]) && isNum(r[b.hi]) ? [xAt(i), ax.y(r[b.hi]), ax.y(r[b.lo])] : null));
              return segments(pts).map((seg, si) => (
                <path key={`b${bi}-${si}`} className="chart-fade" fill={b.color} fillOpacity={b.opacity ?? 0.12}
                  d={`${seg.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join('')}${[...seg].reverse().map((p) => `L${p[0]},${p[2]}`).join('')}Z`} />
              ));
            })}

            {/* bars */}
            {barSeries.map((s, g) => {
              const ax = axes[s.axis ?? 'left'];
              const zero = ax.y(Math.max(ax.lo, Math.min(ax.hi, 0)));
              return rows.map((r, i) => {
                const v = r[s.key];
                if (!isNum(v)) return null;
                const y = ax.y(v);
                return <rect key={`${s.key}${i}`} className="chart-grow" x={xAt(i) + groupOffset(g) - bw / 2} width={bw} y={Math.min(y, zero)} height={Math.max(1, Math.abs(zero - y))}
                  rx={1.5} fill={barColor?.(r, s) ?? s.color} opacity={hover === i ? 1 : s.opacity ?? 0.85} />;
              });
            })}
            {stackAxes.map((axisKey, k) => {
              const ax = axes[axisKey];
              const ss = series.filter((s) => s.type === 'stack' && (s.axis ?? 'left') === axisKey);
              return rows.map((r, i) => {
                let acc = 0;
                return ss.map((s) => {
                  const v = r[s.key];
                  if (!isNum(v) || v <= 0) return null;
                  const y0 = ax.y(acc);
                  acc += v;
                  const y1 = ax.y(acc);
                  return <rect key={`${s.key}${i}`} className="chart-grow" x={xAt(i) + groupOffset(barSeries.length + k) - bw / 2} width={bw} y={y1} height={Math.max(0.5, y0 - y1)} fill={s.color} opacity={hover === i ? 1 : 0.85} />;
                });
              });
            })}

            {/* areas + lines */}
            {series.filter((s) => s.type === 'area' || s.type === 'line' || !s.type).map((s) => {
              const ax = axes[s.axis ?? 'left'];
              const pts = rows.map((r, i) => (isNum(r[s.key]) ? [xAt(i), ax.y(r[s.key])] : null));
              const segs = segments(pts);
              const base = ax.y(Math.max(ax.lo, 0));
              return (
                <g key={s.key}>
                  {s.type === 'area' && segs.map((seg, si) => (
                    <path key={`a${si}`} className="chart-fade" fill={`url(#${gid}-${s.key})`} d={`${pathOf(seg)}L${seg.at(-1)[0]},${base}L${seg[0][0]},${base}Z`} />
                  ))}
                  {segs.map((seg, si) => (
                    <path key={`l${si}-${n}`} className={seg.length > 1 && !s.dash ? 'chart-draw' : 'chart-fade'} pathLength={s.dash ? undefined : 1} d={pathOf(seg)} fill="none"
                      stroke={s.color} strokeWidth={s.width ?? 2} strokeDasharray={s.dash} strokeLinejoin="round" strokeLinecap="round" />
                  ))}
                  {(s.dots || segs.some((seg) => seg.length === 1)) && pts.map((p, i) => (p ? <circle key={i} cx={p[0]} cy={p[1]} r={s.dots ? 2.5 : 2} fill={s.color} /> : null))}
                </g>
              );
            })}
          </g>

          {refLines.map((l, i) => {
            const ax = axes[l.axis ?? 'left'];
            if (l.y < ax.lo || l.y > ax.hi) return null;
            return (
              <g key={`ref${i}`}>
                <line x1={M.l} x2={M.l + iw} y1={ax.y(l.y)} y2={ax.y(l.y)} stroke={l.color ?? C.slate} strokeDasharray={l.dash ?? '4 4'} strokeWidth={1} />
                {l.label && <text x={M.l + 4} y={ax.y(l.y) - 4} fontSize="9" fill={l.color ?? C.slate}>{l.label}</text>}
              </g>
            );
          })}

          {hover != null && (
            <g pointerEvents="none">
              <line x1={xAt(hover)} x2={xAt(hover)} y1={M.t} y2={M.t + ih} stroke="#9CA3AF" strokeOpacity={0.35} />
              {series.filter((s) => s.type !== 'bar' && s.type !== 'stack' && isNum(rows[hover][s.key])).map((s) => (
                <circle key={s.key} cx={xAt(hover)} cy={axes[s.axis ?? 'left'].y(rows[hover][s.key])} r={4} fill={C.cyan === s.color ? '#090D16' : s.color} stroke={s.color} strokeWidth={2} />
              ))}
            </g>
          )}
        </svg>
      )}
      {hover != null && width > 0 && hasData && (
        <Tooltip x={xAt(hover)} width={width}>
          <div className="mb-1 font-semibold text-gray-300 num">{xFormat(rows[hover][xKey], rows[hover])}</div>
          {series.map((s) => (
            <div key={s.key} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-gray-400"><span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />{s.label}</span>
              <span className="num text-gray-100">{isNum(rows[hover][s.key]) ? (s.format ?? axes[s.axis ?? 'left'].format)(rows[hover][s.key]) : '—'}</span>
            </div>
          ))}
          {tooltipExtra?.(rows[hover])}
        </Tooltip>
      )}
    </div>
  );
}

/** Scatter over a numeric x (e.g. timestamps) with optional least-squares trend over a subset. */
export function ScatterChart({ points, xFormat, yFormat = (v) => fmt(v, 2), height = 220, trendFilter, tooltip, yLabel }) {
  const [ref, width] = useMeasure();
  const [hover, setHover] = useState(null);
  const M = { t: 10, r: 14, b: 22, l: 46 };
  const iw = Math.max(10, width - M.l - M.r);
  const ih = height - M.t - M.b;
  if (!points.length) return <div ref={ref}><Empty height={height} text="Nessuna corsa con passo e FC nel periodo" /></div>;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs) === x0 ? x0 + 1 : Math.max(...xs);
  const pad = (Math.max(...ys) - Math.min(...ys)) * 0.15 || 0.05;
  const y0 = Math.min(...ys) - pad;
  const y1 = Math.max(...ys) + pad;
  const X = (v) => M.l + ((v - x0) / (x1 - x0)) * iw;
  const Y = (v) => M.t + ih - ((v - y0) / (y1 - y0)) * ih;
  const reg = trendFilter ? linreg(points.filter(trendFilter).map((p) => ({ x: p.x, y: p.y }))) : null;
  const ticks = niceTicks(y0, y1, 4).filter((t) => t >= y0 && t <= y1);
  const xt = Array.from({ length: 5 }, (_, i) => x0 + ((x1 - x0) * i) / 4);
  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.l} x2={M.l + iw} y1={Y(t)} y2={Y(t)} stroke={C.grid} strokeDasharray="2 4" />
              <text x={M.l - 6} y={Y(t) + 3} textAnchor="end" fontSize="10" fill={C.text} className="num">{yFormat(t)}</text>
            </g>
          ))}
          {yLabel && <text x={4} y={M.t + 2} fontSize="9" fill={C.text} dominantBaseline="hanging">{yLabel}</text>}
          {xt.map((t, i) => <text key={i} x={X(t)} y={height - 6} textAnchor={i === 0 ? 'start' : i === 4 ? 'end' : 'middle'} fontSize="10" fill={C.text} className="num">{xFormat(t)}</text>)}
          {reg && (
            <line className="chart-fade" x1={X(x0)} y1={Y(reg.intercept + reg.slope * x0)} x2={X(x1)} y2={Y(reg.intercept + reg.slope * x1)} stroke={C.cyan} strokeWidth={1.5} strokeDasharray="6 4" />
          )}
          {points.map((p, i) => (
            <circle key={i} className="chart-fade" cx={X(p.x)} cy={Y(p.y)} r={hover === i ? 7 : p.r ?? 5} fill={p.color} fillOpacity={0.75} stroke={p.color} strokeWidth={1.5}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: 'pointer', transition: 'r 150ms' }} />
          ))}
        </svg>
      )}
      {hover != null && <Tooltip x={X(points[hover].x)} width={width}>{tooltip(points[hover])}</Tooltip>}
    </div>
  );
}

/** Concentric progress rings with a central score. */
export function RingGauge({ rings, center, size = 220 }) {
  const stroke = 10;
  const gap = 4;
  const c = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" className="shrink-0">
      {rings.map((r, i) => {
        const radius = c - stroke / 2 - i * (stroke + gap);
        const len = 2 * Math.PI * radius;
        const v = isNum(r.value) ? Math.max(0, Math.min(100, r.value)) : 0;
        return (
          <g key={r.label} transform={`rotate(-90 ${c} ${c})`}>
            <circle cx={c} cy={c} r={radius} fill="none" stroke={r.color} strokeOpacity={0.12} strokeWidth={stroke} />
            <circle cx={c} cy={c} r={radius} fill="none" stroke={r.color} strokeWidth={stroke} strokeLinecap="round" className="ring-anim"
              strokeDasharray={len} strokeDashoffset={len * (1 - v / 100)} style={{ filter: `drop-shadow(0 0 4px ${r.color}66)` }}>
              <title>{`${r.label}: ${isNum(r.value) ? Math.round(r.value) : 'N/D'}`}</title>
            </circle>
          </g>
        );
      })}
      <text x={c} y={c - 4} textAnchor="middle" fontSize={size * 0.2} fontWeight="700" fill="#F9FAFB" className="num">{isNum(center.value) ? Math.round(center.value) : '—'}</text>
      <text x={c} y={c + size * 0.1} textAnchor="middle" fontSize="11" fill={C.text} letterSpacing="2">{center.label}</text>
      {center.sub && <text x={c} y={c + size * 0.17} textAnchor="middle" fontSize="11" fill={center.subColor ?? C.text} className="num">{center.sub}</text>}
    </svg>
  );
}

export function Radar({ axes, size = 260, color = C.cyan }) {
  const c = size / 2;
  const R = c - 50;
  const padX = 56; // room for axis labels left/right
  const pt = (i, v) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / axes.length;
    return [c + Math.cos(ang) * R * (v / 100), c + Math.sin(ang) * R * (v / 100)];
  };
  const poly = axes.map((a, i) => pt(i, isNum(a.value) ? a.value : 0).join(',')).join(' ');
  return (
    <svg width="100%" viewBox={`${-padX} 0 ${size + padX * 2} ${size}`} style={{ maxWidth: size + padX * 2 }} role="img">
      {[25, 50, 75, 100].map((lvl) => (
        <polygon key={lvl} points={axes.map((_, i) => pt(i, lvl).join(',')).join(' ')} fill="none" stroke={C.grid} strokeDasharray={lvl === 50 ? '0' : '2 3'} />
      ))}
      {axes.map((a, i) => {
        const [x, y] = pt(i, 100);
        const [lx, ly] = pt(i, 122);
        return (
          <g key={a.label}>
            <line x1={c} y1={c} x2={x} y2={y} stroke={C.grid} />
            <text x={lx} y={ly} textAnchor={Math.abs(lx - c) < 5 ? 'middle' : lx > c ? 'start' : 'end'} dominantBaseline="middle" fontSize="10" fill="#9CA3AF">
              {a.label} <tspan className="num" fill="#E5E7EB">{isNum(a.value) ? Math.round(a.value) : '—'}</tspan>
            </text>
          </g>
        );
      })}
      <polygon className="chart-fade" points={poly} fill={color} fillOpacity={0.18} stroke={color} strokeWidth={2} />
      {axes.map((a, i) => {
        const [x, y] = pt(i, isNum(a.value) ? a.value : 0);
        return <circle key={a.label} cx={x} cy={y} r={3} fill={color} />;
      })}
    </svg>
  );
}

/** Horizontal 100% stacked bar. */
export function SplitBar({ parts, height = 14 }) {
  const total = sum(parts.map((p) => p.value)) || 1;
  return (
    <div className="flex w-full overflow-hidden rounded-full bg-edge" style={{ height }}>
      {parts.map((p) => (
        <div key={p.label} title={`${p.label}: ${Math.round((p.value / total) * 100)}%`} style={{ width: `${(p.value / total) * 100}%`, background: p.color, transition: 'width 700ms ease-out' }} />
      ))}
    </div>
  );
}
