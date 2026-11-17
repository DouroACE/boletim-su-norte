// Modelos automáticos para os ficheiros da equipa (Vigilância Sazonal, Afluência ao SU).
// Funções puras; só imports de tipo (scripts/selfcheck-modelos.mjs carrega este ficheiro em Node).
import type { Table, Column } from "./analise";

export type Modelo = "vigilancia" | "afluencia_su";
export type Nivel = 0 | 1 | 2 | 3;
export type BaseRef = "ano anterior" | "28 dias anteriores";
export type Periodo = "dia" | "semana" | "mes";
export type Funcao = "soma" | "media" | "contagem";

/** Limiares de variação (%) da procura do SU, copiados de lib/risk.ts (DGS, níveis 1–3). */
const LIMIARES_PROCURA = [10, 25, 50];
/** Limiares de temperatura para os dias extremos (°C). */
export const LIMIAR_TMAX_EXTREMO = 30;
export const LIMIAR_TMIN_EXTREMO = 3;
/** Intervalo plausível para temperaturas diárias em Portugal (°C). */
const TEMP_MIN = -10, TEMP_MAX = 50;
const MIN_ATUAL = 4, MIN_ANO = 5, MIN_28 = 14;

const DAY = 864e5;
const isoOf = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (iso: string, k: number) => new Date(Date.parse(iso + "T00:00:00Z") + k * DAY).toISOString().slice(0, 10);
/** Um ano antes; 29 fev cai em 1 mar nos anos não bissextos. */
const addYears = (iso: string, k: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  return isoOf(new Date(Date.UTC(y + k, m - 1, d)));
};
const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const achar = (t: Table, re: RegExp) => t.columns.findIndex((c) => re.test(sem(c.name)));

/** Coluna de data: a primeira de tipo data cujo nome começa por "data"; senão a primeira de tipo data. */
function colData(t: Table): Column | undefined {
  return t.columns.find((c) => c.type === "date" && /^data/.test(sem(c.name))) ?? t.columns.find((c) => c.type === "date");
}

/** Pares (data, valor) de uma coluna numérica, só com data válida e valor finito. */
export function serieColuna(t: Table, re: RegExp): { dates: string[]; values: number[] } {
  const dates: string[] = [], values: number[] = [];
  const d = colData(t), c = t.columns.find((x) => re.test(sem(x.name)));
  if (!d || !c) return { dates, values };
  d.values.forEach((dv, i) => {
    const v = c.values[i];
    if (dv instanceof Date && typeof v === "number" && Number.isFinite(v)) { dates.push(isoOf(dv)); values.push(v); }
  });
  return { dates, values };
}

const mapaColuna = (t: Table, re: RegExp) => {
  const { dates, values } = serieColuna(t, re);
  return new Map<string, number>(dates.map((d, i) => [d, values[i]] as [string, number]));
};

/** Deteta o modelo pelo nome das colunas; null se nenhum modelo corresponder. */
export function detectarModelo(t: Table): Modelo | null {
  if (!colData(t)) return null;
  const tem = (re: RegExp) => achar(t, re) >= 0;
  if (tem(/^tmax$/) && tem(/^tmin$/) && tem(/^mortdiaria no aces$/)) return "vigilancia";
  const faixas = t.columns.filter((c) => /^(\d+ a \d+ anos|100 ou \+ anos)$/.test(sem(c.name))).length;
  if (tem(/^total$/) && faixas >= 3) return "afluencia_su";
  return null;
}

/* ---------- Procura do SU ---------- */

export type ProcuraSU = {
  refDate: string;
  atual: number | null;
  referencia: number | null;
  variacaoPct: number | null;
  nivel: Nivel | null;
  base: BaseRef;
  diasAtual: number;
  diasReferencia: number;
};
export type DiaProcura = ProcuraSU & { data: string };

/** Média dos dias com valor numa janela de n dias a partir de `inicio`. */
function mediaJanela(m: Map<string, number>, inicio: string, n: number) {
  let soma = 0, dias = 0;
  for (let i = 0; i < n; i++) {
    const v = m.get(addDays(inicio, i));
    if (v !== undefined) { soma += v; dias++; }
  }
  return { media: dias ? soma / dias : null, dias };
}

/** Procura nos 7 dias até refDate face à mesma semana do ano anterior; sem ano anterior, face aos 28 dias anteriores. */
function procuraEm(m: Map<string, number>, refDate: string): ProcuraSU {
  const ini = addDays(refDate, -6);
  const atual = mediaJanela(m, ini, 7);
  const ano = mediaJanela(m, addYears(ini, -1), 7);
  let base: BaseRef = "ano anterior";
  let ref = ano;
  if (ano.dias < MIN_ANO) {
    base = "28 dias anteriores";
    const r = mediaJanela(m, addDays(refDate, -34), 28);
    ref = r.dias >= MIN_28 ? r : { media: null, dias: r.dias };
  }
  const variacaoPct =
    atual.media != null && atual.dias >= MIN_ATUAL && ref.media != null && ref.media > 0
      ? ((atual.media - ref.media) / ref.media) * 100
      : null;
  return {
    refDate,
    atual: atual.dias >= MIN_ATUAL ? atual.media : null,
    referencia: ref.media,
    variacaoPct,
    nivel: variacaoPct == null ? null : (LIMIARES_PROCURA.filter((x) => variacaoPct >= x).length as Nivel),
    base,
    diasAtual: atual.dias,
    diasReferencia: ref.dias,
  };
}

const mapaPares = (dates: string[], totals: number[]) => new Map<string, number>(dates.map((d, i) => [d, totals[i]] as [string, number]));

/** Nível de procura do SU no dia refDate (média dos 7 dias até refDate). */
export function nivelProcuraSU(dates: string[], totals: number[], refDate: string): ProcuraSU {
  return procuraEm(mapaPares(dates, totals), refDate);
}

/** Nível por dia nos últimos ndays dias (até à última data com dados), com a mesma regra de referência. */
export function faixaNiveis(dates: string[], totals: number[], ndays = 30): DiaProcura[] {
  if (!dates.length) return [];
  const m = mapaPares(dates, totals);
  const fim = dates.reduce((a, b) => (b > a ? b : a));
  return Array.from({ length: ndays }, (_, i) => {
    const data = addDays(fim, i - (ndays - 1));
    return { data, ...procuraEm(m, data) };
  });
}

export type ResumoSU = {
  inicio: string;
  fim: string;
  dias: number;
  procura: ProcuraSU;
  faixa: DiaProcura[];
  total: number;
  pct80: number | null;
  pctInternamento: number | null;
};

const somaColuna = (c: Column | undefined) =>
  c ? c.values.reduce<number>((s, v) => (typeof v === "number" ? s + v : s), 0) : 0;

/** Painel de afluência ao SU: nível, faixa de 30 dias e totais do período. Null se não houver a coluna Total com datas. */
export function resumoSU(t: Table): ResumoSU | null {
  const { dates, values } = serieColuna(t, /^total$/);
  if (!dates.length) return null;
  const fim = dates.reduce((a, b) => (b > a ? b : a));
  const inicio = dates.reduce((a, b) => (b < a ? b : a));
  const cols = (re: RegExp) => t.columns.filter((c) => re.test(sem(c.name)));
  const total = values.reduce((s, v) => s + v, 0);
  // Percentagem só quando a coluna existe; null caso contrário (não 0 %).
  const pct = (re: RegExp) => {
    const cs = cols(re);
    return cs.length && total > 0 ? (cs.reduce((s, c) => s + somaColuna(c), 0) / total) * 100 : null;
  };
  return {
    inicio,
    fim,
    dias: new Set(dates).size,
    procura: nivelProcuraSU(dates, values, fim),
    faixa: faixaNiveis(dates, values, 30),
    total,
    pct80: pct(/^(80 a 89 anos|90 a 99 anos|100 ou \+ anos)$/),
    pctInternamento: pct(/^destino internamento$/),
  };
}

/* ---------- Vigilância ---------- */

export type ResumoVigilancia = {
  refDate: string;
  semana: {
    inicio: string;
    tmaxMedia: number | null;
    tminMedia: number | null;
    diasTemp: number;
    obitos: number;
    diasObitos: number;
    /** Mesma semana do ano anterior (em ficheiros carregados no mesmo projeto). */
    anterior: { obitos: number; dias: number } | null;
    /** Variação da média diária de óbitos face ao ano anterior (%). */
    variacaoPct: number | null;
  };
  extremos: { data: string; tmax: number | null; tmin: number | null; calor: boolean; frio: boolean }[];
};

/** Resumo da vigilância: últimos 7 dias, óbitos face ao ano anterior (usa também os ficheiros de `historico`) e dias extremos dos últimos 30. */
export function resumoVigilancia(t: Table, historico: Table[] = []): ResumoVigilancia | null {
  const tmax = mapaColuna(t, /^tmax$/), tmin = mapaColuna(t, /^tmin$/), obit = mapaColuna(t, /^mortdiaria no aces$/);
  const datas = [...new Set([...tmax.keys(), ...tmin.keys(), ...obit.keys()])].sort();
  if (!datas.length) return null;
  const refDate = datas[datas.length - 1];
  // Óbitos: o ficheiro atual tem precedência; os históricos preenchem os dias que faltam.
  const obitTodos = new Map(obit);
  for (const h of historico) for (const [d, v] of mapaColuna(h, /^mortdiaria no aces$/)) if (!obitTodos.has(d)) obitTodos.set(d, v);

  const ini = addDays(refDate, -6);
  const jt = mediaJanela(tmax, ini, 7), jn = mediaJanela(tmin, ini, 7);
  const jo = mediaJanela(obitTodos, ini, 7);
  const ano = mediaJanela(obitTodos, addYears(ini, -1), 7);
  const anterior = ano.dias >= MIN_ANO ? ano : null;
  const variacaoPct =
    jo.dias >= MIN_ATUAL && anterior && anterior.media && jo.media != null
      ? ((jo.media - anterior.media) / anterior.media) * 100
      : null;

  const extremos: ResumoVigilancia["extremos"] = [];
  for (let i = 29; i >= 0; i--) {
    const data = addDays(refDate, -i);
    const x = tmax.get(data) ?? null, n = tmin.get(data) ?? null;
    const calor = x != null && x >= LIMIAR_TMAX_EXTREMO, frio = n != null && n <= LIMIAR_TMIN_EXTREMO;
    if (calor || frio) extremos.push({ data, tmax: x, tmin: n, calor, frio });
  }

  return {
    refDate,
    semana: {
      inicio: ini,
      tmaxMedia: jt.media,
      tminMedia: jn.media,
      diasTemp: jt.dias,
      obitos: jo.media != null ? jo.media * jo.dias : 0,
      diasObitos: jo.dias,
      anterior: anterior && anterior.media != null ? { obitos: anterior.media * anterior.dias, dias: anterior.dias } : null,
      variacaoPct,
    },
    extremos,
  };
}

/* ---------- Correlações predefinidas ---------- */

export type PredefCorr = {
  id: string;
  titulo: string;
  descricao: string;
  /** Chaves "ti:ci" da Correlação (ti = índice da tabela na lista, ci = índice da coluna). */
  x: string;
  y: string;
  periodo: Periodo;
  funcao: Funcao;
  maxLag: number;
};

/** Predefinições para a vigilância da tabela ti; inclui Tmin → urgências se houver uma Afluência ao SU carregada. */
export function predefinicoes(tabelas: Table[], ti: number): PredefCorr[] {
  const t = tabelas[ti];
  if (!t || detectarModelo(t) !== "vigilancia") return [];
  const tmin = achar(t, /^tmin$/), tmax = achar(t, /^tmax$/), obit = achar(t, /^mortdiaria no aces$/);
  const out: PredefCorr[] = [];
  if (obit >= 0 && tmin >= 0) {
    out.push({ id: "tmin-obitos", titulo: "Tmin → óbitos ACES (semanal, até 4 semanas de desfasamento)", descricao: "Médias semanais; desfasamento de 0 a 4 semanas.", x: `${ti}:${tmin}`, y: `${ti}:${obit}`, periodo: "semana", funcao: "media", maxLag: 4 });
  }
  if (obit >= 0 && tmax >= 0) {
    out.push({ id: "tmax-obitos", titulo: "Tmax → óbitos ACES (semanal, até 4 semanas de desfasamento)", descricao: "Médias semanais; desfasamento de 0 a 4 semanas.", x: `${ti}:${tmax}`, y: `${ti}:${obit}`, periodo: "semana", funcao: "media", maxLag: 4 });
  }
  const ia = tabelas.findIndex((x) => detectarModelo(x) === "afluencia_su");
  const total = ia >= 0 ? achar(tabelas[ia], /^total$/) : -1;
  if (tmin >= 0 && total >= 0) {
    out.push({ id: "tmin-urgencias", titulo: "Tmin → total de urgências (diário, até 14 dias)", descricao: "Valores diários; desfasamento de 0 a 14 dias.", x: `${ti}:${tmin}`, y: `${ia}:${total}`, periodo: "dia", funcao: "media", maxLag: 14 });
  }
  return out;
}

/* ---------- Qualidade dos dados ---------- */

export type Qualidade = {
  linhas: number;
  /** null se a tabela não tiver coluna de data. */
  semDataValida: number | null;
  datasRepetidas: string[];
  /** A tabela tem colunas de temperatura (Tmin, Tmax, Tmed, Temp_…). */
  temperaturas: boolean;
  foraDeIntervalo: { data: string | null; coluna: string }[];
};

const RE_TEMPERATURA = /^(tmin|tmax|tmed|temp_(minima|maxima|media))$/;

/** Linhas sem data, datas repetidas e temperaturas fora de −10…50 °C. Só lista data e coluna, nunca outros valores. */
export function qualidade(t: Table): Qualidade {
  const d = colData(t);
  const contagem = new Map<string, number>();
  let semData = 0;
  if (d) {
    for (const v of d.values) {
      if (v instanceof Date) contagem.set(isoOf(v), (contagem.get(isoOf(v)) ?? 0) + 1);
      else semData++;
    }
  }
  const foraDeIntervalo: Qualidade["foraDeIntervalo"] = [];
  const temps = t.columns.filter((c) => RE_TEMPERATURA.test(sem(c.name)));
  for (const c of temps) {
    c.values.forEach((v, i) => {
      if (typeof v === "number" && (v < TEMP_MIN || v > TEMP_MAX)) {
        const dv = d?.values[i];
        foraDeIntervalo.push({ data: dv instanceof Date ? isoOf(dv) : null, coluna: c.name });
      }
    });
  }
  foraDeIntervalo.sort((a, b) => (a.data ?? "").localeCompare(b.data ?? "") || a.coluna.localeCompare(b.coluna));
  return {
    linhas: t.nRows,
    semDataValida: d ? semData : null,
    datasRepetidas: [...contagem].filter(([, n]) => n > 1).map(([k]) => k).sort(),
    temperaturas: temps.length > 0,
    foraDeIntervalo,
  };
}
