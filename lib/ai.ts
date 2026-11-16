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
  return `Indicadores regionais (ARS Norte, SNS Transparência) e índices de temperatura:\n${f}\n\nAvisos IPMA (distritos do Norte):\n${a}\n\nPadrões nos dados locais do SU (época anterior):\n${p}\n\nRedige a síntese "Padrões e sinais da semana".`;
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
    .map((l) => l.replace(/^\s*[-•*]\s*/, "").trim())
    .filter((l) => l.length > 3);

const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function ruleBasedSummary(allFlags: Flag[], avisos: Aviso[]): string[] {
  const lines: string[] = [];
  const flags = allFlags.filter((f) => f.level !== "sem-dados");
  const alerts = flags.filter((f) => f.level === "alerta");
  const watch = flags.filter((f) => f.level === "atencao");
  if (alerts.length) lines.push(`Sinal de alerta em: ${alerts.map((f) => lc(f.label)).join(", ")} (acima de 2 desvios-padrão da linha de base).`);
  if (watch.length) lines.push(`Em atenção: ${watch.map((f) => lc(f.label)).join(", ")} (entre 1 e 2 desvios-padrão).`);
  if (!alerts.length && !watch.length) lines.push("Todos os indicadores regionais com histórico estão dentro do esperado para esta altura do ano.");
  for (const f of flags.filter((x) => x.changePct != null && Math.abs(x.changePct) >= 10)) {
    lines.push(`${f.label}: ${f.changePct! > 0 ? "subida" : "descida"} de ${Math.abs(f.changePct!).toFixed(0)}% face à semana anterior.`);
  }
  if (avisos.length) {
    const tipos = [...new Set(avisos.map((a) => a.tipo))].join(", ");
    lines.push(`O IPMA tem avisos ativos nos distritos do Norte (${tipos}).`);
  } else lines.push("Sem avisos meteorológicos relevantes do IPMA para os distritos do Norte.");
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
/* Flags de IA — o modelo propõe sinais; o código valida e fixa o nível  */
/* ------------------------------------------------------------------ */

/** Um indicador que a IA pode citar. O nível vem sempre das regras estatísticas. */
export type Indicator = { id: string; label: string; level: Level; detail: string };
export type AiFlag = { indicadores: string[]; level: Level | "info"; titulo: string; evidencia: string; investigar: string };
export type AiFlagsResult = { flags: AiFlag[]; model: string; generated: "ia" | "regras"; error?: string };

const FLAGS_SYSTEM = `És um epidemiologista de uma Unidade de Saúde Pública do Norte de Portugal a rever dados de vigilância.
Recebes indicadores, cada um com um id entre parênteses retos, o nível estatístico já calculado e os números.
Propõe até 8 "flags": sinais que merecem atenção, incluindo padrões que só se veem cruzando indicadores
(ex.: várias ULS vizinhas a subir ao mesmo tempo, óbitos a subir com o frio).
Regras: usa só os números fornecidos; não inventes valores nem causas; cada flag cita os ids exatos em que se baseia;
escreve em português europeu, frases curtas. Responde APENAS com JSON:
{"flags":[{"indicadores":["id1","id2"],"titulo":"...","evidencia":"números que sustentam a flag","investigar":"o que a equipa deve verificar"}]}`;

const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
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
  for (const f of list.slice(0, 8)) {
    const ids = Array.isArray(f?.indicadores) ? [...new Set<string>(f.indicadores.map((x: unknown) => String(x).replace(/[[\]\s]/g, "")))].filter((id) => byId.has(id)) : [];
    const titulo = clip(f?.titulo, 140);
    if (!ids.length || !titulo) continue;
    const worst = ids.map((id) => byId.get(id)!.level).reduce((w, l) => (RANK[l] > RANK[w] ? l : w), "sem-dados" as Level);
    out.push({ indicadores: ids, level: RANK[worst] >= 1 ? worst : "info", titulo, evidencia: clip(f?.evidencia, 600), investigar: clip(f?.investigar, 400) });
  }
  return out;
}

export function ruleFlags(indicators: Indicator[]): AiFlag[] {
  return indicators
    .filter((i) => i.level === "alerta" || i.level === "atencao")
    .sort((a, b) => RANK[b.level] - RANK[a.level])
    .map((i) => ({ indicadores: [i.id], level: i.level, titulo: i.label, evidencia: i.detail, investigar: "" }));
}

export async function aiFlags(indicators: Indicator[], avisos: Aviso[]): Promise<AiFlagsResult> {
  const lines = indicators.map((i) => `• [${i.id}] ${i.label} — nível ${i.level}. ${i.detail}`).join("\n");
  const a = avisos.length ? avisos.map((x) => `• ${x.distrito}: ${x.tipo} (${x.nivel})`).join("\n") : "• Sem avisos.";
  const prompt = `Indicadores:\n${lines}\n\nAvisos IPMA (distritos do Norte):\n${a}`;
  try {
    const r = await runLLM(prompt, FLAGS_SYSTEM, 1200);
    if (r) {
      const flags = parseAiFlags(r.text, indicators);
      if (flags.length) return { flags, model: r.model, generated: "ia" };
      return { flags: ruleFlags(indicators), model: "regras estatísticas", generated: "regras", error: "A resposta da IA não trouxe flags válidas." };
    }
  } catch (e) {
    console.error("[ai-flags] falhou, a usar regras:", (e as Error).message);
    return { flags: ruleFlags(indicators), model: "regras estatísticas", generated: "regras", error: (e as Error).message };
  }
  return { flags: ruleFlags(indicators), model: "regras estatísticas", generated: "regras" };
}
