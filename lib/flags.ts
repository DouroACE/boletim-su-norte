// Flags regionais partilhadas pela página principal e pela página de flags de IA.
import { computeFlag, rangeFlag, seasonOf, addDays, type Flag } from "./stats";
import type { NorteSeries, Point, UlsRow } from "./sources";
import type { Indicator } from "./ai";
import { fmtDate } from "@/components/ui";

/** Início do histórico pedido às fontes (5 épocas + margem). Igual nas duas páginas para partilhar o cache. */
export const historySince = (today: string) => addDays(`${seasonOf(today).start - 5}-10-01`, -10);

function stale(flag: Flag, today: string, maxDays = 21): Flag {
  if (!flag.lastDate) return flag;
  const age = (Date.parse(today) - Date.parse(flag.lastDate)) / 864e5;
  if (age <= maxDays) return flag;
  return { ...flag, level: "sem-dados", note: `Último dado publicado a ${fmtDate(flag.lastDate)} (índice sazonal ou publicação suspensa). ${flag.note}` };
}

export type Range = { from: string; to: string };

const MIN_DATE = "2015-01-01"; // início das séries diárias do SNS Transparência
const isDay = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/** Lê ?de=AAAA-MM-DD&ate=AAAA-MM-DD do URL. Valores inválidos são ignorados; o intervalo é limitado a [2015, hoje]. */
export function parseRange(sp: Record<string, string | string[] | undefined>, today: string): Range | null {
  const de = isDay(sp.de) ? sp.de : null;
  const ate = isDay(sp.ate) ? sp.ate : null;
  if (!de && !ate) return null;
  let to = ate && ate < today ? ate : today;
  let from = de ?? addDays(to, -29);
  if (from > to) [from, to] = [to, from];
  if (from < MIN_DATE) from = MIN_DATE;
  return { from, to };
}

export const rangeQuery = (r: Range | null) => (r ? `?de=${r.from}&ate=${r.to}` : "");

/** Sem intervalo: estado atual (últimos 7 dias). Com intervalo: pior nível atingido dentro dele. */
export function regionalFlags(N: NorteSeries | null, friesa65: Point[], obitos: Point[], today: string, range: Range | null = null): Flag[] {
  const f = (id: string, label: string, unit: string, pts: Point[]) => (range ? rangeFlag(id, label, unit, pts, range.from, range.to) : computeFlag(id, label, unit, pts));
  const ref = range?.to ?? today;
  return [
    stale(f("episodios", "Episódios de urgência por dia", "episódios", N?.episodios ?? []), ref),
    stale(f("resp", "Urgências com infeção respiratória", "%", N?.pctRespiratoria ?? []), ref),
    stale(f("internamento", "Urgências com internamento", "%", N?.pctInternamento ?? []), ref),
    stale(f("triagem", "Espera triagem → 1.ª observação", "min", N?.tempoTriagem ?? []), ref),
    stale(f("friesa", "Índice de frio FRIESA (Porto, 65+)", "", friesa65), ref),
    stale(f("obitos", "Óbitos certificados por dia (Portugal)", "óbitos", obitos), ref, 30),
  ];
}

const MES = (m: string) => fmtDate(`${m}-15`, { month: "short", year: "numeric" });
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(0)}%`;

/** Indicadores (regionais + por ULS) que a IA pode citar nas flags. */
export function toIndicators(flags: Flag[], uls: UlsRow[]): Indicator[] {
  const out: Indicator[] = flags.filter((f) => f.level !== "sem-dados").map((f) => ({ id: f.id, label: f.label, level: f.level, detail: f.note }));
  for (const u of uls) {
    for (const [k, m, nome] of [["obitos", u.obitos, "Óbitos certificados (SICO)"], ["urgencias", u.urgencias, "Atendimentos em urgência"]] as const) {
      if (m.valor == null || !m.mes) continue;
      const comp = m.homologo != null && m.varPct != null ? `; mesmo mês do ano anterior: ${m.homologo} (${signed(m.varPct)}${m.z != null ? `, z = ${m.z.toFixed(1)}` : ""})` : "; sem mês homólogo";
      out.push({ id: `${k}:${u.key}`, label: `${nome} · ULS ${u.nome}`, level: m.level, detail: `${MES(m.mes)}: ${m.valor}${comp}.` });
    }
  }
  return out;
}
