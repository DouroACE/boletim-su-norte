// Análise de ficheiros carregados pelo utilizador (CSV/Excel). Funções puras, executadas só no browser.
// Sem imports de valor: scripts/selfcheck-uls.mjs carrega este ficheiro diretamente em Node.

export type ColType = "date" | "number" | "category";
export type Cell = Date | number | string | null;
export type Column = { name: string; type: ColType; values: Cell[] };
export type Table = { columns: Column[]; nRows: number };
export type Period = "dia" | "semana" | "mes";
export type AggFn = "soma" | "media" | "contagem";
export type Pt = { date: string; value: number };

const DAY = 864e5;
const blank = (v: unknown) => v == null || (typeof v === "string" && v.trim() === "");
const isoOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Dia de calendário em UTC, à meia-noite; null se a data não existir (ex.: 31/02). */
function utcDay(y: number, m: number, d: number): Date | null {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? t : null;
}

/** Deteta o separador (; , ou tab) pelo cabeçalho, ignorando o que está entre aspas. Trata "" e quebras de linha dentro de campos. */
export function parseCSV(text: string): string[][] {
  const s = text.replace(/^﻿/, "");
  const header = s.split(/\r?\n/)[0] ?? "";
  const counts: Record<string, number> = { ";": 0, ",": 0, "\t": 0 };
  let inQ = false;
  for (const ch of header) {
    if (ch === '"') inQ = !inQ;
    else if (!inQ && ch in counts) counts[ch]++;
  }
  const delim = [";", ",", "\t"].reduce((best, d) => (counts[d] > counts[best] ? d : best), ";");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** Data a partir de Date, ISO (aaaa-mm-dd), dd/mm/aaaa, dd-mm-aaaa e, só em colunas com "data", número de série do Excel. */
export function asDate(v: unknown, header = ""): Date | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : utcDay(v.getFullYear(), v.getMonth() + 1, v.getDate());
  if (typeof v === "number") {
    if (!/data|date/i.test(header) || v < 20000 || v > 80000) return null;
    return new Date(Math.floor(v - 25569) * DAY);
  }
  if (typeof v !== "string") return null;
  const s = v.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?!\d)/.exec(s);
  if (iso) return utcDay(+iso[1], +iso[2], +iso[3]);
  const pt = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?!\d)/.exec(s);
  return pt ? utcDay(+pt[3], +pt[2], +pt[1]) : null;
}

/** Número em formatos PT ("1.234,5", "1234,5") ou com ponto ("1234.5"). "1.234" lê-se como milhares. */
export function asNum(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.replace(/\s/g, "");
  let t: string;
  if (/^[+-]?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) t = s.replace(/\./g, "").replace(",", ".");
  else if (/^[+-]?\d+,\d+$/.test(s)) t = s.replace(",", ".");
  else if (/^[+-]?\d+(\.\d+)?$/.test(s)) t = s;
  else return null;
  return Number(t);
}

/** Converte os valores de uma coluna para o tipo indicado (usado na deteção e quando o utilizador muda o tipo). */
export function retype(col: Column, type: ColType): Column {
  const values = col.values.map((v): Cell => {
    if (blank(v)) return null;
    if (type === "date") return asDate(v, col.name);
    if (type === "number") return asNum(v);
    if (v instanceof Date) {
      const d = asDate(v);
      return d ? isoOf(d.getTime()) : null;
    }
    return String(v).trim();
  });
  return { name: col.name, type, values };
}

/** Primeira linha não vazia é o cabeçalho. Tipo: data se ≥80% datas, número se ≥80% números, senão categoria. */
export function toTable(rows: (string | number | Date | null)[][]): Table {
  const filas = rows.filter((r) => r.some((c) => !blank(c)));
  if (!filas.length) return { columns: [], nRows: 0 };
  const [cab, ...dados] = filas;
  const largura = Math.max(...filas.map((r) => r.length));
  const columns = Array.from({ length: largura }, (_, i): Column => {
    const name = String(cab[i] ?? "").trim() || `Coluna ${i + 1}`;
    const raw: Cell[] = dados.map((r) => (blank(r[i]) ? null : (r[i] as Cell)));
    const cheios = raw.filter((v) => v != null);
    const share = (ok: (v: Cell) => boolean) => cheios.filter(ok).length / Math.max(cheios.length, 1);
    const type: ColType =
      share((v) => asDate(v, name) != null) >= 0.8 ? "date" : share((v) => asNum(v) != null) >= 0.8 ? "number" : "category";
    return retype({ name, type, values: raw }, type);
  });
  return { columns: withSplitDate(columns), nRows: dados.length };
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const sem = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** Folhas como "Vigilância Sazonal" guardam a data repartida em Ano / Mês (nome ou número) / Dia.
 *  Sem coluna de data, junta-as numa coluna "Data" (datas impossíveis, ex. 31 de junho, ficam vazias). */
function withSplitDate(columns: Column[]): Column[] {
  // Uma coluna de data esparsa (ex. "Alerta Frieza", só nos dias de alerta) não serve de eixo temporal.
  const n = columns[0]?.values.length ?? 0;
  if (columns.some((c) => c.type === "date" && c.values.filter(Boolean).length >= n / 2)) return columns;
  const find = (re: RegExp) => columns.find((c) => re.test(sem(c.name)));
  const ano = find(/^ano$/), dia = find(/^dia$/), mes = find(/^mes\d*$/);
  if (!ano || !dia || !mes) return columns;
  const values: Cell[] = ano.values.map((_, i) => {
    const y = asNum(ano.values[i]), d = asNum(dia.values[i]), mv = mes.values[i];
    const m = typeof mv === "number" ? mv : MESES.indexOf(sem(String(mv ?? "")).slice(0, 3)) + 1;
    return y && d && m >= 1 && m <= 12 && Number.isInteger(y) && y > 1900 ? utcDay(y, m, d) : null;
  });
  return values.some(Boolean) ? [{ name: "Data", type: "date", values }, ...columns] : columns;
}

/** Início do período: dia; semana a partir de segunda-feira; mês no dia 1. */
function bucket(d: Date, period: Period): string {
  const y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate();
  if (period === "mes") return isoOf(Date.UTC(y, m, 1));
  if (period === "semana") return isoOf(Date.UTC(y, m, day - ((d.getUTCDay() + 6) % 7)));
  return isoOf(Date.UTC(y, m, day));
}

/** Agrega por período. "contagem" conta os registos com valor numérico (use [1,1,…] para contar linhas). */
export function aggregateByDate(dates: unknown[], nums: unknown[], period: Period, fn: AggFn): Pt[] {
  const acc = new Map<string, { s: number; n: number }>();
  const len = Math.min(dates.length, nums.length);
  for (let i = 0; i < len; i++) {
    const d = asDate(dates[i]);
    const x = asNum(nums[i]);
    if (!d || x == null) continue;
    const key = bucket(d, period);
    const a = acc.get(key) ?? { s: 0, n: 0 };
    a.s += x;
    a.n += 1;
    acc.set(key, a);
  }
  return [...acc]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, a]) => ({ date, value: fn === "soma" ? a.s : fn === "media" ? a.s / a.n : a.n }));
}

function pearsonOf(x: number[], y: number[]): number {
  const n = x.length;
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - mx) * (y[i] - my);
    dx += (x[i] - mx) ** 2;
    dy += (y[i] - my) ** 2;
  }
  const den = Math.sqrt(dx * dy);
  return den > 0 ? num / den : NaN;
}

/** Ordinais com empates pela média (base do Spearman). */
function ranks(v: number[]): number[] {
  const idx = v.map((_, i) => i).sort((i, j) => v[i] - v[j]);
  const out = new Array<number>(v.length);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && v[idx[j + 1]] === v[idx[i]]) j++;
    for (let k = i; k <= j; k++) out[idx[k]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return out;
}

/** Passo da série em dias (mediana): 1 = dia, 7 = semana, senão mês. */
function inferPeriod(pts: Pt[]): Period {
  const ts = pts.map((p) => Date.parse(p.date + "T00:00:00Z")).sort((x, y) => x - y);
  const diffs: number[] = [];
  for (let i = 1; i < ts.length; i++) diffs.push((ts[i] - ts[i - 1]) / DAY);
  if (!diffs.length) return "dia";
  diffs.sort((x, y) => x - y);
  const med = diffs[Math.floor(diffs.length / 2)];
  return med <= 1.5 ? "dia" : med <= 8 ? "semana" : "mes";
}

function shiftDate(iso: string, k: number, period: Period): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (period === "mes") return isoOf(Date.UTC(y, m - 1 + k, 1));
  return isoOf(Date.UTC(y, m - 1, d + k * (period === "semana" ? 7 : 1)));
}

/** Correlação entre duas séries alinhadas por data. Lag k: b é lido k períodos depois de a (a antecede b). */
export function correlate(a: Pt[], b: Pt[], maxLag = 14) {
  const period = inferPeriod(a);
  const bm = new Map(b.map((p) => [p.date, p.value]));
  const pairsAt = (k: number) => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const p of a) {
      const v = bm.get(shiftDate(p.date, k, period));
      if (v !== undefined && Number.isFinite(p.value) && Number.isFinite(v)) { xs.push(p.value); ys.push(v); }
    }
    return { xs, ys };
  };
  const MIN_N = 8;
  const rAt = (k: number) => {
    const { xs, ys } = pairsAt(k);
    return xs.length >= MIN_N ? pearsonOf(xs, ys) : NaN;
  };
  const base = pairsAt(0);
  const lags: { lag: number; r: number }[] = [];
  for (let k = -maxLag; k <= maxLag; k++) lags.push({ lag: k, r: rAt(k) });
  let bestLag = { lag: 0, r: NaN };
  for (const l of lags) {
    if (Number.isFinite(l.r) && (!Number.isFinite(bestLag.r) || Math.abs(l.r) > Math.abs(bestLag.r))) bestLag = l;
  }
  const ok = base.xs.length >= MIN_N;
  return {
    n: base.xs.length,
    pearson: ok ? pearsonOf(base.xs, base.ys) : NaN,
    spearman: ok ? pearsonOf(ranks(base.xs), ranks(base.ys)) : NaN,
    bestLag,
    lags,
  };
}

export type Summary = {
  registos: number;
  colunas: {
    nome: string;
    tipo: ColType;
    preenchidas: number;
    emFalta: number;
    distintos?: number;
    min?: number | string;
    max?: number | string;
    media?: number;
  }[];
  semanal: { coluna: string; pontos: Pt[] }[];
};

const MAX_PONTOS = 60;
const MAX_SERIES = 12;

/** Resumo agregado para a IA: nomes, tipos, contagens, mín/máx/média e séries semanais. Nunca inclui valores de categoria. */
export function summarize(t: Table): Summary {
  const colunas = t.columns.map((c) => {
    const preenchidas = c.values.filter((v) => v != null).length;
    const base = { nome: c.name, tipo: c.type, preenchidas, emFalta: t.nRows - preenchidas };
    if (c.type === "category") {
      return { ...base, distintos: new Set(c.values.filter((v) => v != null).map(String)).size };
    }
    if (c.type === "date") {
      const ts = c.values.flatMap((v) => (v instanceof Date ? [v.getTime()] : [])).sort((x, y) => x - y);
      return ts.length ? { ...base, min: isoOf(ts[0]), max: isoOf(ts[ts.length - 1]) } : base;
    }
    const xs = c.values.flatMap((v) => { const x = asNum(v); return x == null ? [] : [x]; });
    if (!xs.length) return base;
    return {
      ...base,
      min: r2(Math.min(...xs)),
      max: r2(Math.max(...xs)),
      media: r2(xs.reduce((s, x) => s + x, 0) / xs.length),
    };
  });
  const dCol = t.columns.find((c) => c.type === "date");
  const semanal = dCol
    ? [
        ...t.columns
          .filter((c) => c.type === "number")
          .slice(0, MAX_SERIES)
          .map((c) => ({ coluna: c.name, pontos: aggregateByDate(dCol.values, c.values, "semana", "soma") })),
        {
          coluna: "Registos (contagem)",
          pontos: aggregateByDate(dCol.values, dCol.values.map((v) => (v == null ? null : 1)), "semana", "contagem"),
        },
      ].map((s) => ({ coluna: s.coluna, pontos: s.pontos.slice(-MAX_PONTOS).map((p) => ({ date: p.date, value: r2(p.value) })) }))
    : [];
  return { registos: t.nRows, colunas, semanal };
}

/* ------------------------------------------------------------------ */
/* Gráfico de várias séries, matriz de correlação e resumo para a IA   */
/* ------------------------------------------------------------------ */

/** Tabela com uma coluna "Data" e uma coluna numérica, a partir de pontos diários. */
export function tabelaDePontos(nome: string, pts: Pt[]): Table {
  return {
    nRows: pts.length,
    columns: [
      { name: "Data", type: "date", values: pts.map((p) => new Date(`${p.date}T00:00:00Z`)) },
      { name: nome, type: "number", values: pts.map((p) => p.value) },
    ],
  };
}

/**
 * Junta tabelas de origens diferentes numa só, em formato longo: coluna "Data" e uma coluna por variável
 * numérica ("prefixo · nome"). Cada linha vem de uma só tabela e as colunas das outras ficam a null,
 * que a agregação por data ignora. Tabelas sem coluna de data ou sem números ficam de fora.
 */
export function juntarTabelas(partes: { prefixo: string; table: Table }[]): Table {
  const usadas = partes.flatMap((p) => {
    const d = p.table.columns.find((c) => c.type === "date");
    const nums = p.table.columns.filter((c) => c.type === "number");
    return d && nums.length && p.table.nRows ? [{ ...p, d, nums }] : [];
  });
  const total = usadas.reduce((s, u) => s + u.table.nRows, 0);
  const datas: Cell[] = [];
  const colunas: Column[] = [];
  let inicio = 0;
  for (const u of usadas) {
    const n = u.table.nRows;
    for (let i = 0; i < n; i++) datas.push(u.d.values[i] ?? null);
    for (const c of u.nums) {
      const values: Cell[] = new Array(total).fill(null);
      for (let i = 0; i < n; i++) values[inicio + i] = c.values[i] ?? null;
      colunas.push({ name: u.prefixo ? `${u.prefixo} · ${c.name}` : c.name, type: "number", values });
    }
    inicio += n;
  }
  return { nRows: total, columns: [{ name: "Data", type: "date", values: datas }, ...colunas] };
}

export type Serie = { label: string; pts: Pt[] };
export const MAX_SERIES_GRAFICO = 6;
const MAX_CHAVE = 120;

/** Une as séries por data: uma linha por data existente em alguma série; null onde a série não tem ponto. Chaves s0, s1, … */
export function alinharSeries(series: Serie[]): Record<string, string | number | null>[] {
  const datas = [...new Set(series.flatMap((s) => s.pts.map((p) => p.date)))].sort();
  const mapas = series.map((s) => new Map(s.pts.map((p) => [p.date, p.value])));
  return datas.map((date) => {
    const row: Record<string, string | number | null> = { date };
    mapas.forEach((m, i) => { row[`s${i}`] = m.get(date) ?? null; });
    return row;
  });
}

/** Eixo direito: séries cujo máximo é ≥10× menor que o maior máximo. Com uma só série, nenhuma. */
export function eixoDireito(series: Serie[]): boolean[] {
  const maximos = series.map((s) => s.pts.reduce((m, p) => Math.max(m, Math.abs(p.value)), 0));
  const topo = Math.max(0, ...maximos);
  if (series.length < 2 || topo === 0) return series.map(() => false);
  return maximos.map((m) => m * 10 <= topo);
}

/** Índice 100 = média da série: 100 × valor / média. Sem média válida devolve []. */
export function normalizarIndice(pts: Pt[]): Pt[] {
  if (!pts.length) return [];
  const media = pts.reduce((s, p) => s + p.value, 0) / pts.length;
  if (!Number.isFinite(media) || media === 0) return [];
  return pts.map((p) => ({ date: p.date, value: (100 * p.value) / media }));
}

export type Matriz = { nomes: string[]; r: number[][]; n: number[][] };

/** Pearson r (desfasamento 0) para todos os pares de séries, com n de pares com data comum. */
export function matrizCorrelacao(series: Serie[]): Matriz {
  const pares = series.map((a) => series.map((b) => correlate(a.pts, b.pts, 0)));
  return {
    nomes: series.map((s) => s.label),
    r: pares.map((linha) => linha.map((c) => c.pearson)),
    n: pares.map((linha) => linha.map((c) => c.n)),
  };
}

export type ResumoPadroes = {
  periodo: Period;
  funcao: AggFn;
  series: {
    nome: string;
    n: number;
    media: number | null;
    minimo: { data: string; valor: number } | null;
    maximo: { data: string; valor: number } | null;
    tendencia: "crescente" | "decrescente" | "plana" | null;
    picos: { data: string; valor: number }[];
    variacaoVsPeriodoAnteriorPct: number | null;
  }[];
  correlacao: { nomes: string[]; r: (number | null)[][]; n: number[][] } | null;
};

/** Sinal do declive da regressão linear sobre o índice do período (indicativo, não estatístico). */
function tendenciaDe(pts: Pt[]): ResumoPadroes["series"][number]["tendencia"] {
  if (pts.length < 2) return null;
  const n = pts.length;
  const mx = (n - 1) / 2;
  const my = pts.reduce((s, p) => s + p.value, 0) / n;
  let num = 0, den = 0;
  pts.forEach((p, i) => { num += (i - mx) * (p.value - my); den += (i - mx) ** 2; });
  const declive = num / den;
  return declive > 0 ? "crescente" : declive < 0 ? "decrescente" : "plana";
}

/** Resumo agregado de séries no período escolhido: nunca inclui registos. Valores arredondados a 2 casas. */
export function resumoPadroes(series: Serie[], periodo: Period, funcao: AggFn): ResumoPadroes {
  const resumos = series.map((s) => {
    const pts = s.pts.filter((p) => Number.isFinite(p.value));
    const n = pts.length;
    if (!n) return { nome: s.label, n: 0, media: null, minimo: null, maximo: null, tendencia: null, picos: [], variacaoVsPeriodoAnteriorPct: null };
    const ord = [...pts].sort((a, b) => b.value - a.value || (a.date < b.date ? -1 : 1));
    const ponto = (p: Pt) => ({ data: p.date, valor: r2(p.value) });
    const ultimo = pts[n - 1], anterior = pts[n - 2];
    const variacao = n >= 2 && anterior.value !== 0 ? r2(((ultimo.value - anterior.value) / Math.abs(anterior.value)) * 100) : null;
    return {
      nome: s.label,
      n,
      media: r2(pts.reduce((acc, p) => acc + p.value, 0) / n),
      minimo: ponto(ord[ord.length - 1]),
      maximo: ponto(ord[0]),
      tendencia: tendenciaDe(pts),
      picos: ord.slice(0, 3).map(ponto),
      variacaoVsPeriodoAnteriorPct: variacao,
    };
  });
  let correlacao: ResumoPadroes["correlacao"] = null;
  if (series.length >= 2) {
    const m = matrizCorrelacao(series);
    correlacao = { nomes: m.nomes, r: m.r.map((l) => l.map((x) => (Number.isFinite(x) ? r2(x) : null))), n: m.n };
  }
  return { periodo, funcao, series: resumos, correlacao };
}

/** Valida o corpo do pedido de comentário de padrões. Devolve a mensagem de erro, ou null se for válido. */
export function validarResumoPadroes(x: unknown): string | null {
  const o = x as Record<string, unknown> | null;
  if (!o || typeof o !== "object" || Array.isArray(o)) return "O corpo tem de ser um objeto JSON.";
  if (!Array.isArray(o.series) || o.series.length < 1 || o.series.length > MAX_SERIES_GRAFICO) return `Indique entre 1 e ${MAX_SERIES_GRAFICO} séries.`;
  if (!["dia", "semana", "mes"].includes(String(o.periodo))) return "Período inválido.";
  if (!["soma", "media", "contagem"].includes(String(o.funcao))) return "Função de agregação inválida.";
  for (const s of o.series as unknown[]) {
    const q = s as Record<string, unknown> | null;
    if (!q || typeof q !== "object" || typeof q.nome !== "string" || q.nome.length > MAX_CHAVE) return "Nome de série inválido.";
    if (!Number.isInteger(q.n) || (q.n as number) < 0 || (q.n as number) > 1e6) return "Número de períodos inválido.";
    if (!Array.isArray(q.picos) || q.picos.length > 3) return "Picos inválidos.";
  }
  if (o.correlacao != null) {
    const c = o.correlacao as Record<string, unknown>;
    if (!Array.isArray(c.nomes) || c.nomes.length !== o.series.length || !Array.isArray(c.r)) return "Matriz de correlação inválida.";
  }
  return null;
}
