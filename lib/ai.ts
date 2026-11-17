// Resumo em linguagem natural gerado por um modelo open-source (Llama / Qwen), em planos gratuitos.
// Ordem: GROQ_API_KEY (Llama 3.3 70B) → HF_TOKEN (Qwen 2.5 72B, Hugging Face Inference) → texto automático.
// O modelo recebe APENAS os números já calculados e é instruído a não inventar valores.
import type { Flag, Level } from "./stats";
import type { Pattern } from "./local";
import type { Aviso } from "./sources";

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
  return `Indicadores de vigilância (índices de temperatura e óbitos regionais):\n${f}\n\nAvisos IPMA (distrito do Porto, que inclui Gondomar e Porto Ocidental):\n${a}\n\nPadrões nos dados locais do SU (época anterior):\n${p}\n\nRedige a síntese "Padrões e sinais da semana".`;
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
