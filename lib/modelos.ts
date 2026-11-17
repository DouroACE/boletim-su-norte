// Modelos automáticos para os ficheiros da equipa (Vigilância Sazonal, Afluência ao SU).
// Funções puras; só imports de tipo (scripts/selfcheck-modelos.mjs carrega este ficheiro em Node).
import type { Table, Column, Cell } from "./analise";

export type Modelo = "vigilancia" | "afluencia_su" | "su_diario" | "su_diagnosticos" | "internamento" | "csp_mensal" | "csp_icpc2";
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
/** Cabeçalho normalizado: sem acentos, minúsculas, "–" e "-" iguais, espaços colapsados. */
const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s*[–—-]\s*/g, "-").replace(/\s+/g, " ").trim();
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
  const tem = (re: RegExp) => achar(t, re) >= 0;
  const comData = colData(t) != null;
  if (comData && tem(/^tmax$/) && tem(/^tmin$/) && tem(/^mortdiaria no aces$/)) return "vigilancia";
  // Ficheiro mensal da ULSSA: deteção só pelos nomes (um modelo vazio, só com cabeçalho, também se reconhece).
  if (tem(/^data$/) && tem(/^total$/) && tem(/^vermelho$/) && tem(/^laranja$/)) return "su_diario";
  const faixas = t.columns.filter((c) => /^(\d+ a \d+ anos|100 ou \+ anos)$/.test(sem(c.name))).length;
  if (comData && tem(/^total$/) && faixas >= 3) return "afluencia_su";
  if (tem(/^data$/) && tem(/^j44$/) && tem(/^a09$/)) return "su_diagnosticos";
  if (tem(/^data$/) && tem(/^ocupacao enfermarias/)) return "internamento";
  if (tem(/^mes$/) && tem(/^consultas abertas$/)) return "csp_mensal";
  if (tem(/^mes$/) && tem(/^ira$/) && tem(/^k77$/)) return "csp_icpc2";
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
function procuraEm(m: Map<string, number>, refDate: string, limiares: number[] = LIMIARES_PROCURA): ProcuraSU {
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
    nivel: variacaoPct == null ? null : (limiares.filter((x) => variacaoPct >= x).length as Nivel),
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
  // Procura: afluência (ficheiro antigo) ou SU_diario (ficheiro mensal).
  if (obit >= 0 && tmin >= 0) {
    out.push({ id: "tmin-obitos", titulo: "Tmin → óbitos ACES (semanal, até 4 semanas de desfasamento)", descricao: "Médias semanais; desfasamento de 0 a 4 semanas.", x: `${ti}:${tmin}`, y: `${ti}:${obit}`, periodo: "semana", funcao: "media", maxLag: 4 });
  }
  if (obit >= 0 && tmax >= 0) {
    out.push({ id: "tmax-obitos", titulo: "Tmax → óbitos ACES (semanal, até 4 semanas de desfasamento)", descricao: "Médias semanais; desfasamento de 0 a 4 semanas.", x: `${ti}:${tmax}`, y: `${ti}:${obit}`, periodo: "semana", funcao: "media", maxLag: 4 });
  }
  const ia = tabelas.findIndex((x) => detectarModelo(x) === "afluencia_su" || detectarModelo(x) === "su_diario");
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

/* ---------- Ficheiro mensal da ULSSA ---------- */

export const CORES = ["Vermelho", "Laranja", "Amarelo", "Verde", "Azul", "Branco"] as const;
export type Cor = (typeof CORES)[number];
const URGENTES: Cor[] = ["Vermelho", "Laranja", "Amarelo"];

/** Folhas do ficheiro mensal (cabeçalhos exatos). Usadas pelo modelo descarregável e pelas verificações. */
export const FOLHAS_MENSAIS: { folha: string; cabecalho: string[] }[] = [
  {
    folha: "SU_diario",
    cabecalho: ["Data", "Total", "0-9 anos", "10-19 anos", "20-29 anos", "30-39 anos", "40-49 anos", "50-59 anos", "60-69 anos", "70-79 anos", "80-89 anos", "90+ anos", ...CORES, "Destino internamento", "Destino UCI", "Óbitos no SU", "Tempo triagem-1.ª observação (min)", "Urgência psiquiátrica"],
  },
  { folha: "SU_diagnosticos", cabecalho: ["Data", "A09", "E86.0", "I20.0", "I21", "I24.9", "J00-J06", "J09-J11", "J20-J22", "J44", "J45", "R11", "R19.7", "T58", "T68"] },
  { folha: "Internamento", cabecalho: ["Data", "Ocupação enfermarias (%)", "Ocupação Medicina (%)", "Admissões UCI", "Doentes em boarding", "Óbitos hospitalares"] },
  { folha: "CSP_mensal", cabecalho: ["Mês", "ACeS", "Grupo etário", "Consultas abertas", "Consultas programadas", "Referenciações SNS 24", "Consultas SAC"] },
  { folha: "CSP_ICPC2", cabecalho: ["Mês", "ACeS", "IRA", "A04", "A08", "A88", "D70-D73", "K07", "K77", "S92", "T11"] },
];

const pad2 = (n: number) => String(n).padStart(2, "0");
/** Número em português (vírgula decimal), para textos da interface e dos motivos. */
export const fmtPt = (v: number, d = 1) => v.toLocaleString("pt-PT", { minimumFractionDigits: d, maximumFractionDigits: d });
const sinalPt = (v: number) => `${v >= 0 ? "+" : "−"}${fmtPt(Math.abs(v), 1)}`;
const pertence = (v: number, limiares: number[]) => limiares.filter((x) => v >= x).length as Nivel;
const txt = (v: Cell | undefined) => (v == null ? "" : String(v).trim());
const valorDe = (t: Table, re: RegExp, i: number): Cell | undefined => {
  const c = t.columns.find((x) => re.test(sem(x.name)));
  return c ? c.values[i] : undefined;
};

/* Células "<5" (contagens suprimidas): texto, nunca zero. */
const CENSURA = /^<\s*5$/;
const ehCensura = (v: unknown) => typeof v === "string" && CENSURA.test(v.trim());

/** Número de células "<5" (suprimidas) numa tabela. */
export function contarCensurados(t: Table): number {
  return t.columns.reduce((n, c) => n + c.values.filter(ehCensura).length, 0);
}

type Linhas = (string | number | Date | null)[][];
const vazia = (c: unknown) => c == null || (typeof c === "string" && c.trim() === "");

/** Constrói a tabela com `construir` (toTable) sem que os "<5" estraguem a deteção do tipo, e repõe-nos como texto "<5". */
export function tabelaComCensura(rows: Linhas, construir: (rows: Linhas) => Table): Table {
  const semCensura = rows.map((r) => r.map((c) => (ehCensura(c) ? null : c)));
  const t = construir(semCensura);
  const usadas = rows.map((_, i) => i).filter((i) => semCensura[i].some((c) => !vazia(c)));
  const [cab, ...dados] = usadas;
  if (cab == null) return t;
  rows[cab].forEach((h, ci) => {
    const nome = String(h ?? "").trim() || `Coluna ${ci + 1}`;
    const col = t.columns.find((c) => c.name === nome);
    if (!col) return;
    dados.forEach((ri, k) => {
      if (ehCensura(rows[ri][ci])) col.values[k] = "<5";
    });
  });
  return t;
}

/** Ano e mês de uma célula ("AAAA-MM", "AAAA-MM-DD", "MM/AAAA" ou Date). */
function partesMes(v: unknown): [number, number] | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : [v.getUTCFullYear(), v.getUTCMonth() + 1];
  if (typeof v !== "string") return null;
  const s = v.trim();
  const a = /^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/.exec(s);
  if (a) return +a[2] >= 1 && +a[2] <= 12 ? [+a[1], +a[2]] : null;
  const b = /^(\d{1,2})[/.-](\d{4})$/.exec(s);
  if (b) return +b[1] >= 1 && +b[1] <= 12 ? [+b[2], +b[1]] : null;
  return null;
}

/** Mês no formato "AAAA-MM", ou null se não for reconhecido. */
export function parseMes(v: unknown): string | null {
  const p = partesMes(v);
  return p ? `${p[0]}-${pad2(p[1])}` : null;
}

const mesMenos = (mes: string, k: number) => {
  const [a, m] = mes.split("-").map(Number);
  const t = a * 12 + (m - 1) - k;
  return `${Math.floor(t / 12)}-${pad2((t % 12) + 1)}`;
};

/** Junta tabelas do mesmo modelo numa só, linha a linha pela chave (null = ignorar a linha). A tabela mais tardia ganha nas chaves repetidas. */
export function juntar(tabelas: Table[], chaveDe: (t: Table, i: number) => string | null): Table | null {
  const nomes: { name: string; type: Column["type"] }[] = [];
  const linhas = new Map<string, Map<string, Cell>>();
  for (const t of tabelas) {
    for (const c of t.columns) if (!nomes.some((n) => n.name === c.name)) nomes.push({ name: c.name, type: c.type });
    for (let i = 0; i < t.nRows; i++) {
      const k = chaveDe(t, i);
      if (k == null) continue;
      linhas.set(k, new Map(t.columns.map((c) => [c.name, c.values[i] ?? null] as [string, Cell])));
    }
  }
  if (!linhas.size) return null;
  const chaves = [...linhas.keys()].sort();
  return {
    nRows: chaves.length,
    columns: nomes.map((n) => ({ name: n.name, type: n.type, values: chaves.map((k) => linhas.get(k)?.get(n.name) ?? null) })),
  };
}

/* ---------- Procura, ocupação, boarding (diário) ---------- */

export type NivelDia = {
  data: string;
  procura: { variacaoPct: number; nivel: Nivel; base: BaseRef } | null;
  ocupacao: { valor: number; nivel: Nivel } | null;
  medicina: { valor: number; nivel: Nivel } | null;
  boarding: { variacaoPct: number; nivel: Nivel; base: BaseRef } | null;
  nivel: Nivel | null;
  motivo: string;
};

const LIMIARES_OCUPACAO = [85, 95, 105];
const LIMIARES_BOARDING = [10, 20, 30];
const LIMIAR_MEDICINA = 100;

const mapaOpt = (t: Table | undefined, re: RegExp) => (t ? mapaColuna(t, re) : new Map<string, number>());

/** Nível diário: procura do SU (Total), ocupação das enfermarias, ocupação de Medicina e boarding (Internamento). Pior nível dos disponíveis. */
export function nivelDiarioULSSA(su?: Table, intern?: Table): NivelDia[] {
  const mTot = mapaOpt(su, /^total$/);
  const mOcup = mapaOpt(intern, /^ocupacao enfermarias/);
  const mMed = mapaOpt(intern, /^ocupacao medicina/);
  const mBoard = mapaOpt(intern, /^doentes em boarding$/);
  const datas = [...new Set([...mTot.keys(), ...mOcup.keys(), ...mMed.keys(), ...mBoard.keys()])].sort();
  const variacao = (m: Map<string, number>, data: string, limiares: number[]) => {
    if (!m.size) return null;
    const r = procuraEm(m, data, limiares);
    return r.variacaoPct == null || r.nivel == null ? null : { variacaoPct: r.variacaoPct, nivel: r.nivel, base: r.base };
  };
  return datas.map((data): NivelDia => {
    const procura = variacao(mTot, data, LIMIARES_PROCURA);
    const oc = mOcup.get(data);
    const ocupacao = oc == null ? null : { valor: oc, nivel: pertence(oc, LIMIARES_OCUPACAO) };
    const md = mMed.get(data);
    const medicina = md == null ? null : { valor: md, nivel: (md >= LIMIAR_MEDICINA ? 2 : 0) as Nivel };
    const boarding = variacao(mBoard, data, LIMIARES_BOARDING);
    const partes: string[] = [];
    const niveis: Nivel[] = [];
    if (procura) { partes.push(`Procura do SU ${sinalPt(procura.variacaoPct)} % vs ${procura.base} → nível ${procura.nivel}`); niveis.push(procura.nivel); }
    if (ocupacao) { partes.push(`Ocupação ${fmtPt(ocupacao.valor)} % → nível ${ocupacao.nivel}`); niveis.push(ocupacao.nivel); }
    if (medicina) { partes.push(`Ocupação Medicina ${fmtPt(medicina.valor)} % → nível ${medicina.nivel}`); niveis.push(medicina.nivel); }
    if (boarding) { partes.push(`Boarding ${sinalPt(boarding.variacaoPct)} % vs ${boarding.base} → nível ${boarding.nivel}`); niveis.push(boarding.nivel); }
    return {
      data,
      procura,
      ocupacao,
      medicina,
      boarding,
      nivel: niveis.length ? (Math.max(...niveis) as Nivel) : null,
      motivo: partes.length ? partes.join("; ") : "Sem dados suficientes",
    };
  });
}

/** Totais do período: média diária de SU, % internamento, UCI, ocupação média, óbitos. Null onde a coluna falta. */
export function kpisULSSA(su?: Table, intern?: Table) {
  const soma = (t: Table | undefined, re: RegExp) => {
    if (!t) return null;
    const { values } = serieColuna(t, re);
    return values.length ? values.reduce((s, v) => s + v, 0) : null;
  };
  const media = (t: Table | undefined, re: RegExp) => {
    if (!t) return null;
    const { values } = serieColuna(t, re);
    return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
  };
  const total = soma(su, /^total$/);
  const interna = soma(su, /^destino internamento$/);
  return {
    dias: su ? serieColuna(su, /^total$/).dates.length : 0,
    mediaSU: media(su, /^total$/),
    pctInternamento: total && interna != null ? (interna / total) * 100 : null,
    admissoesUci: soma(intern, /^admissoes uci$/),
    ocupacaoMedia: media(intern, /^ocupacao enfermarias/),
    obitosSU: soma(su, /^obitos no su$/),
    obitosHosp: soma(intern, /^obitos hospitalares$/),
  };
}

/* ---------- Triagem ---------- */

export type ContagemCores = {
  contagens: Record<Cor, number | null>;
  total: number;
  pct: Record<Cor, number | null>;
  /** (Vermelho + Laranja + Amarelo) / todas as cores. */
  pctUrgentes: number | null;
};
export type Triagem = ContagemCores & { dias: (ContagemCores & { data: string })[] };

function contagemCores(porCor: Record<Cor, number | null>): ContagemCores {
  const total = CORES.reduce((s, c) => s + (porCor[c] ?? 0), 0);
  const pct = {} as Record<Cor, number | null>;
  for (const c of CORES) pct[c] = porCor[c] != null && total > 0 ? (porCor[c]! / total) * 100 : null;
  const urg = URGENTES.reduce((s, c) => s + (porCor[c] ?? 0), 0);
  return { contagens: porCor, total, pct, pctUrgentes: total > 0 ? (urg / total) * 100 : null };
}

/** Triagem por dia e para o período (contagens, % por cor e % urgentes ou mais graves). */
export function triagemResumo(su: Table): Triagem {
  const mapas = {} as Record<Cor, Map<string, number>>;
  for (const c of CORES) mapas[c] = mapaColuna(su, new RegExp(`^${c.toLowerCase()}$`));
  const datas = [...new Set(CORES.flatMap((c) => [...mapas[c].keys()]))].sort();
  const soma = {} as Record<Cor, number | null>;
  for (const c of CORES) soma[c] = null;
  const dias = datas.map((data) => {
    const porCor = {} as Record<Cor, number | null>;
    for (const c of CORES) {
      const v = mapas[c].get(data) ?? null;
      porCor[c] = v;
      if (v != null) soma[c] = (soma[c] ?? 0) + v;
    }
    return { data, ...contagemCores(porCor) };
  });
  return { ...contagemCores(soma), dias };
}

/* ---------- CSP ---------- */

export type MetricaCsp = "abertas" | "programadas" | "sns24" | "sac";
export const METRICAS_CSP: { chave: MetricaCsp; rotulo: string }[] = [
  { chave: "abertas", rotulo: "Consultas abertas" },
  { chave: "programadas", rotulo: "Consultas programadas" },
  { chave: "sns24", rotulo: "Referenciações SNS 24" },
  { chave: "sac", rotulo: "Consultas SAC" },
];
const RE_CSP: Record<MetricaCsp, RegExp> = {
  abertas: /^consultas abertas$/,
  programadas: /^consultas programadas$/,
  sns24: /^referenciacoes sns 24$/,
  sac: /^consultas sac$/,
};
export type TotaisCsp = Record<MetricaCsp, number | null>;
export type CspLinha = { mes: string; aces: string; totais: TotaisCsp; variacao: TotaisCsp };
export type CspResumo = { linhas: CspLinha[]; porAces: { aces: string; totais: TotaisCsp }[] };

const vazioCsp = (): TotaisCsp => ({ abertas: null, programadas: null, sns24: null, sac: null });

/** Totais CSP por mês e ACeS (somando os grupos etários) e variação face ao mesmo mês do ano anterior, se existir. */
export function cspResumo(csp: Table): CspResumo {
  const acc = new Map<string, { mes: string; aces: string; totais: TotaisCsp }>();
  for (let i = 0; i < csp.nRows; i++) {
    const mes = parseMes(valorDe(csp, /^mes$/, i));
    const aces = txt(valorDe(csp, /^aces$/, i));
    if (!mes || !aces) continue;
    const k = `${mes}|${aces}`;
    const g = acc.get(k) ?? { mes, aces, totais: vazioCsp() };
    for (const m of METRICAS_CSP) {
      const v = valorDe(csp, RE_CSP[m.chave], i);
      if (typeof v === "number" && Number.isFinite(v)) g.totais[m.chave] = (g.totais[m.chave] ?? 0) + v;
    }
    acc.set(k, g);
  }
  const base = [...acc.values()].sort((a, b) => a.mes.localeCompare(b.mes) || a.aces.localeCompare(b.aces, "pt"));
  const linhas: CspLinha[] = base.map((l) => {
    const ant = acc.get(`${mesMenos(l.mes, 12)}|${l.aces}`);
    const variacao = vazioCsp();
    for (const m of METRICAS_CSP) {
      const a = l.totais[m.chave], b = ant?.totais[m.chave] ?? null;
      variacao[m.chave] = a != null && b != null && b > 0 ? ((a - b) / b) * 100 : null;
    }
    return { mes: l.mes, aces: l.aces, totais: l.totais, variacao };
  });
  const porAces = new Map<string, TotaisCsp>();
  for (const l of linhas) {
    const t = porAces.get(l.aces) ?? vazioCsp();
    for (const m of METRICAS_CSP) if (l.totais[m.chave] != null) t[m.chave] = (t[m.chave] ?? 0) + (l.totais[m.chave] ?? 0);
    porAces.set(l.aces, t);
  }
  return { linhas, porAces: [...porAces].map(([aces, totais]) => ({ aces, totais })) };
}

/** Totais por código/coluna (ICD-10 ou ICPC-2) de uma tabela; "<5" não entra no total. */
export function totaisPorCodigo(t: Table): { codigo: string; total: number; censurados: number }[] {
  return t.columns
    .filter((c) => !/^(data|mes|aces|grupo etario)$/.test(sem(c.name)))
    .map((c) => ({
      codigo: c.name,
      total: c.values.reduce<number>((s, v) => (typeof v === "number" && Number.isFinite(v) ? s + v : s), 0),
      censurados: c.values.filter(ehCensura).length,
    }));
}

/* ---------- Agregação mensal ---------- */

export type MensalULSSA = { su: Table | null; intern: Table | null; sud: Table | null; csp: Table | null; icpc: Table | null };

/** Junta, por modelo, todas as tabelas carregadas (ordem = ordem de carregamento; a mais tardia ganha). */
export function agregarMensal(tabelas: Table[]): MensalULSSA {
  const de = (m: Modelo) => tabelas.filter((t) => detectarModelo(t) === m);
  const porData = (t: Table, i: number) => {
    const d = colData(t)?.values[i];
    return d instanceof Date ? isoOf(d) : null;
  };
  const porMes = (t: Table, i: number) => {
    const mes = parseMes(valorDe(t, /^mes$/, i));
    return mes ? `${mes}|${txt(valorDe(t, /^aces$/, i))}|${txt(valorDe(t, /^grupo etario$/, i))}` : null;
  };
  return {
    su: juntar(de("su_diario"), porData),
    intern: juntar(de("internamento"), porData),
    sud: juntar(de("su_diagnosticos"), porData),
    csp: juntar(de("csp_mensal"), porMes),
    icpc: juntar(de("csp_icpc2"), porMes),
  };
}
