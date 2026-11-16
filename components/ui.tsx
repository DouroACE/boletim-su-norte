import type { Level } from "@/lib/stats";

export const LEVEL_TEXT: Record<Level | "info", string> = {
  normal: "Normal",
  atencao: "Atenção",
  alerta: "Alerta",
  "sem-dados": "Sem dados",
  info: "Informação",
};

export function LevelIcon({ level }: { level: Level | "info" }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (level === "alerta")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
        <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
        <path d="M12 9v4M12 17h.01" />
      </svg>
    );
  if (level === "atencao")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4M12 16h.01" />
      </svg>
    );
  if (level === "normal")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
        <circle cx="12" cy="12" r="10" />
        <path d="m8 12 3 3 5-6" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
      <circle cx="12" cy="12" r="10" />
      <path d="M8 12h8" />
    </svg>
  );
}

export function Chip({ level, label }: { level: Level | "info"; label?: string }) {
  return (
    <span className={`chip lv-${level}`}>
      <LevelIcon level={level} />
      {label ?? LEVEL_TEXT[level]}
    </span>
  );
}

/** Mini-gráfico em SVG, renderizado no servidor (sem JavaScript no cliente). */
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length < 2) return null;
  const w = 220, h = 40, p = 3;
  const min = Math.min(...v), max = Math.max(...v);
  const sx = (i: number) => p + (i / (v.length - 1)) * (w - 2 * p);
  const sy = (x: number) => h - p - ((x - min) / (max - min || 1)) * (h - 2 * p);
  const d = v.map((x, i) => `${i ? "L" : "M"}${sx(i).toFixed(1)},${sy(x).toFixed(1)}`).join("");
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <path d={`${d}L${sx(v.length - 1)},${h}L${sx(0)},${h}Z`} fill="var(--accent-soft)" />
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <circle cx={sx(v.length - 1)} cy={sy(v.at(-1)!)} r="3" fill="var(--accent)" />
    </svg>
  );
}

export const fmt = (n: number | null | undefined, d = 0) =>
  n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("pt-PT", { minimumFractionDigits: d, maximumFractionDigits: d });

export const fmtDate = (iso: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) =>
  new Date(iso.length === 10 ? iso + "T12:00:00Z" : iso).toLocaleDateString("pt-PT", { timeZone: "Europe/Lisbon", ...opts });
