// Motor de alertas ("flags") — estatística simples, explicável e reprodutível.
// A IA só redige o texto a partir destes resultados; nunca decide o nível de alerta.
import type { Point } from "./sources";

export type Level = "normal" | "atencao" | "alerta" | "sem-dados";

export type Flag = {
  id: string;
  label: string;
  unit: string;
  current: number | null; // média móvel 7 dias mais recente
  previous: number | null; // média dos 7 dias anteriores
  changePct: number | null;
  baselineMean: number | null; // linha de base histórica para a mesma altura do ano
  baselineSd: number | null;
  z: number | null;
  level: Level;
  lastDate: string | null;
  direction: "up-bad" | "down-bad";
  note: string;
};

export const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
export const sd = (a: number[]) => {
  if (a.length < 2) return NaN;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
};

const toTime = (iso: string) => Date.parse(iso + "T00:00:00Z");
export const addDays = (iso: string, n: number) => new Date(toTime(iso) + n * 864e5).toISOString().slice(0, 10);

/** Média móvel centrada à direita (últimos n dias, inclusive). */
export function rolling(points: Point[], n = 7): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    if (i < n - 1) continue;
    const w = points.slice(i - n + 1, i + 1).map((p) => p.value);
    out.push({ date: points[i].date, value: mean(w) });
  }
  return out;
}

/** Época de vigilância sazonal: 1 de outubro a 30 de setembro. */
export function seasonOf(iso: string) {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const start = m >= 10 ? y : y - 1;
  return { start, label: `${start}/${String(start + 1).slice(2)}`, startISO: `${start}-10-01` };
}

export const dayOfSeason = (iso: string) => Math.round((toTime(iso) - toTime(seasonOf(iso).startISO)) / 864e5);

/**
 * Linha de base: para cada dia da época, média e desvio-padrão da média móvel de 7 dias
 * nas N épocas anteriores, numa janela de ±7 dias (semelhante aos limiares do método
 * "moving epidemic"/ECDC, mas simplificado para dados diários).
 */
export function seasonalBaseline(points: Point[], currentSeasonStart: number, nSeasons = 5, window = 7) {
  const smooth = rolling(points, 7);
  const bySeason = new Map<number, Map<number, number>>();
  for (const p of smooth) {
    const s = seasonOf(p.date).start;
    if (s >= currentSeasonStart || s < currentSeasonStart - nSeasons) continue;
    if (!bySeason.has(s)) bySeason.set(s, new Map());
    bySeason.get(s)!.set(dayOfSeason(p.date), p.value);
  }
  const result: { dos: number; mean: number; sd: number; n: number }[] = [];
  for (let dos = 0; dos < 365; dos++) {
    const vals: number[] = [];
    for (const m of bySeason.values()) {
      for (let k = -window; k <= window; k++) {
        const v = m.get(dos + k);
        if (v != null) vals.push(v);
      }
    }
    result.push({ dos, mean: mean(vals), sd: sd(vals), n: vals.length });
  }
  return { days: result, seasons: [...bySeason.keys()].sort() };
}

export function levelFromZ(z: number | null, direction: Flag["direction"]): Level {
  if (z == null || !Number.isFinite(z)) return "sem-dados";
  const zz = direction === "up-bad" ? z : -z;
  if (zz >= 2) return "alerta";
  if (zz >= 1) return "atencao";
  return "normal";
}

export function computeFlag(
  id: string,
  label: string,
  unit: string,
  points: Point[],
  opts: { direction?: Flag["direction"]; nSeasons?: number } = {}
): Flag {
  const direction = opts.direction ?? "up-bad";
  const empty: Flag = {
    id, label, unit, current: null, previous: null, changePct: null, baselineMean: null, baselineSd: null,
    z: null, level: "sem-dados", lastDate: null, direction, note: "Sem dados recentes.",
  };
  if (points.length < 14) return empty;

  const last = points.at(-1)!;
  const last7 = points.slice(-7).map((p) => p.value);
  const prev7 = points.slice(-14, -7).map((p) => p.value);
  const current = mean(last7);
  const previous = mean(prev7);
  const changePct = previous ? ((current - previous) / previous) * 100 : null;

  const season = seasonOf(last.date);
  const base = seasonalBaseline(points, season.start, opts.nSeasons ?? 5);
  const b = base.days[dayOfSeason(last.date)];
  const ok = b && b.n >= 10 && Number.isFinite(b.sd) && b.sd > 0;
  const z = ok ? (current - b.mean) / b.sd : null;
  const level = levelFromZ(z, direction);

  const dir = changePct == null ? "" : changePct >= 0 ? `subiu ${changePct.toFixed(1)}%` : `desceu ${Math.abs(changePct).toFixed(1)}%`;
  const vsBase = ok
    ? `${current >= b.mean ? "acima" : "abaixo"} da média das épocas ${base.seasons[0]}–${base.seasons.at(-1)! + 1} para esta altura (${b.mean.toFixed(1)} ${unit}; z = ${z!.toFixed(2)})`
    : "sem histórico suficiente para comparar";

  return {
    id, label, unit, current, previous, changePct,
    baselineMean: ok ? b.mean : null,
    baselineSd: ok ? b.sd : null,
    z, level, lastDate: last.date, direction,
    note: `Média dos últimos 7 dias: ${current.toFixed(1)} ${unit}; ${dir} face à semana anterior; ${vsBase}.`,
  };
}

/** Flags simples para séries sem histórico de épocas: limiar fixo. */
export function thresholdFlag(id: string, label: string, unit: string, points: Point[], warn: number, alert: number, note: string): Flag {
  const last = points.at(-1);
  if (!last) {
    return { id, label, unit, current: null, previous: null, changePct: null, baselineMean: null, baselineSd: null, z: null, level: "sem-dados", lastDate: null, direction: "up-bad", note: "Sem dados." };
  }
  const recent = points.slice(-7).map((p) => p.value);
  const max7 = Math.max(...recent);
  const level: Level = max7 >= alert ? "alerta" : max7 >= warn ? "atencao" : "normal";
  return {
    id, label, unit, current: last.value, previous: null, changePct: null, baselineMean: null, baselineSd: null, z: null,
    level, lastDate: last.date, direction: "up-bad",
    note: `${note} Valor mais recente ${last.value.toFixed(2)} (${last.date}); máximo dos últimos 7 dias ${max7.toFixed(2)}.`,
  };
}

/** Correlação de Pearson (para padrões tipo temperatura ↔ infeções respiratórias). */
export function pearson(x: number[], y: number[]) {
  const n = Math.min(x.length, y.length);
  if (n < 5) return NaN;
  const mx = mean(x.slice(0, n));
  const my = mean(y.slice(0, n));
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - mx) * (y[i] - my);
    dx += (x[i] - mx) ** 2;
    dy += (y[i] - my) ** 2;
  }
  return num / Math.sqrt(dx * dy);
}

export const levelRank: Record<Level, number> = { "sem-dados": -1, normal: 0, atencao: 1, alerta: 2 };
export const worstLevel = (flags: Flag[]): Level =>
  flags.reduce<Level>((w, f) => (levelRank[f.level] > levelRank[w] ? f.level : w), "normal");

export type RangeFlag = Flag & { years: number };

/** Flag para um intervalo [from, to]: a média do intervalo é comparada com a média do mesmo período
 *  (mesmas datas) em cada um dos 5 anos anteriores. z = (atual − média dos anos) ÷ DP dos anos.
 *  Um único z por intervalo, para não multiplicar falsos alertas em intervalos longos. */
export function rangeFlag(id: string, label: string, unit: string, points: Point[], from: string, to: string, nYears = 5): RangeFlag {
  const avg = (a: string, b: string, minCover = 0) => {
    const v = points.filter((p) => p.date >= a && p.date <= b).map((p) => p.value);
    const span = Math.round((toTime(b) - toTime(a)) / 864e5) + 1;
    return v.length && v.length >= span * minCover ? mean(v) : null;
  };
  const inRange = points.filter((p) => p.date >= from && p.date <= to);
  if (!inRange.length) {
    return {
      id, label, unit, current: null, previous: null, changePct: null, baselineMean: null, baselineSd: null,
      z: null, level: "sem-dados", lastDate: null, direction: "up-bad", note: "Sem dados no intervalo escolhido.", years: 0,
    };
  }
  const span = Math.round((toTime(to) - toTime(from)) / 864e5) + 1;
  const current = mean(inRange.map((p) => p.value));
  const previous = avg(addDays(from, -span), addDays(from, -1));
  const changePct = previous ? ((current - previous) / previous) * 100 : null;

  const shift = (iso: string, k: number) => `${Number(iso.slice(0, 4)) - k}${iso.slice(4)}`.replace("-02-29", "-02-28");
  const past = Array.from({ length: nYears }, (_, i) => avg(shift(from, i + 1), shift(to, i + 1), 0.5)).filter((v): v is number => v != null);
  const ok = past.length >= 3 && sd(past) > 0;
  const z = ok ? (current - mean(past)) / sd(past) : null;

  const dir = changePct == null ? "sem período anterior para comparar" : `${changePct >= 0 ? "subiu" : "desceu"} ${Math.abs(changePct).toFixed(1)}% face aos ${span} dias anteriores`;
  const vsBase = ok
    ? `${current >= mean(past) ? "acima" : "abaixo"} da média do mesmo período nos ${past.length} anos anteriores (${mean(past).toFixed(1)} ${unit}; z = ${z!.toFixed(2)})`
    : "sem anos anteriores suficientes para comparar";
  return {
    id, label, unit, current, previous, changePct,
    baselineMean: ok ? mean(past) : null, baselineSd: ok ? sd(past) : null,
    z, level: levelFromZ(z, "up-bad"), lastDate: inRange.at(-1)!.date, direction: "up-bad", years: past.length,
    note: `Média de ${from} a ${to}: ${current.toFixed(1)} ${unit}; ${dir}; ${vsBase}.`,
  };
}
