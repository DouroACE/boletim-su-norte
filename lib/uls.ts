// Dados por Unidade Local de Saúde (ULS) da Região Norte, a partir do SNS Transparência.
// Não existe publicação diária por ULS: o SICO por instituição e os atendimentos em urgência
// são mensais. A página verifica-os todos os dias (cron) e mostra o último mês fechado.
import type { Level } from "./stats";

export type Uls = { key: string; nome: string; match: RegExp; lat: number; lon: number };

// Coordenadas: lista oficial de instituições do portal TEMPOS (SPMS).
export const ULS_NORTE: Uls[] = [
  { key: "alto-minho", nome: "Alto Minho", match: /Alto Minho/, lat: 41.6975, lon: -8.8325 },
  { key: "barcelos", nome: "Barcelos / Esposende", match: /Barcelos/, lat: 41.5334, lon: -8.6166 },
  { key: "braga", nome: "Braga", match: /Saúde de Braga/, lat: 41.5623, lon: -8.3994 },
  { key: "alto-ave", nome: "Alto Ave", match: /Alto Ave/, lat: 41.4886, lon: -8.3387 },
  { key: "medio-ave", nome: "Médio Ave", match: /Médio Ave/, lat: 41.3422, lon: -8.4802 },
  { key: "povoa", nome: "Póvoa de Varzim / Vila do Conde", match: /Póvoa/, lat: 41.3549, lon: -8.7444 },
  { key: "matosinhos", nome: "Matosinhos", match: /Matosinhos/, lat: 41.1819, lon: -8.6634 },
  { key: "sao-joao", nome: "São João", match: /São João/, lat: 41.1833, lon: -8.6019 },
  { key: "santo-antonio", nome: "Santo António", match: /Santo António/, lat: 41.1473, lon: -8.6195 },
  { key: "gaia", nome: "Gaia / Espinho", match: /Gaia/, lat: 41.1254, lon: -8.6028 },
  { key: "tamega", nome: "Tâmega e Sousa", match: /Tâmega/, lat: 41.0741, lon: -8.0913 },
  { key: "edv", nome: "Entre Douro e Vouga", match: /Entre Douro e Vouga/, lat: 40.8416, lon: -8.4716 },
  { key: "tmad", nome: "Trás-os-Montes e Alto Douro", match: /Trás-os-Montes/, lat: 41.084, lon: -7.7958 },
  { key: "nordeste", nome: "Nordeste", match: /Nordeste/, lat: 41.5347, lon: -6.9601 },
];

/** ULS a que pertence uma instituição. Só conta o nome antes de " - " (a ULS, não a unidade). */
export function ulsOf(instituicao: string): Uls | undefined {
  const head = instituicao.split(" - ")[0];
  if (!/^Unidade Local de Saúde/.test(head)) return undefined;
  return ULS_NORTE.find((u) => u.match.test(head));
}

export type MonthVal = { mes: string; valor: number };

/** Os datasets de urgência publicam valores acumulados no ano; converte para valores mensais.
 *  Se a SPMS repetir o acumulado do mês anterior (mês por atualizar), esse mês e o seguinte, que soma os dois,
 *  ficam NaN ("a rever") em vez de entrarem nas comparações.
 *  shortcut: um mês em falta na publicação continua a ser absorvido pelo seguinte; só muda se a SPMS deixar buracos. */
export function decumulate<T extends { mes: string }>(rows: T[], fields: (keyof T)[]): T[] {
  const sorted = [...rows].sort((a, b) => a.mes.localeCompare(b.mes));
  let stuckBefore = false;
  return sorted.map((r, i) => {
    const prev = sorted[i - 1];
    if (!prev || prev.mes.slice(0, 4) !== r.mes.slice(0, 4)) {
      stuckBefore = false;
      return r;
    }
    const stuck = fields.every((f) => Number(r[f]) === Number(prev[f]));
    const out = { ...r };
    for (const f of fields) out[f] = (stuck || stuckBefore ? NaN : Number(r[f]) - Number(prev[f])) as T[keyof T];
    stuckBefore = stuck;
    return out;
  });
}

export type UlsMetric = {
  mes: string | null;
  valor: number | null;
  homologo: number | null; // mesmo mês do ano anterior
  varPct: number | null;
  z: number | null; // só para contagens pequenas (óbitos): teste de Poisson vs homólogo
  level: Level;
  serie: MonthVal[];
  suspeito?: boolean; // o mês ou o homólogo vieram de uma publicação repetida pela SPMS
};

const EMPTY: UlsMetric = { mes: null, valor: null, homologo: null, varPct: null, z: null, level: "sem-dados", serie: [] };
const prevYear = (mes: string) => `${Number(mes.slice(0, 4)) - 1}${mes.slice(4)}`;

/** Último mês vs mês homólogo. Contagens pequenas (óbitos) usam z de Poisson (Atenção z ≥ 2, Alerta z ≥ 3);
 *  contagens grandes (urgências) usam a variação percentual (Atenção ≥ 10 %, Alerta ≥ 20 %). */
export function compareHomologous(serie: MonthVal[], mode: "poisson" | "pct"): UlsMetric {
  if (!serie.length) return EMPTY;
  const last = serie.at(-1)!;
  const h = serie.find((s) => s.mes === prevYear(last.mes))?.valor ?? null;
  if (!Number.isFinite(last.valor) || (h != null && !Number.isFinite(h))) {
    return { ...EMPTY, mes: last.mes, valor: Number.isFinite(last.valor) ? last.valor : null, suspeito: true, serie };
  }
  const varPct = h ? ((last.valor - h) / h) * 100 : null;
  const z = h && mode === "poisson" ? (last.valor - h) / Math.sqrt(h) : null;
  let level: Level = "sem-dados";
  if (mode === "poisson" && z != null) level = z >= 3 ? "alerta" : z >= 2 ? "atencao" : "normal";
  if (mode === "pct" && varPct != null) level = varPct >= 20 ? "alerta" : varPct >= 10 ? "atencao" : "normal";
  return { mes: last.mes, valor: last.valor, homologo: h, varPct, z, level, serie };
}

/** Soma valores por ULS e mês, descartando o mês corrente (ainda incompleto). */
export function groupByUls(rows: { instituicao: string; mes: string; valor: number }[], currentMonth: string) {
  const acc = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const u = ulsOf(r.instituicao);
    if (!u || r.mes >= currentMonth || !Number.isFinite(r.valor)) continue;
    const m = acc.get(u.key) ?? new Map<string, number>();
    m.set(r.mes, (m.get(r.mes) ?? 0) + r.valor);
    acc.set(u.key, m);
  }
  const out = new Map<string, MonthVal[]>();
  for (const [k, m] of acc) out.set(k, [...m].map(([mes, valor]) => ({ mes, valor })).sort((a, b) => a.mes.localeCompare(b.mes)));
  return out;
}
