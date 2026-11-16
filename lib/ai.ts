// Resumo em linguagem natural gerado por um modelo open-source (Llama / Qwen), em planos gratuitos.
// Ordem: GROQ_API_KEY (Llama 3.3 70B) → HF_TOKEN (Qwen 2.5 72B, Hugging Face Inference) → texto automático.
// O modelo recebe APENAS os números já calculados e é instruído a não inventar valores.
import type { Flag } from "./stats";
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

async function chat(url: string, key: string, model: string, prompt: string) {
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 500,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt },
      ],
    }),
    next: { revalidate: 60 * 60 * 6 },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
  const j = await res.json();
  return String(j.choices?.[0]?.message?.content ?? "");
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

export async function aiSummary(flags: Flag[], avisos: Aviso[], patterns: Pattern[]): Promise<AiSummary> {
  const prompt = buildPrompt(flags, avisos, patterns);
  try {
    if (process.env.GROQ_API_KEY) {
      const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
      const t = await chat("https://api.groq.com/openai/v1/chat/completions", process.env.GROQ_API_KEY, model, prompt);
      const lines = toLines(t);
      if (lines.length) return { text: lines, model, generated: "ia" };
    }
    if (process.env.HF_TOKEN) {
      const model = process.env.HF_MODEL || "Qwen/Qwen2.5-72B-Instruct";
      const t = await chat("https://router.huggingface.co/v1/chat/completions", process.env.HF_TOKEN, model, prompt);
      const lines = toLines(t);
      if (lines.length) return { text: lines, model, generated: "ia" };
    }
  } catch (e) {
    console.error("[ai] falhou, a usar texto automático:", (e as Error).message);
  }
  return { text: ruleBasedSummary(flags, avisos), model: "regras estatísticas", generated: "regras" };
}
