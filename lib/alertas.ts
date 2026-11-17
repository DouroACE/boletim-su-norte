// Textos do procedimento de alertas (Verão 2025), em português europeu.
// Sem importações de valor: o selfcheck corre em Node sem transpilação.

export type Perigo = "calor" | "frio" | "tempestade" | "incendio" | "ar" | "geral";
export type Nivel = "amarelo" | "laranja" | "vermelho" | "significativo" | "maximo";
/** "icaro": boletim do INSA; "aviso": aviso do IPMA (ou qualidade do ar, APA). */
export type Fonte = "icaro" | "aviso";

export interface AlertaInput {
  perigo: Perigo;
  nivel: Nivel | null;
  inicio: string; // AAAA-MM-DD, vazio se não indicado
  fim: string;
  fonte: Fonte;
  publico?: string;
}

export interface Alerta {
  assunto: string;
  email: string;
  redes: string;
  interno: string;
}

const EMERGENCIA = "Em caso de emergência, e se apresentar sinais de alerta, contacte o SNS 24 (808 24 24 24) ou o 112.";
const ASSINATURA = "Equipa de Saúde Sazonal — USP ULS Santo António";

/** Medidas por perigo (DGS, procedimento de alertas). A emergência é sempre a última. */
const MEDIDAS: Record<Perigo, string[]> = {
  calor: [
    "Beba água com regularidade, mesmo sem sede, e evite bebidas alcoólicas.",
    "Procure ambientes frescos ou climatizados, com sombra e circulação de ar, pelo menos 2 a 3 horas por dia.",
    "Evite a exposição direta ao sol, sobretudo entre as 11h00 e as 17h00.",
    "Use protetor solar com fator igual ou superior a 30 e renove a aplicação de 2 em 2 horas e após banhos.",
    "Use roupa clara, leve e larga, chapéu e óculos de sol com proteção ultravioleta.",
    "Evite atividades físicas intensas ao ar livre.",
    "Não deixe pessoas nem animais dentro de veículos estacionados ao sol.",
    "Dê atenção especial a crianças, pessoas idosas, doentes crónicos, grávidas e trabalhadores ao ar livre.",
    "Contacte e acompanhe os idosos e outras pessoas que vivam isoladas.",
    "Crianças com menos de 6 meses não devem ser expostas ao sol, direta ou indiretamente.",
  ],
  frio: [
    "Vista-se em camadas, com roupa quente e impermeável, e mantenha a cabeça, as mãos e os pés aquecidos.",
    "Mantenha a casa aquecida de forma segura e ventile os espaços sempre que usar aquecimento.",
    "Não use braseiras, fogareiros nem fornos para aquecer a casa: o monóxido de carbono pode ser mortal.",
    "Alimente-se bem e beba líquidos quentes; evite o álcool.",
    "Tenha em casa os medicamentos habituais, com prazos de validade em dia.",
    "Contacte e acompanhe os idosos e as pessoas que vivam isoladas ou com doenças crónicas.",
    "Tenha cuidado ao sair com gelo ou chuva, para evitar quedas.",
    "Confirme com o seu médico ou enfermeiro a vacinação recomendada pela DGS, por exemplo contra a gripe e a COVID-19.",
  ],
  tempestade: [
    "Evite deslocações desnecessárias e, se tiver de se deslocar, faça-o com cuidado e com tempo.",
    "Não se abrigue debaixo de árvores, postes ou estruturas instáveis, e afaste-se de janelas.",
    "Recolha ou fixe objetos soltos no exterior, como vasos, toldos e andaimes.",
    "Não atravesse zonas inundadas nem conduza com água a cobrir a estrada.",
    "Com agitação marítima ou vento forte, evite as zonas costeiras e as proximidades do mar.",
    "Durante trovoadas, evite usar aparelhos elétricos e não toque em cabos caídos.",
    "Mantenha-se informado através do IPMA e das autoridades de proteção civil.",
    "Contacte e acompanhe os idosos e as pessoas que vivam isoladas.",
  ],
  incendio: [
    "Cumpra as restrições em vigor para queimas, queimadas, fogueiras, grelhadores e uso de maquinaria no espaço rural (consulte fogos.icnf.pt).",
    "Não faça fogo no espaço rural e evite atividades que possam provocar faíscas.",
    "Não atire pontas de cigarro para o chão e não deixe fogo sem vigilância.",
    "Se detetar um incêndio, ligue de imediato para o 112.",
  ],
  ar: [
    "Evite atividade física intensa ao ar livre, sobretudo quando a qualidade do ar está má.",
    "Mantenha as janelas fechadas em dias de má qualidade do ar e ventile a casa nas horas de melhor qualidade.",
    "Pessoas com asma, DPOC ou doença cardíaca devem manter a medicação habitual e seguir o plano definido com o médico.",
    "Consulte a qualidade do ar diária no portal QualAr da Agência Portuguesa do Ambiente (APA).",
  ],
  geral: [
    "Mantenha-se informado através do IPMA e das autoridades locais.",
    "Contacte e acompanhe os idosos e as pessoas que vivam isoladas.",
  ],
};

/** Frase curta para as redes sociais. */
const CHAMADA: Record<Perigo, string> = {
  calor: "Beba água, procure locais frescos e evite o sol entre as 11h00 e as 17h00.",
  frio: "Vista-se em camadas e nunca use braseiras ou fogareiros para aquecer a casa.",
  tempestade: "Evite deslocações desnecessárias e afaste-se de árvores e zonas inundadas.",
  incendio: "Não faça fogo no espaço rural e cumpra as restrições em vigor (fogos.icnf.pt).",
  ar: "Evite esforço físico ao ar livre e mantenha as janelas fechadas em dias de má qualidade do ar.",
  geral: "Mantenha-se informado e acompanhe os seus vizinhos.",
};

const TAGS: Record<Perigo, string[]> = {
  calor: ["#Verão", "#Calor", "#IPMA"],
  frio: ["#Frio", "#IPMA"],
  tempestade: ["#Chuva", "#Vento", "#IPMA"],
  incendio: ["#perigomaximo", "#incêndiosrurais"],
  ar: ["#QualidadeDoAr"],
  geral: ["#IPMA"],
};
const TAGS_BASE = ["#SaúdeSazonal", "#ULSSA", "#USPGondomar", "#Gondomar"];

export const TIPO_AVISO: Record<Perigo, string> = {
  calor: "tempo quente",
  frio: "tempo frio",
  tempestade: "precipitação, vento ou tempestade",
  incendio: "perigo máximo de incêndio rural",
  ar: "má qualidade do ar",
  geral: "condições meteorológicas adversas",
};

const ETIQUETA_NIVEL: Record<Nivel, string> = {
  amarelo: "Amarelo",
  laranja: "Laranja",
  vermelho: "Vermelho",
  significativo: "Impacto Significativo",
  maximo: "Máximo Perigo",
};

const PUBLICO: Record<Perigo, string> = {
  calor: "População geral, em especial crianças, pessoas idosas, doentes crónicos, grávidas e trabalhadores ao ar livre",
  frio: "População geral, em especial pessoas idosas, doentes crónicos e pessoas sem-abrigo",
  tempestade: "População geral, em especial quem se desloca na via pública e nas zonas costeiras",
  incendio: "População do espaço rural e proprietários de terrenos",
  ar: "População geral, em especial pessoas com asma, DPOC ou doença cardiovascular",
  geral: "População geral e grupos vulneráveis",
};

const NIVEL_AVISO: Record<string, Nivel> = { yellow: "amarelo", orange: "laranja", red: "vermelho" };

/** Medidas recomendadas para o perigo, com a linha de emergência no fim. */
export function recomendacoes(perigo: Perigo): string[] {
  return [...MEDIDAS[perigo], EMERGENCIA];
}

/** Mapeia o tipo de aviso do IPMA (ex.: "Tempo quente", "Agitação marítima") para um perigo. */
export function perigoDeAviso(tipo: string): Perigo {
  const t = tipo.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (t.includes("quente") || t.includes("calor")) return "calor";
  if (t.includes("frio") || t.includes("neve")) return "frio";
  if (t.includes("incend")) return "incendio";
  if (/precipit|vento|trovoada|tempest|agitacao|chuva/.test(t)) return "tempestade";
  return "geral";
}

/** Perigos a recomendar: os dos avisos do IPMA em vigor mais o típico da época (frio nov–mar, calor jun–set), sem repetir; "geral" só se não houver outro. */
export function perigosAtivos(avisos: { tipo: string }[], mes: number): Perigo[] {
  const sazonal: Perigo[] = [11, 12, 1, 2, 3].includes(mes) ? ["frio"] : [6, 7, 8, 9].includes(mes) ? ["calor"] : [];
  const todos = [...new Set([...avisos.map((a) => perigoDeAviso(a.tipo)), ...sazonal])];
  return todos.length > 1 ? todos.filter((p) => p !== "geral") : todos;
}

/** Converte o nível do IPMA (yellow/orange/red) no nível usado nos textos. */
export function nivelDeAviso(id: string): Nivel | null {
  return NIVEL_AVISO[id] ?? null;
}

const dataPt = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join("/") : "a indicar");

function periodo(i: AlertaInput): string {
  const a = dataPt(i.inicio);
  const b = dataPt(i.fim);
  return a === b ? `dia ${a}` : `entre os dias ${a} e ${b}`;
}

function publicoDe(i: AlertaInput): string {
  if (i.publico) return i.publico;
  return i.fonte === "icaro" ? "População geral e população com 75 ou mais anos" : PUBLICO[i.perigo];
}

function origemDe(i: AlertaInput): string {
  if (i.fonte === "icaro") return "Instituto Nacional de Saúde Doutor Ricardo Jorge (INSA), Boletim ÍCARO";
  if (i.perigo === "ar") return "Agência Portuguesa do Ambiente (APA), índice QualAr";
  return "Instituto Português do Mar e da Atmosfera (IPMA)";
}

function assuntoDe(i: AlertaInput): string {
  if (i.fonte === "icaro") return "Saúde Sazonal: Impacto Significativo na Saúde";
  if (i.perigo === "incendio") return "Saúde Sazonal: Aviso de Máximo Perigo de Incêndio Rural";
  const nivel = i.nivel ? ETIQUETA_NIVEL[i.nivel].trim() : "";
  return `Saúde Sazonal: Aviso ${nivel ? `${nivel} ` : ""}de ${TIPO_AVISO[i.perigo]} — Porto e Gondomar, ${periodo(i)}`.replace(/\s+/g, " ").trim();
}

function aberturaDe(i: AlertaInput): string {
  if (i.fonte === "icaro") return "O Instituto Nacional de Saúde Doutor Ricardo Jorge (INSA) prevê um impacto significativo da temperatura na mortalidade da população.";
  if (i.perigo === "incendio") return "O Instituto Português do Mar e da Atmosfera (IPMA) mantém o aviso de máximo perigo de incêndio rural em vários concelhos do país, nomeadamente em Gondomar.";
  if (i.perigo === "ar") return "A Agência Portuguesa do Ambiente (APA) indica má qualidade do ar previsível para o concelho de Gondomar.";
  const aviso = i.nivel ? `aviso ${i.nivel}` : "aviso";
  return `O IPMA emitiu ${aviso} de ${TIPO_AVISO[i.perigo]} para o distrito do Porto, que inclui o concelho de Gondomar.`;
}

/** Parágrafos comuns ao e-mail externo e ao interno (sem saudação nem assinatura). */
function miolo(i: AlertaInput): string[] {
  return [
    aberturaDe(i),
    `Origem e período: ${origemDe(i)}; ${periodo(i)}.`,
    `População-alvo: ${publicoDe(i)}.`,
    "Face a esta situação, recomenda-se à população, e em especial aos grupos vulneráveis, as seguintes medidas:\n" +
      recomendacoes(i.perigo).map((r, n) => `${n + 1}. ${r}`).join("\n"),
    "Em anexo segue a infografia publicada nas redes sociais da Unidade de Saúde Pública (polo de Gondomar), que poderá ser partilhada.",
  ];
}

function redesDe(i: AlertaInput, assunto: string): string {
  const tagNivel = i.fonte === "aviso" && i.nivel ? [`#Aviso${ETIQUETA_NIVEL[i.nivel].split(" ")[0]}`] : [];
  return [
    `${assunto}. Período: ${periodo(i)}.`,
    CHAMADA[i.perigo],
    "Em emergência, SNS 24 (808 24 24 24) ou 112.",
    [...TAGS[i.perigo], ...tagNivel, ...TAGS_BASE].join(" "),
  ].join(" ");
}

/** Gera assunto, e-mail externo (BCC, sem destinatários), texto para redes sociais e reencaminhamento interno. */
export function gerarAlerta(i: AlertaInput): Alerta {
  const assunto = assuntoDe(i);
  const email = ["Exmos. Senhores,", ...miolo(i), "Com os melhores cumprimentos,", ASSINATURA].join("\n\n");
  const interno = [
    "Caros colegas,",
    "Reencaminha-se o alerta abaixo, com o boletim ou aviso de origem em anexo.",
    ...miolo(i),
    "Com os melhores cumprimentos,",
    ASSINATURA,
  ].join("\n\n");
  return { assunto, email, redes: redesDe(i, assunto), interno };
}
