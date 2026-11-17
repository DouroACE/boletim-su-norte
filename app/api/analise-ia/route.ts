// POST /api/analise-ia — recebe só o resumo agregado (sem registos) e devolve a análise da IA.
// Dois pedidos: análise geral (corpo sem "tipo") e comentário de padrões (tipo: "padroes").
import { aiAnalise, aiPadroes } from "@/lib/ai";
import { validarResumoPadroes } from "@/lib/analise";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 100 * 1024;

const json = (body: { ok: boolean; text?: string[]; model?: string; error?: string }, status: number) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) return json({ ok: false, error: "Resumo demasiado grande (máx. 100 KB)." }, 400);

  const raw = await req.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BYTES) return json({ ok: false, error: "Resumo demasiado grande (máx. 100 KB)." }, 400);

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: "O pedido não é JSON válido." }, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ ok: false, error: "O corpo tem de ser um objeto JSON." }, 400);

  if ((body as { tipo?: unknown }).tipo === "padroes") {
    const erro = validarResumoPadroes(body);
    if (erro) return json({ ok: false, error: erro }, 400);
    const r = await aiPadroes(raw);
    if (!r) return json({ ok: false, error: "IA indisponível neste momento (sem chave configurada ou erro do fornecedor)." }, 503);
    return json({ ok: true, text: r.text, model: r.model }, 200);
  }

  const r = await aiAnalise(raw);
  if (!r) return json({ ok: false, error: "IA indisponível neste momento (sem chave configurada ou erro do fornecedor)." }, 503);
  return json({ ok: true, text: r.text, model: r.model }, 200);
}
