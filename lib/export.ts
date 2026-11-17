// Exportação para Excel: catálogo de variáveis e construção das folhas (função pura, testável sem rede).
import type { Point, UlsRow, FonteId } from "./sources";
import { FONTES } from "./sources";
import { addDays } from "./stats";
import type { Range } from "./flags";

export type Variavel = { id: string; grupo: string; label: string; fonte: FonteId; mensal?: boolean; nota?: string };

export const VARIAVEIS: Variavel[] = [
  { id: "episodios", grupo: "Urgências · Região Norte (diário)", label: "Episódios de urgência (estimados)", fonte: "gripal" },
  { id: "resp", grupo: "Urgências · Região Norte (diário)", label: "% urgências com infeção respiratória", fonte: "gripal" },
  { id: "triagem", grupo: "Urgências · Região Norte (diário)", label: "Tempo triagem → 1.ª observação (min)", fonte: "gripal" },
  { id: "naoUrgentes", grupo: "Urgências · Região Norte (diário)", label: "Episódios verdes/azuis por 100 000 hab.", fonte: "gripal" },
  { id: "internamento", grupo: "Urgências · Região Norte (diário)", label: "% urgências com internamento", fonte: "sazonal" },
  { id: "obitos", grupo: "Mortalidade (diário)", label: "Óbitos certificados por dia (Portugal)", fonte: "obitos" },
  { id: "friesa", grupo: "Temperatura e saúde (diário)", label: "Índice FRIESA Porto (geral)", fonte: "friesa" },
  { id: "friesa65", grupo: "Temperatura e saúde (diário)", label: "Índice FRIESA Porto (65+)", fonte: "friesa" },
  { id: "icaro", grupo: "Temperatura e saúde (diário)", label: "Índice ÍCARO", fonte: "icaro" },
  { id: "tMed", grupo: "Temperatura e saúde (diário)", label: "Temperatura média Porto (°C)", fonte: "meteo", nota: "Só os últimos 45 dias." },
  { id: "tMin", grupo: "Temperatura e saúde (diário)", label: "Temperatura mínima Porto (°C)", fonte: "meteo", nota: "Só os últimos 45 dias." },
  { id: "tMax", grupo: "Temperatura e saúde (diário)", label: "Temperatura máxima Porto (°C)", fonte: "meteo", nota: "Só os últimos 45 dias." },
  { id: "ulsObitos", grupo: "Por ULS (mensal)", label: "Óbitos certificados por ULS (SICO, local de certificação)", fonte: "obitosInst", mensal: true, nota: "Desde 2024." },
  { id: "ulsUrg", grupo: "Por ULS (mensal)", label: "Atendimentos em urgência por ULS", fonte: "urgUls", mensal: true, nota: "Desde 2024. Vazio = mês a rever (publicação repetida pela SPMS)." },
];
const BY_ID = new Map(VARIAVEIS.map((v) => [v.id, v]));

/** Lê ?v=a&v=b (ou v=a,b) e devolve só ids conhecidos, pela ordem do catálogo. */
export function parseVars(v: string | string[] | null | undefined): Variavel[] {
  const ids = new Set((Array.isArray(v) ? v : [v ?? ""]).flatMap((x) => x.split(",")).map((x) => x.trim()));
  return VARIAVEIS.filter((x) => ids.has(x.id));
}

type Cell = { value: string | number | Date; type?: typeof String | typeof Number | typeof Date; format?: string; fontWeight?: "bold" } | null;
export type Sheet = { sheet: string; data: Cell[][]; columns: { width: number }[]; stickyRowsCount: number };

const head = (s: string): Cell => ({ value: s, type: String, fontWeight: "bold" });
const num = (v: number | undefined): Cell => (v == null || !Number.isFinite(v) ? null : { value: Math.round(v * 100) / 100, type: Number });
const date = (iso: string): Cell => ({ value: new Date(`${iso}T00:00:00Z`), type: Date, format: "dd/mm/yyyy" });

export function buildSheets(vars: Variavel[], range: Range, daily: Partial<Record<string, Point[]>>, uls: UlsRow[], erros: Record<string, string>, geradoEm: string): Sheet[] {
  const sheets: Sheet[] = [];
  const diarias = vars.filter((v) => !v.mensal);
  if (diarias.length) {
    const maps = diarias.map((v) => new Map((daily[v.id] ?? []).map((p) => [p.date, p.value])));
    const rows: Cell[][] = [[head("Data"), ...diarias.map((v) => head(v.label))]];
    for (let d = range.from; d <= range.to; d = addDays(d, 1)) rows.push([date(d), ...maps.map((m) => num(m.get(d)))]);
    sheets.push({ sheet: "Diário", data: rows, columns: [{ width: 12 }, ...diarias.map(() => ({ width: 22 }))], stickyRowsCount: 1 });
  }
  const mensais = vars.filter((v) => v.mensal);
  if (mensais.length) {
    const [m0, m1] = [range.from.slice(0, 7), range.to.slice(0, 7)];
    const rows: Cell[][] = [[head("Mês"), head("ULS"), ...mensais.map((v) => head(v.label))]];
    for (const u of uls) {
      const series = mensais.map((v) => new Map((v.id === "ulsObitos" ? u.obitos : u.urgencias).serie.map((s) => [s.mes, s.valor])));
      const meses = [...new Set(series.flatMap((m) => [...m.keys()]))].filter((m) => m >= m0 && m <= m1).sort();
      for (const mes of meses) rows.push([{ value: mes, type: String }, { value: u.nome, type: String }, ...series.map((m) => num(m.get(mes)))]);
    }
    sheets.push({ sheet: "Mensal por ULS", data: rows, columns: [{ width: 10 }, { width: 30 }, ...mensais.map(() => ({ width: 26 }))], stickyRowsCount: 1 });
  }
  const fontes: Cell[][] = [[head("Variável"), head("Fonte"), head("Ligação"), head("Nota")]];
  for (const v of vars) {
    const f: { nome: string; url?: string } = FONTES[v.fonte];
    const nota = [v.nota, erros[v.id] && `Fonte indisponível na exportação: ${erros[v.id]}`].filter(Boolean).join(" ");
    fontes.push([{ value: v.label, type: String }, { value: f.nome, type: String }, f.url ? { value: f.url, type: String } : null, nota ? { value: nota, type: String } : null]);
  }
  fontes.push([], [{ value: `Período: ${range.from} a ${range.to}. Gerado a ${geradoEm}. Dados provisórios, sujeitos a revisão pelas entidades de origem.`, type: String }]);
  sheets.push({ sheet: "Fontes", data: fontes, columns: [{ width: 44 }, { width: 60 }, { width: 70 }, { width: 50 }], stickyRowsCount: 1 });
  return sheets;
}
