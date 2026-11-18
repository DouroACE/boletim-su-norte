// Excel de afluência ao SU (uma linha por dia) → registos diários. Corre no browser; nada vai para o servidor.
import type { LocalRec } from "./local.ts";
import type { Table } from "./analise.ts";

type Linha = (string | number | boolean | Date | null)[];

/** Cabeçalho do Excel → chave interna, por «começa por», sem acentos nem maiúsculas. A ordem conta («diarreia» antes de «desidratação»). */
const MAPA: [string, keyof LocalRec][] = [
  ["data", "date"], ["total", "total"],
  ["0 a 9", "a0_9"], ["10 a 19", "a10_19"], ["20 a 29", "a20_29"], ["30 a 39", "a30_39"], ["40 a 49", "a40_49"],
  ["50 a 59", "a50_59"], ["60 a 69", "a60_69"], ["70 a 79", "a70_79"], ["80 a 89", "a80_89"], ["90 a 99", "a90_99"], ["100 ou", "a100"],
  ["desconhecido", "aUnk"],
  ["gastroenterite", "gastro"], ["angina", "angina"],
  ["infecoes agudas do trato respiratorio superior", "iras"], ["infecoes agudas do trato respiratorio inferior", "irai"],
  ["diarreia", "diarreia"], ["desidratacao", "desidratacao"],
  ["tempo medio triagem", "tempoTriagem"], ["falecidos", "falecidos"], ["destino internamento", "internamento"],
  ["enfermaria", "enfermaria"], ["uci", "uci"], ["idade media", "idadeMedia"],
  ["gondomar", "oGondomar"], ["porto ocidental", "oPortoOcidental"], ["porto oriental", "oPortoOriental"], ["outra", "oOutra"], ["desconhecida", "oDesconhecida"],
  ["temp_media", "tMed"], ["temp_minima", "tMin"], ["temp_maxima", "tMax"], ["precipitacao", "precip"], ["icaro", "icaro"],
];

const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function dataIso(v: unknown): string | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5).toISOString().slice(0, 10);
  const s = String(v ?? "");
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return iso[0];
  const pt = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  return pt ? `${pt[3]}-${pt[2].padStart(2, "0")}-${pt[1].padStart(2, "0")}` : null;
}

const numero = (v: unknown) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v ?? "").trim().replace(",", ".");
  return s !== "" && Number.isFinite(Number(s)) ? Number(s) : null;
};

export type LeituraSU = { registos: LocalRec[]; ignoradas: string[] } | { erro: string };

/** Primeira folha cujo cabeçalho tenha «Data» e «Total». Linhas sem data válida ficam de fora. */
export function lerFicheiroSU(folhas: { sheet: string; data: Linha[] }[]): LeituraSU {
  for (const { data } of folhas) {
    const iCab = data.findIndex((l) => l.some((c) => norm(c) === "data") && l.some((c) => norm(c).startsWith("total")));
    if (iCab < 0) continue;
    const cab = data[iCab].map(norm);
    const chaves = cab.map((h) => (h ? MAPA.find(([p]) => h.startsWith(p))?.[1] ?? null : null));
    const registos: LocalRec[] = [];
    for (const l of data.slice(iCab + 1)) {
      const rec: Record<string, unknown> = {};
      chaves.forEach((k, i) => {
        if (!k) return;
        rec[k] = k === "date" ? dataIso(l[i]) : numero(l[i]);
      });
      if (rec.date && typeof rec.total === "number") registos.push(rec as LocalRec);
    }
    if (!registos.length) return { erro: "A folha tem cabeçalho de afluência ao SU mas nenhuma linha com data e total." };
    return { registos: registos.sort((a, b) => a.date.localeCompare(b.date)), ignoradas: cab.filter((h, i) => h && !chaves[i]) };
  }
  return { erro: "Não encontrei a folha de afluência ao SU (cabeçalho com «Data» e «Total»)." };
}

/** Junta por data: em datas repetidas fica o registo novo. */
export function juntarSU(base: LocalRec[], novos: LocalRec[]): LocalRec[] {
  const m = new Map(base.map((r) => [r.date, r]));
  for (const r of novos) m.set(r.date, { ...(m.get(r.date) ?? {}), ...r });
  return [...m.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Registos do SU em tabela para o Workspace (uma coluna por indicador diário, nomes legíveis). */
export function tabelaSU(registos: LocalRec[]): Table {
  const v = (x: number | null | undefined) => (typeof x === "number" && Number.isFinite(x) ? x : null);
  const soma = (...xs: (number | null | undefined)[]) => (xs.some((x) => typeof x === "number") ? xs.reduce<number>((s, x) => s + (v(x) ?? 0), 0) : null);
  const cols: [string, (r: LocalRec) => number | null][] = [
    ["Episódios de urgência", (r) => v(r.total)],
    ["Infeções respiratórias agudas", (r) => soma(r.iras, r.irai)],
    ["Gastroenterite e diarreia", (r) => soma(r.gastro, r.diarreia)],
    ["Internamentos a partir do SU", (r) => v(r.internamento)],
    ["Admissões em UCI", (r) => v(r.uci)],
    ["Óbitos no SU", (r) => v(r.falecidos)],
    ["Tempo triagem → 1.ª observação (min)", (r) => v(r.tempoTriagem)],
    ["Episódios 80+ anos", (r) => soma(r.a80_89, r.a90_99, r.a100)],
    ["Idade média", (r) => v(r.idadeMedia)],
    ["Temperatura média (°C)", (r) => v(r.tMed)],
    ["Temperatura mínima (°C)", (r) => v(r.tMin)],
    ["Temperatura máxima (°C)", (r) => v(r.tMax)],
  ];
  return {
    nRows: registos.length,
    columns: [
      { name: "Data", type: "date", values: registos.map((r) => new Date(`${r.date}T00:00:00Z`)) },
      ...cols.map(([name, f]) => ({ name, type: "number" as const, values: registos.map(f) })),
    ],
  };
}
