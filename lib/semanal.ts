// Ficheiro semanal em Excel (um por semana, uma folha por equipa) → registo semanal da DE-SNS.
// Sem dependências do browser: as folhas chegam já lidas como linhas (string | number | Date | null).
import {
  EQUIPAMENTO, LIGUE_ANTES, isoValido, quintaDe, segundaDe, textoCSP,
  type Diario, type Equipamento, type LigueAntes, type Nivel, type RegistoSemanal,
} from "./relatorios.ts";

import type { Table } from "./analise.ts";

export type Celula = string | number | boolean | Date | null;
export type Folhas = Record<string, Celula[][]>;

type Tipo = "data" | "nivel" | "numero" | "texto" | "opcao";
export type Campo = { chave: string; rotulo: string; tipo: Tipo; ajuda: string };

/** Folhas «Campo | Valor», pela ordem do modelo. A coluna A tem o rótulo exato; a equipa só preenche a coluna B. */
export const FOLHAS_CAMPOS: { folha: string; campos: Campo[] }[] = [
  {
    folha: "Hospital",
    campos: [
      { chave: "semana", rotulo: "Semana (segunda-feira)", tipo: "data", ajuda: "dd/mm/aaaa da segunda-feira" },
      { chave: "cuidadosNivel", rotulo: "Nível de ativação por procura do SU", tipo: "nivel", ajuda: "0 Verde, 1 Amarelo, 2 Laranja, 3 Vermelho" },
      { chave: "cuidadosEstrategias", rotulo: "Estratégias de resposta", tipo: "texto", ajuda: "texto livre" },
      { chave: "camasNivel", rotulo: "Nível de ativação de camas suplementares", tipo: "nivel", ajuda: "0 a 3" },
      { chave: "camasTexto", rotulo: "Camas suplementares (descrição)", tipo: "texto", ajuda: "ex.: 20 camas em cuidados continuados, 27 sociais" },
      { chave: "casosSociais", rotulo: "Atualização de casos sociais (data)", tipo: "data", ajuda: "dd/mm/aaaa; vazio = quinta-feira da semana" },
      { chave: "ligueAntes", rotulo: "Projeto Ligue Antes, Salve Vidas", tipo: "opcao", ajuda: LIGUE_ANTES.join(" / ") },
      { chave: "referenciacoes", rotulo: "Referenciações inter-ULS por constrangimentos", tipo: "opcao", ajuda: "Sim / Não" },
      { chave: "camasLivres", rotulo: "Camas livres em média", tipo: "numero", ajuda: "número" },
      { chave: "macasLivres", rotulo: "Macas livres em média", tipo: "numero", ajuda: "número" },
      { chave: "equipamento", rotulo: "Equipamento, incluindo cadeiras de rodas", tipo: "opcao", ajuda: EQUIPAMENTO.join(" / ") },
      { chave: "equipamentoTexto", rotulo: "Equipamento (observações)", tipo: "texto", ajuda: "texto livre" },
    ],
  },
  {
    folha: "CSP",
    campos: [
      { chave: "cspDoentesMedicoHora", rotulo: "Doentes por médico por hora (máximo da semana)", tipo: "numero", ajuda: "número; alerta acima de 4" },
      { chave: "cspAfluencia", rotulo: "Afluência (texto)", tipo: "texto", ajuda: "vazio = texto automático pelo número acima" },
      { chave: "cspAtividade", rotulo: "Atividade programada", tipo: "texto", ajuda: "ex.: Manutenção de atividade programada em todas as UF" },
      { chave: "cspSac", rotulo: "Consulta em regime aberto (SAC)", tipo: "texto", ajuda: "ex.: sem constrangimentos" },
    ],
  },
  {
    folha: "USP",
    campos: [
      { chave: "uspTexto", rotulo: "Alertas, avisos e atividade", tipo: "texto", ajuda: "vazio = sugestão automática (IPMA, ÍCARO, FRIESA)" },
      { chave: "observacoes", rotulo: "Observações", tipo: "texto", ajuda: "texto livre" },
    ],
  },
  {
    folha: "Laboratório",
    campos: [
      { chave: "lab:Influenza A positivos", rotulo: "Influenza A positivos", tipo: "numero", ajuda: "testes na semana" },
      { chave: "lab:Influenza A negativos", rotulo: "Influenza A negativos", tipo: "numero", ajuda: "testes na semana" },
      { chave: "lab:VSR positivos", rotulo: "VSR positivos", tipo: "numero", ajuda: "testes na semana" },
      { chave: "lab:VSR negativos", rotulo: "VSR negativos", tipo: "numero", ajuda: "testes na semana" },
      { chave: "lab:SARS-CoV-2 positivos", rotulo: "SARS-CoV-2 positivos", tipo: "numero", ajuda: "testes na semana" },
      { chave: "lab:SARS-CoV-2 negativos", rotulo: "SARS-CoV-2 negativos", tipo: "numero", ajuda: "testes na semana" },
    ],
  },
];

/** Folha diária: uma linha por dia. Colunas extra com números também entram no Workspace. */
export const FOLHA_DIARIA = "Indicadores diários";
export const COLUNAS_DIARIAS = [
  "Data", "Episódios SU", "Urgentes (vermelho+laranja+amarelo)", "Internamentos a partir do SU", "Óbitos no SU",
  "Tempo triagem-1.ª observação (min)", "Ocupação enfermarias (%)", "Doentes em boarding", "Consultas abertas CSP", "Consultas SAC",
  "Tmax (°C)", "Tmin (°C)",
];

export type SemanaLida = { registo: RegistoSemanal; avisos: string[] };

const MAX_LINHAS_DIARIAS = 31;
const MAX_COLUNAS_DIARIAS = 40;

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const isoDe = (d: Date) => d.toISOString().slice(0, 10);
const texto = (v: Celula) => (v == null ? "" : v instanceof Date ? isoDe(v) : String(v).trim());

/** Data em Date (do Excel), AAAA-MM-DD ou dd/mm/aaaa → AAAA-MM-DD válido, ou null. */
export function dataIso(v: Celula): string | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : isoDe(v);
  if (typeof v !== "string") return null;
  const s = v.trim();
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  const iso = m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : s.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && isoValido(iso) ? iso : null;
}

/** Número, ou texto com vírgula decimal; «<5», texto e vazios dão null. */
export function numero(v: Celula): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/\s/g, "").replace(",", ".");
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}

function opcao<T extends string>(v: Celula, opcoes: readonly T[]): T | null {
  const s = semAcento(texto(v));
  return opcoes.find((o) => semAcento(o) === s) ?? null;
}

function nivel(v: Celula): Nivel | null {
  const n = typeof v === "number" ? v : Number(/^\s*([0-3])\b/.exec(texto(v))?.[1] ?? NaN);
  return n === 0 || n === 1 || n === 2 || n === 3 ? n : null;
}

const acharFolha = (folhas: Folhas, nome: string) => Object.keys(folhas).find((n) => semAcento(n) === semAcento(nome));

/** Folha diária → colunas e linhas (datas AAAA-MM-DD, números ou null). Ignora linhas sem data válida. */
export function lerDiario(linhas: Celula[][]): Diario | null {
  const [cab, ...dados] = linhas;
  if (!cab) return null;
  const colunas = cab.slice(0, MAX_COLUNAS_DIARIAS).map(texto);
  const iData = colunas.findIndex((c) => semAcento(c) === "data");
  if (iData < 0) return null;
  const out = dados
    .map((l) => colunas.map((_, i) => (i === iData ? dataIso(l[i] ?? null) : numero(l[i] ?? null))))
    .filter((l) => l[iData] != null)
    .slice(0, MAX_LINHAS_DIARIAS);
  return out.length ? { colunas, linhas: out } : null;
}

/**
 * Lê o ficheiro semanal: registo da DE-SNS, números do laboratório e folha diária.
 * Campos vazios ficam como no registo vazio, com aviso nos níveis; a equipa revê antes de enviar.
 */
export function lerSemana(folhas: Folhas): SemanaLida | { erro: string } {
  const valores = new Map<string, Celula>();
  const avisos: string[] = [];
  for (const { folha, campos } of FOLHAS_CAMPOS) {
    const nome = acharFolha(folhas, folha);
    if (!nome) { avisos.push(`Falta a folha «${folha}».`); continue; }
    const porRotulo = new Map(campos.map((c) => [semAcento(c.rotulo), c.chave]));
    for (const l of folhas[nome]) {
      const chave = porRotulo.get(semAcento(texto(l[0] ?? null)));
      if (chave && texto(l[1] ?? null) !== "") valores.set(chave, l[1] ?? null);
    }
  }
  const nomeDiario = acharFolha(folhas, FOLHA_DIARIA);
  const diario = nomeDiario ? lerDiario(folhas[nomeDiario]) : null;

  const iData = diario ? diario.colunas.findIndex((c) => semAcento(c) === "data") : -1;
  const primeiroDia = diario ? (diario.linhas.map((l) => l[iData]) as string[]).sort()[0] : null;
  const dataSemana = dataIso(valores.get("semana") ?? null) ?? primeiroDia;
  if (!dataSemana) return { erro: "Sem semana: preencha «Semana (segunda-feira)» na folha Hospital." };
  const semana = segundaDe(dataSemana);
  if (semana !== dataSemana) avisos.push(`${dataSemana} não é segunda-feira: usada a semana que começa a ${semana}.`);

  const rotulos = new Map(FOLHAS_CAMPOS.flatMap((f) => f.campos).map((c) => [c.chave, c.rotulo]));
  const ler = <T,>(k: string, f: (v: Celula) => T | null, omissao: T): T => {
    if (!valores.has(k)) return omissao;
    const r = f(valores.get(k) ?? null);
    if (r != null) return r;
    avisos.push(`Valor inválido em «${rotulos.get(k)}»: ${texto(valores.get(k) ?? null)}.`);
    return omissao;
  };
  const naoNegativo = (v: Celula) => { const n = numero(v); return n != null && n >= 0 ? n : null; };

  const laboratorio: Record<string, number> = {};
  for (const k of rotulos.keys()) {
    if (!k.startsWith("lab:")) continue;
    const n = ler<number | null>(k, naoNegativo, null);
    if (n != null) laboratorio[k.slice(4)] = n;
  }
  for (const k of ["cuidadosNivel", "camasNivel"]) if (!valores.has(k)) avisos.push(`«${rotulos.get(k)}» vazio: ficou nível 0.`);

  const csp = ler<number | null>("cspDoentesMedicoHora", naoNegativo, null);
  const registo: RegistoSemanal = {
    semana,
    cuidadosNivel: ler<Nivel>("cuidadosNivel", nivel, 0),
    cuidadosEstrategias: ler("cuidadosEstrategias", texto, ""),
    camasNivel: ler<Nivel>("camasNivel", nivel, 0),
    camasTexto: ler("camasTexto", texto, ""),
    cspDoentesMedicoHora: csp,
    cspAfluencia: ler("cspAfluencia", texto, "") || textoCSP(csp),
    cspAtividade: ler("cspAtividade", texto, ""),
    cspSac: ler("cspSac", texto, ""),
    uspTexto: ler("uspTexto", texto, ""),
    casosSociais: ler("casosSociais", dataIso, quintaDe(semana)),
    ligueAntes: ler<LigueAntes>("ligueAntes", (v) => opcao(v, LIGUE_ANTES), LIGUE_ANTES[0]),
    referenciacoes: ler<"Sim" | "Não">("referenciacoes", (v) => opcao(v, ["Sim", "Não"] as const), "Não"),
    camasLivres: ler<number | null>("camasLivres", naoNegativo, null),
    macasLivres: ler<number | null>("macasLivres", naoNegativo, null),
    equipamento: ler<Equipamento>("equipamento", (v) => opcao(v, EQUIPAMENTO), EQUIPAMENTO[0]),
    equipamentoTexto: ler("equipamentoTexto", texto, ""),
    observacoes: ler("observacoes", texto, ""),
    ...(Object.keys(laboratorio).length ? { laboratorio } : {}),
    ...(diario ? { diario } : {}),
  };
  return { registo, avisos };
}

/* ------------------------------------------------------------------ */
/* Workspace: as semanas guardadas em tabelas (datas como Date UTC)    */
/* ------------------------------------------------------------------ */

const VIRUS = ["Influenza A", "VSR", "SARS-CoV-2"];
const dataUtc = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** Uma linha por semana (data da segunda-feira): números da matriz, testes do laboratório e positividade (%). */
export function tabelaSemanal(registos: RegistoSemanal[]): Table {
  const rs = [...registos].sort((a, b) => a.semana.localeCompare(b.semana));
  const positividade = (r: RegistoSemanal, v: string) => {
    const p = r.laboratorio?.[`${v} positivos`];
    const n = r.laboratorio?.[`${v} negativos`];
    return p != null && n != null && p + n > 0 ? (100 * p) / (p + n) : null;
  };
  const campos: [string, (r: RegistoSemanal) => number | null][] = [
    ["Nível SU (0–3)", (r) => r.cuidadosNivel],
    ["Nível camas suplementares (0–3)", (r) => r.camasNivel],
    ["Doentes por médico por hora (CSP)", (r) => r.cspDoentesMedicoHora],
    ["Camas livres (média)", (r) => r.camasLivres],
    ["Macas livres (média)", (r) => r.macasLivres],
    ["Referenciações inter-ULS (1 = sim)", (r) => (r.referenciacoes === "Sim" ? 1 : 0)],
    ...VIRUS.map((v): [string, (r: RegistoSemanal) => number | null] => [`Positividade ${v} (%)`, (r) => positividade(r, v)]),
    ...VIRUS.map((v): [string, (r: RegistoSemanal) => number | null] => [`${v} positivos`, (r) => r.laboratorio?.[`${v} positivos`] ?? null]),
  ];
  return {
    nRows: rs.length,
    columns: [
      { name: "Data", type: "date", values: rs.map((r) => dataUtc(r.semana)) },
      ...campos.map(([name, f]) => ({ name, type: "number" as const, values: rs.map(f) })),
    ],
  };
}

/** Todas as folhas diárias juntas: colunas pela união dos nomes, por ordem de aparecimento; datas repetidas ficam (a agregação junta-as). */
export function tabelaDiaria(registos: RegistoSemanal[]): Table {
  const comDiario = registos.filter((r) => r.diario);
  const nomes = [...new Set(comDiario.flatMap((r) => r.diario!.colunas.filter((c) => semAcento(c) !== "data")))];
  const linhas = comDiario.flatMap((r) => {
    const d = r.diario!;
    const iData = d.colunas.findIndex((c) => semAcento(c) === "data");
    return d.linhas.map((l) => ({ data: l[iData] as string, valores: new Map(d.colunas.map((c, i) => [c, l[i]])) }));
  });
  return {
    nRows: linhas.length,
    columns: [
      { name: "Data", type: "date", values: linhas.map((l) => dataUtc(l.data)) },
      ...nomes.map((name) => ({ name, type: "number" as const, values: linhas.map((l) => { const v = l.valores.get(name); return typeof v === "number" ? v : null; }) })),
    ],
  };
}
