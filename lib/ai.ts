// Resumo em linguagem natural gerado por um modelo open-source (Llama / Qwen), em planos gratuitos.
// Ordem: GROQ_API_KEY (Llama 3.3 70B) → HF_TOKEN (Qwen 2.5 72B, Hugging Face Inference) → texto automático.
// O modelo recebe APENAS os números já calculados e é instruído a não inventar valores.
import type { Flag, Level } from "./stats";
import type { Pattern } from "./local";
import type { Aviso } from "./sources";
import type { Indicator } from "./su-semana";

export type AiSummary = { text: string[]; model: string; generated: "ia" | "regras" };

const SYSTEM = `És um assistente de epidemiologia de uma Unidade de Saúde Pública do Norte de Portugal.
Escreves em português europeu, num tom técnico, sóbrio e claro, para um boletim de vigilância sazonal.
Regras: usa só os números fornecidos; não inventes valores, causas ou recomendações clínicas;
indica incerteza quando os dados são poucos; 4 a 6 frases curtas, cada uma numa linha começada por "- ".`;

function buildPrompt(flags: Flag[], avisos: Aviso[], patterns: Pattern[]) {
  const f = flags
    .filter((x) => x.level !== "sem-dados")
    .map((x) => `• ${x.label} [${x.level}]: ${x.note}`)
    .join("\n");
  const a = avisos.length
    ? avisos.map((x) => `• ${x.distrito}: ${x.tipo} (${x.nivel}) ${x.inicio.slice(0, 16)}→${x.fim.slice(0, 16)}`).join("\n")
    : "• Sem avisos amarelos, laranja ou vermelhos.";
  const p = patterns.slice(0, 5).map((x) => `• ${x.title}. ${x.detail}`).join("\n");
  const su = p ? `\n\nPadrões nos dados do SU:\n${p}` : "";
  return `Indicadores de vigilância (índices de temperatura e óbitos regionais):\n${f}\n\nAvisos IPMA (distrito do Porto, que inclui Gondomar e Porto Ocidental):\n${a}${su}\n\nRedige a síntese "Padrões e sinais da semana".`;
}

async function chat(url: string, key: string, model: string, prompt: string, system = SYSTEM, maxTokens = 500) {
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      // Modelos de raciocínio (gpt-oss) gastam max_tokens a "pensar": raciocínio curto e margem extra.
      max_tokens: maxTokens * 3,
      ...(/gpt-oss/.test(model) ? { reasoning_effort: "low" } : {}),
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    }),
    next: { revalidate: 60 * 60 * 6 },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
  const j = await res.json();
  const choice = j.choices?.[0];
  const text = String(choice?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  if (!text) throw new Error(`resposta vazia do modelo (finish_reason: ${choice?.finish_reason ?? "?"})`);
  return text;
}

const toLines = (s: string) =>
  s
    .split("\n")
    // O texto é mostrado como texto simples: tirar a marcação de negrito do markdown.
    .map((l) => l.replace(/^\s*[-•*]\s*/, "").replace(/\*\*(.+?)\*\*|__(.+?)__/g, "$1$2").trim())
    .filter((l) => l.length > 3);

const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function ruleBasedSummary(allFlags: Flag[], avisos: Aviso[]): string[] {
  const lines: string[] = [];
  const flags = allFlags.filter((f) => f.level !== "sem-dados");
  const alerts = flags.filter((f) => f.level === "alerta");
  const watch = flags.filter((f) => f.level === "atencao");
  if (alerts.length) lines.push(`Sinal de alerta em: ${alerts.map((f) => lc(f.label)).join(", ")} (acima de 2 desvios-padrão da linha de base).`);
  if (watch.length) lines.push(`Em atenção: ${watch.map((f) => lc(f.label)).join(", ")} (entre 1 e 2 desvios-padrão).`);
  if (!alerts.length && !watch.length) lines.push("Todos os indicadores com histórico estão dentro do esperado para esta altura do ano.");
  for (const f of flags.filter((x) => x.changePct != null && Math.abs(x.changePct) >= 10)) {
    lines.push(`${f.label}: ${f.changePct! > 0 ? "subida" : "descida"} de ${Math.abs(f.changePct!).toFixed(0)}% face à semana anterior.`);
  }
  if (avisos.length) {
    const tipos = [...new Set(avisos.map((a) => a.tipo))].join(", ");
    lines.push(`O IPMA tem avisos ativos no distrito do Porto (${tipos}).`);
  } else lines.push("Sem avisos meteorológicos relevantes do IPMA para o distrito do Porto.");
  return lines.slice(0, 6);
}

/** Corre o prompt no primeiro fornecedor configurado (Groq → Hugging Face). Devolve null sem chave. */
async function runLLM(prompt: string, system?: string, maxTokens?: number): Promise<{ text: string; model: string } | null> {
  if (process.env.GROQ_API_KEY) {
    const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
    return { text: await chat("https://api.groq.com/openai/v1/chat/completions", process.env.GROQ_API_KEY, model, prompt, system, maxTokens), model };
  }
  if (process.env.HF_TOKEN) {
    const model = process.env.HF_MODEL || "Qwen/Qwen2.5-72B-Instruct";
    return { text: await chat("https://router.huggingface.co/v1/chat/completions", process.env.HF_TOKEN, model, prompt, system, maxTokens), model };
  }
  return null;
}

export async function aiSummary(flags: Flag[], avisos: Aviso[], patterns: Pattern[]): Promise<AiSummary> {
  const prompt = buildPrompt(flags, avisos, patterns);
  try {
    const r = await runLLM(prompt);
    const lines = r ? toLines(r.text) : [];
    if (r && lines.length) return { text: lines, model: r.model, generated: "ia" };
  } catch (e) {
    console.error("[ai] falhou, a usar texto automático:", (e as Error).message);
  }
  return { text: ruleBasedSummary(flags, avisos), model: "regras estatísticas", generated: "regras" };
}

/* ------------------------------------------------------------------ */
/* Flags de IA da urgência — o modelo propõe sinais; o código valida e fixa o nível */
/* ------------------------------------------------------------------ */

export type AiFlag = { indicadores: string[]; level: Level | "info"; titulo: string; evidencia: string; investigar: string };
export type AiFlagsResult = { flags: AiFlag[]; sintese: string[]; model: string; generated: "ia" | "regras"; error?: string };

const FLAGS_SYSTEM = `És um epidemiologista de uma Unidade de Saúde Pública do Norte de Portugal a rever a urgência (SU) da ULS Santo António.
Recebes indicadores da última semana, cada um com um id entre parênteses retos, comparados com as 8 semanas anteriores
(nível estatístico já calculado, média, desvio-padrão e z).
Propõe até 6 "flags": sinais que merecem atenção, incluindo padrões que só se veem cruzando indicadores
(ex.: mais infeções respiratórias com mais idosos e mais internamento; frio seguido de mais procura).
Regras: usa só os números fornecidos; não inventes valores nem causas; cada flag cita os ids exatos em que se baseia;
escreve em português europeu, frases curtas, sem markdown. Junta uma síntese da semana em 3 a 5 frases para o boletim.
Responde APENAS com JSON:
{"sintese":["frase 1","frase 2"],"flags":[{"indicadores":["id1","id2"],"titulo":"...","evidencia":"números que sustentam a flag","investigar":"o que a equipa deve verificar"}]}`;

const clip = (v: unknown, n: number) => String(v ?? "").replace(/\*\*/g, "").trim().slice(0, n);
const RANK: Record<Level, number> = { "sem-dados": -1, normal: 0, atencao: 1, alerta: 2 };

/** Valida a resposta do modelo: só aceita flags que citam ids conhecidos; o nível é o pior das regras citadas. */
export function parseAiFlags(text: string, indicators: Indicator[]): AiFlag[] {
  const byId = new Map(indicators.map((i) => [i.id, i]));
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  const list = (raw as { flags?: unknown }).flags;
  if (!Array.isArray(list)) return [];
  const out: AiFlag[] = [];
  for (const f of list.slice(0, 6)) {
    const ids = Array.isArray(f?.indicadores) ? [...new Set<string>(f.indicadores.map((x: unknown) => String(x).replace(/[[\]\s]/g, "")))].filter((id) => byId.has(id)) : [];
    const titulo = clip(f?.titulo, 140);
    if (!ids.length || !titulo) continue;
    const worst = ids.map((id) => byId.get(id)!.level).reduce((w, l) => (RANK[l] > RANK[w] ? l : w), "sem-dados" as Level);
    out.push({ indicadores: ids, level: RANK[worst] >= 1 ? worst : "info", titulo, evidencia: clip(f?.evidencia, 600), investigar: clip(f?.investigar, 400) });
  }
  return out;
}

/** Síntese da resposta do modelo (lista de frases, sem markdown), ou []. */
export function parseSintese(text: string): string[] {
  try {
    const raw = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as { sintese?: unknown };
    return Array.isArray(raw.sintese) ? raw.sintese.map((x) => clip(x, 400)).filter((x) => x.length > 3).slice(0, 6) : [];
  } catch {
    return [];
  }
}

/** Sem IA: síntese a partir dos indicadores (os que estão em Atenção ou Alerta, ou a nota de semana estável). */
function sinteseRegras(indicators: Indicator[]): string[] {
  const sinais = indicators.filter((i) => i.level === "alerta" || i.level === "atencao");
  return [sinais.length ? `${sinais.length} indicador(es) do SU acima do esperado face às 8 semanas anteriores: ${sinais.map((i) => i.label.toLowerCase()).join("; ")}.` : "Nenhum indicador do SU acima do esperado face às semanas anteriores."];
}

/** Sem IA: uma flag por indicador em Atenção ou Alerta, do pior para o melhor. */
export function ruleFlags(indicators: Indicator[]): AiFlag[] {
  return indicators
    .filter((i) => i.level === "alerta" || i.level === "atencao")
    .sort((a, b) => RANK[b.level] - RANK[a.level])
    .map((i) => ({ indicadores: [i.id], level: i.level, titulo: i.label, evidencia: i.detail, investigar: "" }));
}

/** Flags da semana do SU: a IA propõe a partir dos indicadores agregados; sem chave ou resposta inválida, ficam as regras. */
export async function aiFlagsSU(indicators: Indicator[], semana: string): Promise<AiFlagsResult> {
  const lines = indicators.map((i) => `• [${i.id}] ${i.label} — nível ${i.level}. ${i.detail}`).join("\n");
  try {
    const r = await runLLM(`Semana do SU que começa a ${semana}.\n\nIndicadores:\n${lines}`, FLAGS_SYSTEM, 1200);
    if (r) {
      const flags = parseAiFlags(r.text, indicators);
      const sintese = parseSintese(r.text);
      if (flags.length || sintese.length) return { flags, sintese: sintese.length ? sintese : sinteseRegras(indicators), model: r.model, generated: "ia" };
      return { flags: ruleFlags(indicators), sintese: sinteseRegras(indicators), model: "regras estatísticas", generated: "regras", error: "A resposta da IA não trouxe flags válidas." };
    }
  } catch (e) {
    console.error("[ai-flags-su] falhou, a usar regras:", (e as Error).message);
    return { flags: ruleFlags(indicators), sintese: sinteseRegras(indicators), model: "regras estatísticas", generated: "regras", error: (e as Error).message };
  }
  return { flags: ruleFlags(indicators), sintese: sinteseRegras(indicators), model: "regras estatísticas", generated: "regras" };
}

/* ------------------------------------------------------------------ */
/* Análise de dados carregados — só recebe o resumo agregado           */
/* ------------------------------------------------------------------ */

const ANALISE_SYSTEM = `És um estatístico a apoiar a análise de dados de uma Unidade de Saúde Pública do Norte de Portugal.
Recebes APENAS um resumo agregado em JSON: nomes de colunas, tipos, contagens, mín/máx/média, séries semanais e resultados de correlação. Não recebes registos individuais.
Escreves em português europeu, tom técnico e sóbrio. Descreves relações entre variáveis, sazonalidade, desfasamentos (lags) e anomalias, usando só os números fornecidos.
Indicas sempre a incerteza: amostra pequena, correlação não implica causalidade, possíveis variáveis de confusão.
Não inventes valores, causas nem recomendações clínicas. Responde com 5 a 8 linhas curtas, cada uma começada por "- ".`;

/** Análise em texto de um resumo agregado (JSON). Devolve null sem chave ou em caso de falha do fornecedor. */
export async function aiAnalise(summaryJson: string): Promise<{ text: string[]; model: string } | null> {
  const prompt = `Resumo agregado dos dados carregados (JSON):\n${summaryJson}\n\nRedige a análise.`;
  try {
    const r = await runLLM(prompt, ANALISE_SYSTEM, 900);
    if (!r) return null;
    const text = toLines(r.text).slice(0, 8);
    return text.length ? { text, model: r.model } : null;
  } catch (e) {
    console.error("[ai-analise] falhou:", (e as Error).message);
    return null;
  }
}

const PADROES_SYSTEM = `És um estatístico a apoiar a vigilância de saúde sazonal numa Unidade de Saúde Pública do Norte de Portugal.
Recebes APENAS um resumo agregado em JSON por série (n, média, mínimo e máximo com datas, sinal da tendência, 3 picos, variação face ao período anterior) e a matriz de correlação de Pearson entre séries. Não recebes registos individuais.
Escreves em português europeu, tom técnico e sóbrio, em tópicos curtos começados por "- ".
Cobre: tendências, picos e sazonalidade; relações entre variáveis, com cautela (correlação não implica causalidade e pode haver variáveis de confusão);
possíveis causas no contexto de saúde sazonal (frio, calor, vírus respiratórios, procura do SU), apresentadas como hipóteses a verificar;
e o que monitorizar a seguir.
Usa só os números fornecidos; não inventes valores, datas nem causas. Se a amostra for pequena, diz que a leitura é incerta. Não dês recomendações clínicas. Responde com 5 a 8 tópicos.`;

/** Comentário em texto sobre padrões de séries escolhidas (resumo agregado, nunca registos). Null sem chave ou em falha. */
export async function aiPadroes(resumoJson: string): Promise<{ text: string[]; model: string } | null> {
  const prompt = `Resumo agregado das séries escolhidas (JSON):\n${resumoJson}\n\nRedige o comentário sobre os padrões.`;
  try {
    const r = await runLLM(prompt, PADROES_SYSTEM, 900);
    if (!r) return null;
    const text = toLines(r.text).slice(0, 8);
    return text.length ? { text, model: r.model } : null;
  } catch (e) {
    console.error("[ai-padroes] falhou:", (e as Error).message);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Comunicados: população, interno e estratégias de controlo           */
/* ------------------------------------------------------------------ */

export type Publico = "populacao" | "interno" | "estrategias";

const COMUNICADO_BASE = `Trabalhas na Unidade de Saúde Pública da ULS Santo António (Gondomar e Porto Ocidental), na Equipa Local de Saúde Sazonal.
Recebes um contexto com flags, indicadores e notas já validadas pela equipa (só números agregados).
Regras: usa só a informação do contexto; não inventes números, datas, serviços nem contactos além da Linha SNS 24 (808 24 24 24) e do 112;
não anuncies medidas, reforços ou decisões que não estejam no contexto (se fizer falta, escreve [medida a definir pela equipa]);
português europeu, sem markdown, sem asteriscos; parágrafos curtos, um por linha.`;

const COMUNICADO_SYSTEM: Record<Publico, string> = {
  populacao: `${COMUNICADO_BASE}
Escreve um comunicado à população: título numa linha, depois 3 a 5 parágrafos em linguagem simples (nível de leitura básico),
o que está a acontecer, quem está mais em risco, o que fazer (medidas de proteção). Antes de ir à urgência, ligar para a Linha SNS 24 (808 24 24 24);
o 112 só em emergência (ex.: dificuldade respiratória grave, dor no peito, perda de consciência). Nunca mandes ir diretamente à urgência. Tom calmo e claro.`,
  interno: `${COMUNICADO_BASE}
Escreve um comunicado interno para os profissionais e parceiros da ULS (hospital, CSP, USP, autarquias): assunto numa linha,
depois a situação com os números do contexto, o nível de risco, o que se pede a cada equipa e o próximo ponto de situação. Tom técnico e direto.`,
  estrategias: `${COMUNICADO_BASE}
Propõe estratégias de controlo e de execução para reduzir danos, em linhas começadas por um verbo: para cada uma,
o objetivo, quem executa (hospital, CSP, USP, comunicação, parceiros), o prazo (imediato, esta semana, próximas semanas) e o indicador do contexto que a justifica.
No fim, uma linha com o que monitorizar na semana seguinte. Máximo 8 estratégias.`,
};

/** Rascunho de comunicado a partir de um contexto agregado (texto). A equipa revê sempre antes de usar. */
export async function aiComunicado(publico: Publico, contexto: string): Promise<{ text: string[]; model: string } | null> {
  try {
    const r = await runLLM(`Contexto:\n${contexto}\n\nEscreve o texto pedido.`, COMUNICADO_SYSTEM[publico], 1200);
    if (!r) return null;
    const text = toLines(r.text).slice(0, 20);
    return text.length ? { text, model: r.model } : null;
  } catch (e) {
    console.error("[ai-comunicado] falhou:", (e as Error).message);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Validação dos pedidos do browser (só agregados, tamanhos limitados) */
/* ------------------------------------------------------------------ */

const NIVEIS: Level[] = ["normal", "atencao", "alerta", "sem-dados"];

/** Pedido de flags do SU: semana AAAA-MM-DD e até 12 indicadores {id su:…, label, level, detail}. Devolve erro ou null. */
export function validarPedidoFlags(b: unknown): string | null {
  const o = b as { semana?: unknown; indicadores?: unknown };
  if (typeof o.semana !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(o.semana)) return "Semana inválida.";
  if (!Array.isArray(o.indicadores) || !o.indicadores.length || o.indicadores.length > 12) return "Indicadores em falta ou demasiados.";
  const ok = o.indicadores.every((i: { id?: unknown; label?: unknown; level?: unknown; detail?: unknown }) =>
    typeof i?.id === "string" && /^su:[a-z0-9]+$/.test(i.id) && typeof i.label === "string" && i.label.length <= 120 &&
    typeof i.detail === "string" && i.detail.length <= 400 && NIVEIS.includes(i.level as Level));
  return ok ? null : "Indicador com formato inválido.";
}

/** Pedido de comunicado: público conhecido e contexto em texto (até 8000 caracteres). Devolve erro ou null. */
export function validarPedidoComunicado(b: unknown): string | null {
  const o = b as { publico?: unknown; contexto?: unknown };
  if (o.publico !== "populacao" && o.publico !== "interno" && o.publico !== "estrategias") return "Tipo de comunicado inválido.";
  if (typeof o.contexto !== "string" || o.contexto.trim().length < 20 || o.contexto.length > 8000) return "Contexto em falta ou demasiado longo.";
  return null;
}
