// Visualizações do painel de risco: SVG renderizado no servidor (sem JavaScript no cliente).
// Cada estado tem sempre texto e ícone, nunca só cor.
import { DGS_TEXT, dgsLevel, type DgsIndicator, type DgsLevel } from "@/lib/risk";
import { LevelIcon, LEVEL_TEXT, fmt } from "@/components/ui";
import type { Level } from "@/lib/stats";

const polar = (deg: number, r: number) => [110 + r * Math.cos((deg * Math.PI) / 180), 110 - r * Math.sin((deg * Math.PI) / 180)];
const arc = (from: number, to: number, r = 88) => {
  const [x1, y1] = polar(from, r);
  const [x2, y2] = polar(to, r);
  return `M${x1.toFixed(1)} ${y1.toFixed(1)} A${r} ${r} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
};

/** Medidor de 4 setores (Verde → Vermelho) para o nível de risco DGS. */
export function RiskGauge({ level, label }: { level: DgsLevel | null; label: string }) {
  const needle = level == null ? null : polar(180 - (level + 0.5) * 45, 62);
  return (
    <svg viewBox="0 0 220 128" className="gauge" role="img" aria-label={`${label}: ${level == null ? "sem dados" : `nível ${level}, ${DGS_TEXT[level]}`}`}>
      {[0, 1, 2, 3].map((k) => (
        <path key={k} d={arc(180 - k * 45 - 1, 180 - (k + 1) * 45 + 1)} className={`gauge-seg dgs-${k}`} opacity={level == null || level === k ? 1 : 0.35} />
      ))}
      {needle && <line x1="110" y1="110" x2={needle[0]} y2={needle[1]} className="gauge-needle" />}
      <circle cx="110" cy="110" r="6" className="gauge-hub" />
      {[0, 1, 2, 3].map((k) => {
        const [x, y] = polar(180 - (k + 0.5) * 45, 112);
        return <text key={k} x={x} y={y + 4} textAnchor="middle" className="gauge-tick">{k}</text>;
      })}
    </svg>
  );
}

/** Donut com ≤ 4 categorias (nível estatístico das ULS), com legenda em texto. */
export function LevelDonut({ counts }: { counts: { level: Level; label?: string; n: number }[] }) {
  const total = counts.reduce((s, c) => s + c.n, 0) || 1;
  const C = 2 * Math.PI * 44;
  let offset = 0;
  const signal = counts.filter((c) => c.level === "atencao" || c.level === "alerta").reduce((s, c) => s + c.n, 0);
  return (
    <div className="donut">
      <svg viewBox="0 0 120 120" role="img" aria-label={counts.map((c) => `${c.label ?? LEVEL_TEXT[c.level]}: ${c.n}`).join(", ")}>
        <circle cx="60" cy="60" r="44" className="donut-track" />
        {counts.filter((c) => c.n > 0).map((c) => {
          const len = (c.n / total) * C;
          const el = <circle key={c.level + (c.label ?? "")} cx="60" cy="60" r="44" className={`donut-seg lv-${c.level}`} strokeDasharray={`${Math.max(len - 2, 0)} ${C}`} strokeDashoffset={-offset} transform="rotate(-90 60 60)" />;
          offset += len;
          return el;
        })}
        <text x="60" y="60" textAnchor="middle" className="donut-n">{signal}</text>
        <text x="60" y="76" textAnchor="middle" className="donut-sub">com sinal</text>
      </svg>
      <ul>
        {counts.map((c) => (
          <li key={c.level + (c.label ?? "")} className={`chip lv-${c.level}`}>
            <LevelIcon level={c.level} />
            {c.label ?? LEVEL_TEXT[c.level]} · {c.n}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Barra com as zonas dos níveis 1–3 e um marcador no valor atual (ou tracejado quando faltam dados). */
export function BulletRow({ ind }: { ind: DgsIndicator }) {
  const t = ind.thresholds;
  if (!t || ind.value == null) {
    return (
      <li className="bullet">
        <span className="bullet-label">{ind.label}</span>
        <span className="bullet-track bullet-empty" aria-hidden="true" />
        <span className="bullet-value muted">{ind.pedir ? `Pedir à ${ind.pedir}` : "Sem dados"}</span>
      </li>
    );
  }
  const lo = t[0] >= 80 ? 50 : -25;
  const hi = (Number.isFinite(t[2]) ? t[2] : t[1]) * 1.25;
  const x = (v: number) => Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100));
  const edges = [lo, ...t.map((v) => (Number.isFinite(v) ? v : hi)), hi];
  const lvl = dgsLevel(ind.value, t);
  return (
    <li className="bullet">
      <span className="bullet-label">{ind.label}</span>
      <span className="bullet-track" role="img" aria-label={`${ind.label}: ${fmt(ind.value, 1)} ${ind.unit}; limiares ${t.filter(Number.isFinite).join(", ")}; nível ${lvl}`}>
        {[0, 1, 2, 3].map((k) => (
          <span key={k} className={`bullet-zone dgs-${k}`} style={{ left: `${x(edges[k])}%`, width: `${x(edges[k + 1]) - x(edges[k])}%` }} />
        ))}
        <span className="bullet-mark" style={{ left: `${x(ind.value)}%` }} />
      </span>
      <span className="bullet-value">
        {ind.value >= 0 ? "+" : "−"}{fmt(Math.abs(ind.value), 1)} {ind.unit} <span className={`dgs-badge dgs-${lvl}`}>N{lvl}</span>
      </span>
    </li>
  );
}
