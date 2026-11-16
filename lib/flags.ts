// Flags regionais partilhadas pela página principal e pela página de flags de IA.
import { computeFlag, seasonOf, addDays, type Flag } from "./stats";
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

export function regionalFlags(N: NorteSeries | null, friesa65: Point[], obitos: Point[], today: string): Flag[] {
  return [
    stale(computeFlag("episodios", "Episódios de urgência por dia", "episódios", N?.episodios ?? []), today),
    stale(computeFlag("resp", "Urgências com infeção respiratória", "%", N?.pctRespiratoria ?? []), today),
    stale(computeFlag("internamento", "Urgências com internamento", "%", N?.pctInternamento ?? []), today),
    stale(computeFlag("triagem", "Espera triagem → 1.ª observação", "min", N?.tempoTriagem ?? []), today),
    stale(computeFlag("friesa", "Índice de frio FRIESA (Porto, 65+)", "", friesa65), today),
    stale(computeFlag("obitos", "Óbitos certificados por dia (Portugal)", "óbitos", obitos), today, 30),
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
