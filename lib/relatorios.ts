// Relatórios semanais para a DE-SNS: modelo, datas, textos e tabela. Sem React nem fetch.
// Só importa tipos de ./sources (apagados em execução), para o selfcheck correr em Node sem transpilação.
import type { Aviso, Point } from "./sources";

export type Nivel = 0 | 1 | 2 | 3;
export const NIVEIS_TEXTO = ["Verde", "Amarelo", "Laranja", "Vermelho"] as const;
export const LIGUE_ANTES = ["Não implementado", "Em implementação", "Implementado"] as const;
export type LigueAntes = (typeof LIGUE_ANTES)[number];
export const EQUIPAMENTO = ["Suficientes", "Insuficientes"] as const;
export type Equipamento = (typeof EQUIPAMENTO)[number];

/** Um registo = uma semana (segunda a domingo). A chave é a segunda-feira, AAAA-MM-DD. */
export type RegistoSemanal = {
  semana: string;
  /** Campo 2: nível de ativação por procura do SU, e estratégias de resposta. */
  cuidadosNivel: Nivel;
  cuidadosEstrategias: string;
  /** Campo 3: nível de ativação de camas suplementares, e texto. */
  camasNivel: Nivel;
  camasTexto: string;
  /** Campo 4: doentes por médico por hora (número), afluência (texto), atividade programada e SAC. */
  cspDoentesMedicoHora: number | null;
  cspAfluencia: string;
  cspAtividade: string;
  cspSac: string;
  /** Campo 5: alertas e avisos em vigor e atividade. */
  uspTexto: string;
  /** Campo 6: data da atualização de casos sociais (quinta-feira por omissão). */
  casosSociais: string;
  /** Campo 7 */
  ligueAntes: LigueAntes;
  /** Campo 8 */
  referenciacoes: "Sim" | "Não";
  /** Campo 9: média de camas e de macas livres ("20/27"). */
  camasLivres: number | null;
  macasLivres: number | null;
  /** Campo 10 */
  equipamento: Equipamento;
  equipamentoTexto: string;
  /** Campo 11 */
  observacoes: string;
};

const DIA = 864e5;
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
/** Limite de tamanho para textos importados de um ficheiro (defesa contra cópias corrompidas). */
const MAX_TEXTO = 5000;

const tempo = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
const isoDe = (t: number) => new Date(t).toISOString().slice(0, 10);
export const isoValido = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && isoDe(tempo(s)) === s;
const dia = (iso: string) => Number(iso.slice(8, 10));
const mes = (iso: string) => Number(iso.slice(5, 7)) - 1;
const ano = (iso: string) => iso.slice(0, 4);
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const dataPt = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
/** Número em pt-PT: vírgula decimal, até uma casa. */
const numPt = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");

/** Soma n dias a uma data AAAA-MM-DD. */
export function addDias(iso: string, n: number): string {
  return isoDe(tempo(iso) + n * DIA);
}

/** Segunda-feira da semana que contém a data. */
export function segundaDe(iso: string): string {
  const dow = new Date(tempo(iso)).getUTCDay(); // 0 = domingo
  return addDias(iso, -((dow + 6) % 7));
}

export const domingoDe = (segunda: string) => addDias(segunda, 6);
export const quintaDe = (segunda: string) => addDias(segunda, 3);
export const semanaAnterior = (iso: string) => addDias(segundaDe(iso), -7);
export const semanaSeguinte = (iso: string) => addDias(segundaDe(iso), 7);

/** "17–23 de novembro de 2026", "29 de novembro – 5 de dezembro de 2026", "29 de dezembro de 2025 – 4 de janeiro de 2026". */
export function rotuloSemana(segunda: string): string {
  const a = segunda;
  const b = domingoDe(segunda);
  if (ano(a) !== ano(b))
    return `${dia(a)} de ${MESES[mes(a)]} de ${ano(a)} – ${dia(b)} de ${MESES[mes(b)]} de ${ano(b)}`;
  if (mes(a) !== mes(b)) return `${dia(a)} de ${MESES[mes(a)]} – ${dia(b)} de ${MESES[mes(b)]} de ${ano(b)}`;
  return `${dia(a)}–${dia(b)} de ${MESES[mes(a)]} de ${ano(b)}`;
}

/** Última semana completa: a segunda-feira da semana anterior à semana (segunda a domingo) de hoje. */
export const ultimaSemanaCompleta = (hojeIso: string) => addDias(segundaDe(hojeIso), -7);

/** Época crítica nos CSP: 15/11 a 31/01. Verdadeiro se a semana (segunda a domingo) a sobrepuser. */
export function sobrepoeEpocaCritica(segunda: string): boolean {
  const dom = domingoDe(segunda);
  const y = Number(ano(segunda));
  return [y - 1, y].some((a) => segunda <= `${a + 1}-01-31` && dom >= `${a}-11-15`);
}

/** Afluência nos CSP. Só > 4 doentes/médico/hora é critério de alerta (regra da ULSSA). Vazio se não indicado. */
export function textoCSP(doentesPorMedicoHora: number | null): string {
  if (doentesPorMedicoHora == null || !Number.isFinite(doentesPorMedicoHora)) return "";
  if (doentesPorMedicoHora > 4)
    return `Afluência de ${numPt(doentesPorMedicoHora)} doentes por médico por hora, acima do critério de alerta da ULSSA (mais de 4), de forma persistente.`;
  return "Afluência igual ou inferior a 4 doentes por médico por hora em todas as UF.";
}

const TEXTO_SEM_ALERTAS = "Atividade programada; ausência de alertas de risco.";
const NIVEL_IPMA: Record<string, string> = { yellow: "amarelo", orange: "laranja", red: "vermelho" };

/**
 * Sugestão para o campo USP. Avisos IPMA do distrito do Porto só entram se a semana contém hoje (sem histórico).
 * ÍCARO e FRIESA: não há limiar de nível no código (o ÍCARO é confirmado manualmente em /alertas, e o FRIESA
 * só tem um z-score sobre 5 épocas), por isso só se indica o máximo da semana, sem classificar.
 */
export function sugestaoUSP(icaro: Point[], friesa65: Point[], avisosPorto: Aviso[], segunda: string, hoje: string): string {
  const dom = domingoDe(segunda);
  const partes: string[] = [];

  if (hoje >= segunda && hoje <= dom) {
    for (const a of avisosPorto) {
      const inicio = a.inicio.slice(0, 10);
      const fim = a.fim.slice(0, 10);
      if (inicio <= hoje && fim >= hoje)
        partes.push(`Aviso ${NIVEL_IPMA[a.nivel] ?? a.nivel} do IPMA para o distrito do Porto: ${a.tipo.toLowerCase()}, em vigor até ${ddmm(fim)}.`);
    }
  }

  // Só o máximo da semana: o FRIESA é > 0 quase todos os dias e não há limiar de alerta no código (a classificação fica com a equipa).
  const maximo = (pts: Point[]) =>
    pts.filter((p) => p.date >= segunda && p.date <= dom && Number.isFinite(p.value)).reduce<Point | null>((m, p) => (!m || p.value > m.value ? p : m), null);
  const ic = maximo(icaro);
  if (ic) partes.push(`Índice ÍCARO: máximo da semana ${numPt(ic.value)} a ${ddmm(ic.date)}.`);
  const fr = maximo(friesa65);
  if (fr) partes.push(`Índice FRIESA (Porto, 65+): máximo da semana ${numPt(fr.value)} a ${ddmm(fr.date)}.`);

  if (!ic && !fr) partes.push("Sem valores ÍCARO nem FRIESA publicados para esta semana.");
  return partes.length > 1 || ic || fr ? partes.join(" ") : `${TEXTO_SEM_ALERTAS} ${partes.join(" ")}`;
}

const vazio = (s: string) => s.replace(/\s*\n\s*/g, " ").trim() || "—";
const nivelTexto = (n: Nivel) => `nível ${n} (${NIVEIS_TEXTO[n]})`;

/** Texto simples para colar num e-mail: os 11 campos, um por linha, com as etiquetas do formulário. */
export function textoEmail(r: RegistoSemanal): string {
  const camas = `${r.camasLivres == null ? "—" : numPt(r.camasLivres)}/${r.macasLivres == null ? "—" : numPt(r.macasLivres)}`;
  return [
    `Semana: ${rotuloSemana(r.semana)}`,
    `Cuidados hospitalares: ${nivelTexto(r.cuidadosNivel)}. Estratégias de resposta: ${vazio(r.cuidadosEstrategias)}`,
    `Camas suplementares para internamento: ${nivelTexto(r.camasNivel)}. ${vazio(r.camasTexto)}`,
    `CSP: ${vazio(r.cspAfluencia)} Atividade programada: ${vazio(r.cspAtividade)}. Consulta em regime aberto (SAC): ${vazio(r.cspSac)}`,
    `USP: ${vazio(r.uspTexto)}`,
    `Atualização de casos sociais: ${dataPt(r.casosSociais)}`,
    `Projeto "Ligue Antes, Salve Vidas": ${r.ligueAntes}`,
    `Referenciações inter-ULS por constrangimentos nos serviços ou escalas: ${r.referenciacoes}`,
    `Camas livres em média / macas livres em média: ${camas}`,
    `Equipamento, incluindo cadeiras de rodas: ${r.equipamento}${r.equipamentoTexto.trim() ? `. ${vazio(r.equipamentoTexto)}` : ""}`,
    `Observações: ${vazio(r.observacoes)}`,
  ].join("\n");
}

const escapar = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const celula = (s: string) => escapar(vazio(s)).replace(/\n/g, "<br>");

/** Tabela HTML na ordem de colunas da DE-SNS, para colar no Word ou no Outlook. Todo o texto é escapado. */
export function tabelaHtml(registos: RegistoSemanal[]): string {
  const cabecalho = [
    "Semana",
    "Cuidados hospitalares (nível e estratégias de resposta)",
    "Camas suplementares para internamento",
    "CSP (afluência, atividade programada, SAC)",
    "USP (alertas, avisos e atividade)",
    "Atualização de casos sociais",
    "Projeto Ligue Antes, Salve Vidas",
    "Referenciações inter-ULS",
    "Camas livres / macas livres (média)",
    "Equipamento, incluindo cadeiras de rodas",
    "Observações",
  ];
  const linhas = registos.map((r) => {
    const camas = `${r.camasLivres == null ? "—" : numPt(r.camasLivres)}/${r.macasLivres == null ? "—" : numPt(r.macasLivres)}`;
    const cells = [
      rotuloSemana(r.semana),
      `Nível ${r.cuidadosNivel} (${NIVEIS_TEXTO[r.cuidadosNivel]}). ${r.cuidadosEstrategias}`,
      `Nível ${r.camasNivel} (${NIVEIS_TEXTO[r.camasNivel]}). ${r.camasTexto}`,
      `${r.cspAfluencia} ${r.cspAtividade}. SAC: ${r.cspSac}`,
      r.uspTexto,
      dataPt(r.casosSociais),
      r.ligueAntes,
      r.referenciacoes,
      camas,
      `${r.equipamento}${r.equipamentoTexto.trim() ? `. ${r.equipamentoTexto}` : ""}`,
      r.observacoes,
    ];
    return `<tr>${cells.map((c) => `<td>${celula(c)}</td>`).join("")}</tr>`;
  });
  return (
    `<table border="1" cellpadding="4" style="border-collapse:collapse">` +
    `<thead><tr>${cabecalho.map((c) => `<th>${escapar(c)}</th>`).join("")}</tr></thead>` +
    `<tbody>${linhas.join("")}</tbody></table>`
  );
}

export type ResumoNiveis = { semanas: number; porNivel: [number, number, number, number]; semanasAlto: string[] };

/** Semanas (pela segunda-feira) entre de e ate, com a contagem por nível hospitalar e as semanas em nível ≥ 2. */
export function resumoNiveis(registos: RegistoSemanal[], de: string, ate: string): ResumoNiveis {
  const sel = registos.filter((r) => r.semana >= de && r.semana <= ate).sort((a, b) => a.semana.localeCompare(b.semana));
  const porNivel: [number, number, number, number] = [0, 0, 0, 0];
  for (const r of sel) porNivel[r.cuidadosNivel]++;
  return { semanas: sel.length, porNivel, semanasAlto: sel.filter((r) => r.cuidadosNivel >= 2).map((r) => r.semana) };
}

/** Os dois períodos do plano (ano de 01/05 a 30/04), com o prazo de envio. */
export function periodosRelatorio(hojeIso: string) {
  const y = Number(hojeIso.slice(0, 4));
  const inicio = Number(hojeIso.slice(5, 7)) >= 5 ? y : y - 1;
  return [
    { nome: "Intercalar", de: `${inicio}-05-01`, ate: `${inicio}-09-30`, prazo: "31/10" },
    { nome: "Época completa", de: `${inicio}-05-01`, ate: `${inicio + 1}-04-30`, prazo: "31/05" },
  ];
}

/** Registo novo para a semana. Os campos de escolha começam na primeira opção; a equipa confirma antes de enviar. */
export function registoVazio(segunda: string): RegistoSemanal {
  return {
    semana: segunda,
    cuidadosNivel: 0,
    cuidadosEstrategias: "",
    camasNivel: 0,
    camasTexto: "",
    cspDoentesMedicoHora: null,
    cspAfluencia: "",
    cspAtividade: "",
    cspSac: "",
    uspTexto: "",
    casosSociais: quintaDe(segunda),
    ligueAntes: LIGUE_ANTES[0],
    referenciacoes: "Não",
    camasLivres: null,
    macasLivres: null,
    equipamento: EQUIPAMENTO[0],
    equipamentoTexto: "",
    observacoes: "",
  };
}

/* ------------------------------------------------------------------ */
/* Cópia de segurança (JSON): validação estrita de cada campo          */
/* ------------------------------------------------------------------ */

const FORMATO = "relatorios-semanais";
const nivelOk = (x: unknown): x is Nivel => x === 0 || x === 1 || x === 2 || x === 3;
const textoOk = (x: unknown): x is string => typeof x === "string" && x.length <= MAX_TEXTO;
const numOuNulo = (x: unknown): x is number | null => x === null || (typeof x === "number" && Number.isFinite(x) && x >= 0);

/** Devolve o registo se todos os campos tiverem o tipo e os valores esperados; senão null. */
export function normalizarRegisto(x: unknown): RegistoSemanal | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const ok =
    typeof o.semana === "string" && isoValido(o.semana) && segundaDe(o.semana) === o.semana &&
    nivelOk(o.cuidadosNivel) && textoOk(o.cuidadosEstrategias) &&
    nivelOk(o.camasNivel) && textoOk(o.camasTexto) &&
    numOuNulo(o.cspDoentesMedicoHora) && textoOk(o.cspAfluencia) && textoOk(o.cspAtividade) && textoOk(o.cspSac) &&
    textoOk(o.uspTexto) &&
    typeof o.casosSociais === "string" && isoValido(o.casosSociais) &&
    (LIGUE_ANTES as readonly unknown[]).includes(o.ligueAntes) &&
    (o.referenciacoes === "Sim" || o.referenciacoes === "Não") &&
    numOuNulo(o.camasLivres) && numOuNulo(o.macasLivres) &&
    (EQUIPAMENTO as readonly unknown[]).includes(o.equipamento) && textoOk(o.equipamentoTexto) &&
    textoOk(o.observacoes);
  return ok ? (o as unknown as RegistoSemanal) : null;
}

/** Lê uma cópia exportada. Devolve os registos ou null se o ficheiro não tiver a forma esperada. */
export function validarCopia(x: unknown): RegistoSemanal[] | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (o.formato !== FORMATO || o.versao !== 1 || !Array.isArray(o.registos) || o.registos.length > 1000) return null;
  const registos = o.registos.map(normalizarRegisto);
  if (registos.some((r) => r === null)) return null;
  return registos as RegistoSemanal[];
}

export function exportarCopia(registos: RegistoSemanal[], exportado: string): string {
  return JSON.stringify({ formato: FORMATO, versao: 1, exportado, registos }, null, 2);
}
