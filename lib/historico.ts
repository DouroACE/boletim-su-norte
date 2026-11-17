// Dados de boletins passados (folhas «Vigilância Sazonal» e afins) → métricas padrão, com o mesmo nome em todos os anos.
// Funções puras: a leitura do Excel e o armazenamento ficam no componente.
import { toTable, type Table } from "./analise.ts";

export type Metrica = { id: string; rotulo: string; grupo: string; padroes: RegExp[]; ordinal?: [RegExp, number][] };

const CORES: [RegExp, number][] = [[/vermelh/, 3], [/laranj/, 2], [/amarel/, 1], [/verde|sem aviso|nenhum/, 0]];
const SIGNIFICANCIA: [RegExp, number][] = [[/muito significativ/, 3], [/nao significativ/, 1], [/significativ/, 2], [/nulo|sem/, 0], ...CORES];
const AR: [RegExp, number][] = [[/muito bom/, 1], [/bom/, 2], [/medio|moderad/, 3], [/fraco/, 4], [/mau/, 5]];

/**
 * Catálogo das métricas padrão. Os padrões comparam o nome da coluna sem acentos e em minúsculas, pela ordem do catálogo.
 * «MortDiaria no ACES» sem nome do ACES vem dos ficheiros da USP de Gondomar; a equipa pode mudar a escolha no ecrã.
 */
export const METRICAS: Metrica[] = [
  { id: "obitos_aces_porto_ocidental", grupo: "Mortalidade", rotulo: "Óbitos diários · ACES Porto Ocidental", padroes: [/^mort\w* ?diaria no aces porto ocidental$/] },
  { id: "obitos_aces_porto_oriental", grupo: "Mortalidade", rotulo: "Óbitos diários · ACES Porto Oriental", padroes: [/^mort\w* ?diaria no aces porto oriental$/] },
  { id: "obitos_aces_gondomar", grupo: "Mortalidade", rotulo: "Óbitos diários · ACES Gondomar", padroes: [/^mort\w* ?diaria no aces( gondomar)?$/] },
  { id: "obitos_ulssa", grupo: "Mortalidade", rotulo: "Óbitos diários · Porto Ocidental + Gondomar", padroes: [/porto ocidental ?\+ ?gon/] },
  { id: "obitos_porto_gondomar", grupo: "Mortalidade", rotulo: "Óbitos diários · Porto + Gondomar", padroes: [/porto ?\+ ?gondomar/] },
  { id: "obitos_porto", grupo: "Mortalidade", rotulo: "Óbitos diários · Porto", padroes: [/^mortalidade diaria porto$/] },
  { id: "obitos_semana_gondomar", grupo: "Mortalidade", rotulo: "Óbitos semanais · concelho de Gondomar", padroes: [/^mort\w* ?semanal por concelho/] },
  { id: "tmax", grupo: "Meteorologia", rotulo: "Temperatura máxima (°C)", padroes: [/^t ?max\b/, /^temperatura maxima/] },
  { id: "tmed", grupo: "Meteorologia", rotulo: "Temperatura média (°C)", padroes: [/^t ?med\b/, /^temperatura media/] },
  { id: "tmin", grupo: "Meteorologia", rotulo: "Temperatura mínima (°C)", padroes: [/^t ?min\b/, /^temperatura minima/] },
  { id: "precip_dia", grupo: "Meteorologia", rotulo: "Precipitação diária (mm)", padroes: [/^precip\w* diaria/] },
  { id: "precip_acum", grupo: "Meteorologia", rotulo: "Precipitação acumulada (mm)", padroes: [/^precip\w* ?acum/] },
  { id: "uv", grupo: "Meteorologia", rotulo: "Índice UV", padroes: [/ultravioleta/, /^(indice )?uv$/] },
  { id: "ar", grupo: "Ambiente", rotulo: "Qualidade do ar (1 muito bom … 5 mau)", padroes: [/^qualidade do ar/], ordinal: AR },
  { id: "icaro_geral", grupo: "Índices", rotulo: "ÍCARO · população geral", padroes: [/^icaro (pop|geral)/] },
  { id: "icaro_65", grupo: "Índices", rotulo: "ÍCARO · mais de 65 anos", padroes: [/^icaro .*65/] },
  { id: "icaro_75", grupo: "Índices", rotulo: "ÍCARO · mais de 75 anos", padroes: [/^icaro .*75/] },
  { id: "friesa_tc_65", grupo: "Índices", rotulo: "FRIESA TC · 65+", padroes: [/friesa tc ?\+? ?65/] },
  { id: "friesa_cr_65", grupo: "Índices", rotulo: "FRIESA CR · 65+", padroes: [/friesa cr ?\+? ?65/] },
  { id: "friesa_tc", grupo: "Índices", rotulo: "FRIESA TC · geral", padroes: [/friesa tc$/] },
  { id: "friesa_cr", grupo: "Índices", rotulo: "FRIESA CR · geral", padroes: [/friesa cr$/] },
  { id: "aviso_ipma", grupo: "Alertas", rotulo: "Aviso IPMA (0 sem · 1 amarelo · 2 laranja · 3 vermelho)", padroes: [/^alerta ipma/], ordinal: CORES },
  { id: "alerta_temperatura", grupo: "Alertas", rotulo: "Alerta de temperatura (0 nulo … 3 muito significativo)", padroes: [/^alerta (de )?temperatura/], ordinal: SIGNIFICANCIA },
  { id: "episodios_su", grupo: "Hospital", rotulo: "Episódios de urgência (SU)", padroes: [/^(total )?(de )?episodios( de)? su/, /^afluencia/] },
  { id: "internamentos", grupo: "Hospital", rotulo: "Internamentos", padroes: [/^internament/] },
  { id: "uci", grupo: "Hospital", rotulo: "Admissões em UCI", padroes: [/^(admissoes )?uci$/] },
  // Afluência ao SU por grupo etário, como na folha SU_diario («0 a 9 anos» … «90+ anos»).
  ...[0, 10, 20, 30, 40, 50, 60, 70, 80].map((a): Metrica => ({
    id: `su_${a}_${a + 9}`, grupo: "Hospital", rotulo: `Episódios SU · ${a}–${a + 9} anos`, padroes: [new RegExp(`^${a} ?(a|-) ?${a + 9} anos$`)],
  })),
  { id: "su_90", grupo: "Hospital", rotulo: "Episódios SU · 90+ anos", padroes: [/^(90 ?\+|mais de 90|>= ?90)( anos)?$/] },
];
const POR_ID = new Map(METRICAS.map((m) => [m.id, m]));

export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Métrica padrão sugerida para um nome de coluna, ou null. */
export function sugerirMetrica(nome: string): string | null {
  const n = norm(nome);
  return METRICAS.find((m) => m.padroes.some((p) => p.test(n)))?.id ?? null;
}

/** Valor padronizado: número, ou texto de uma escala (cores, significância, qualidade do ar) convertido no nível mais alto citado. */
export function valorPadrao(v: unknown, metrica: Metrica): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string" || !metrica.ordinal) return null;
  // Termos mais específicos primeiro; cada termo encontrado sai do texto («muito bom» não conta também como «bom»).
  let s = norm(v);
  const niveis: number[] = [];
  for (const [re, n] of metrica.ordinal) {
    if (!re.test(s)) continue;
    niveis.push(n);
    s = s.replace(new RegExp(re.source, "g"), " ");
  }
  return niveis.length ? Math.max(...niveis) : null;
}

export type ColunaLida = { indice: number; nome: string; sugestao: string | null; amostra: string };
export type FolhaLida = { ficheiro: string; folha: string; table: Table; colunas: ColunaLida[]; dias: number; de: string; ate: string };

const isoDe = (d: Date) => d.toISOString().slice(0, 10);
const MAX_LINHAS = 5000;

const colunaDeDatas = (t: Table) => t.columns.findIndex((c) => c.type === "date" && c.values.filter(Boolean).length >= t.nRows / 2);

/**
 * Folha de um boletim passado → tabela com datas, ou null se não tiver eixo de datas.
 * Ignora linhas com menos de 3 células (folhas com colunas preenchidas até ao fim) e usa o ano do nome da folha
 * ou do ficheiro quando falta a coluna Ano.
 */
export function lerFolha(ficheiro: string, folha: string, linhas: (string | number | Date | null)[][]): FolhaLida | null {
  const uteis = linhas.filter((r) => r.filter((c) => c != null && String(c).trim() !== "").length >= 3).slice(0, MAX_LINHAS);
  const ano = Number(/(20\d{2})/.exec(folha)?.[1] ?? /(20\d{2})/.exec(ficheiro)?.[1] ?? NaN);
  const table = toTable(uteis, Number.isFinite(ano) ? ano : undefined);
  const iData = colunaDeDatas(table);
  if (iData < 0 || !table.nRows) return null;
  const datas = (table.columns[iData].values.filter((v) => v instanceof Date) as Date[]).map(isoDe).sort();
  const colunas = table.columns
    .map((c, indice) => ({ c, indice }))
    .filter(({ c, indice }) => indice !== iData && c.type !== "date" && c.values.some((v) => v != null))
    .map(({ c, indice }) => ({
      indice,
      nome: c.name,
      sugestao: sugerirMetrica(c.name),
      amostra: c.values.filter((v) => v != null).slice(0, 3).map((v) => (v instanceof Date ? isoDe(v) : String(v))).join(" · ").slice(0, 60),
    }));
  return { ficheiro, folha, table, colunas, dias: new Set(datas).size, de: datas[0], ate: datas[datas.length - 1] };
}

/** Série por métrica: data AAAA-MM-DD → valor. */
export type Historico = Record<string, Record<string, number>>;

/** Aplica o mapeamento (índice da coluna → id da métrica) e devolve as séries padronizadas da folha. */
export function padronizar(f: FolhaLida, mapa: Record<number, string>): Historico {
  const iData = colunaDeDatas(f.table);
  const out: Historico = {};
  if (iData < 0) return out;
  const datas = f.table.columns[iData].values;
  for (const [indice, id] of Object.entries(mapa)) {
    const m = POR_ID.get(id);
    const col = f.table.columns[Number(indice)];
    if (!m || !col) continue;
    col.values.forEach((v, i) => {
      const d = datas[i];
      const x = valorPadrao(v, m);
      if (d instanceof Date && x != null) (out[id] ??= {})[isoDe(d)] = x;
    });
  }
  return out;
}

/** Junta séries: em datas repetidas fica o valor de `novo`. */
export function juntarHistorico(base: Historico, novo: Historico): Historico {
  const out: Historico = { ...base };
  for (const [id, serie] of Object.entries(novo)) out[id] = { ...(out[id] ?? {}), ...serie };
  return out;
}

export type ResumoMetrica = { id: string; rotulo: string; dias: number; de: string; ate: string; porAno: Record<string, { media: number; max: number; n: number }> };

/** Por métrica: dias com valor, período e média e máximo por ano civil. Pela ordem do catálogo. */
export function resumoHistorico(h: Historico): ResumoMetrica[] {
  return METRICAS.filter((m) => h[m.id] && Object.keys(h[m.id]).length).map((m) => {
    const datas = Object.keys(h[m.id]).sort();
    const porAno: ResumoMetrica["porAno"] = {};
    for (const d of datas) {
      const v = h[m.id][d];
      const a = (porAno[d.slice(0, 4)] ??= { media: 0, max: -Infinity, n: 0 });
      a.media += v;
      a.max = Math.max(a.max, v);
      a.n++;
    }
    for (const a of Object.values(porAno)) a.media /= a.n;
    return { id: m.id, rotulo: m.rotulo, dias: datas.length, de: datas[0], ate: datas[datas.length - 1], porAno };
  });
}

/** Tabela «Data + uma coluna por métrica» para o Workspace (uma linha por data com algum valor). */
export function tabelaHistorico(h: Historico): Table {
  const ids = METRICAS.map((m) => m.id).filter((id) => h[id]);
  const datas = [...new Set(ids.flatMap((id) => Object.keys(h[id])))].sort();
  return {
    nRows: datas.length,
    columns: [
      { name: "Data", type: "date", values: datas.map((d) => new Date(`${d}T00:00:00Z`)) },
      ...ids.map((id) => ({ name: POR_ID.get(id)!.rotulo, type: "number" as const, values: datas.map((d) => h[id][d] ?? null) })),
    ],
  };
}

/** CSV padronizado (separador «;», vírgula decimal), para abrir no Excel português. */
export function csvHistorico(h: Historico): string {
  const t = tabelaHistorico(h);
  const cel = (v: unknown) => (v instanceof Date ? isoDe(v) : typeof v === "number" ? String(v).replace(".", ",") : "");
  const linhas = [t.columns.map((c) => `"${c.name.replace(/"/g, '""')}"`).join(";")];
  for (let i = 0; i < t.nRows; i++) linhas.push(t.columns.map((c) => cel(c.values[i])).join(";"));
  return linhas.join("\r\n");
}

/** Valida o que vem do armazenamento do browser: ids conhecidos, datas AAAA-MM-DD e números finitos. */
export function validarHistorico(x: unknown): Historico | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const out: Historico = {};
  for (const [id, serie] of Object.entries(x)) {
    if (!POR_ID.has(id) || !serie || typeof serie !== "object") return null;
    for (const [d, v] of Object.entries(serie as Record<string, unknown>)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || typeof v !== "number" || !Number.isFinite(v)) return null;
    }
    out[id] = serie as Record<string, number>;
  }
  return out;
}
