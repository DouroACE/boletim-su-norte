// Flags partilhadas pelo boletim e pela página de flags de IA.
import { computeFlag, rangeFlag, seasonOf, addDays, type Flag } from "./stats";
import type { NorteSeries, Point, UlsRow, UlssaMensal, Aviso } from "./sources";
import type { Indicator } from "./ai";
import { compareHomologous, type UlsMetric } from "./uls";
import { dgsLevel, dgsToLevel, LIMIAR_OCUPACAO, worstOf } from "./risk";
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
export function regionalFlags(N: NorteSeries | null, friesa65: Point[], obitos: Point[], today: string, range: Range | null = null, obitosNorte = false): Flag[] {
  const f = (id: string, label: string, unit: string, pts: Point[]) => (range ? rangeFlag(id, label, unit, pts, range.from, range.to) : computeFlag(id, label, unit, pts));
  const ref = range?.to ?? today;
  return [
    stale(f("episodios", "Episódios de urgência por dia", "episódios", N?.episodios ?? []), ref),
    stale(f("resp", "Urgências com infeção respiratória", "%", N?.pctRespiratoria ?? []), ref),
    stale(f("internamento", "Urgências com internamento", "%", N?.pctInternamento ?? []), ref),
    stale(f("triagem", "Espera triagem → 1.ª observação", "min", N?.tempoTriagem ?? []), ref),
    stale(f("friesa", "Índice de frio FRIESA (Porto, 65+)", "", friesa65), ref),
    stale(f("obitos", obitosNorte ? "Óbitos por dia · Região Norte (eVM)" : "Óbitos certificados por dia (Portugal)", "óbitos", obitos), ref, 30),
  ];
}

const MES = (m: string) => fmtDate(`${m}-15`, { month: "short", year: "numeric" });
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(0)}%`;
const num1 = (n: number) => n.toLocaleString("pt-PT", { maximumFractionDigits: 1 });

/** Indicadores que a IA pode citar nas flags: ULSSA (urgências, SICO, ocupação, CSP), os flags regionais recebidos,
 *  e os avisos IPMA do distrito do Porto (null = fora do presente, sem avisos). */
export function toIndicators(flags: Flag[], uls: UlsRow | undefined, mensal: UlssaMensal | null, avisosPorto: Aviso[] | null): Indicator[] {
  const out: Indicator[] = flags.filter((f) => f.level !== "sem-dados").map((f) => ({ id: f.id, label: f.label, level: f.level, detail: f.note }));
  if (uls) {
    for (const [k, m, nome] of [["obitos", uls.obitos, "Óbitos certificados (SICO)"], ["urgencias", uls.urgencias, "Atendimentos em urgência"]] as const) {
      const ind = ulssaMetric(k, m, nome);
      if (ind) out.push(ind);
    }
  }
  const oc = mensal?.ocupacao.filter((s) => Number.isFinite(s.valor)).at(-1);
  if (oc) {
    out.push({
      id: "ocupacao:santo-antonio",
      label: "Taxa de ocupação hospitalar · ULSSA",
      level: dgsToLevel(dgsLevel(oc.valor, LIMIAR_OCUPACAO)),
      detail: `${MES(oc.mes)}: ${num1(oc.valor)} %. Limiares DGS 85 %, 95 % e 105 %.`,
    });
  }
  if (mensal) {
    const csp = compareHomologous(mensal.cspPresenciais, "pct");
    if (csp.valor != null && csp.mes) {
      const comp = csp.homologo != null && csp.varPct != null ? `; mesmo mês do ano anterior: ${csp.homologo} (${signed(csp.varPct)})` : "; sem mês homólogo";
      out.push({ id: "csp:santo-antonio", label: "Consultas médicas CSP presenciais · ULSSA", level: csp.level, detail: `${MES(csp.mes)}: ${csp.valor}${comp}.` });
    }
  }
  if (avisosPorto) {
    const level = avisosPorto.length ? worstOf(avisosPorto.map((a) => (a.nivel === "yellow" ? "atencao" : "alerta"))) : "normal";
    const detail = avisosPorto.length ? avisosPorto.map((a) => `${a.tipo} (${a.nivel})`).join("; ") + "." : "Sem avisos amarelos, laranja ou vermelhos no distrito do Porto.";
    out.push({ id: "avisos:porto", label: "Avisos IPMA · distrito do Porto", level, detail });
  }
  return out;
}

/** Indicador mensal de uma ULS: último mês publicado vs. mesmo mês do ano anterior. */
function ulssaMetric(k: string, m: UlsMetric, nome: string): Indicator | null {
  if (m.valor == null || !m.mes) return null;
  const comp = m.homologo != null && m.varPct != null ? `; mesmo mês do ano anterior: ${m.homologo} (${signed(m.varPct)}${m.z != null ? `, z = ${m.z.toFixed(1)}` : ""})` : m.suspeito ? "; comparação suspensa: a SPMS repetiu um mês na publicação (a rever)" : "; sem mês homólogo";
  return { id: `${k}:santo-antonio`, label: `${nome} · ULSSA`, level: m.level, detail: `${MES(m.mes)}: ${m.valor}${comp}.` };
}
