// Atualização diária: chamado pelo cron da Vercel (vercel.json). Invalida o cache de todas
// as fontes e das páginas; a próxima visita volta a recolher tudo.
import { revalidatePath, revalidateTag } from "next/cache";
import { DATA_TAG } from "@/lib/sources";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ ok: false, error: "CRON_SECRET não configurado" }, { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ ok: false }, { status: 401 });
  revalidateTag(DATA_TAG);
  revalidatePath("/");
  revalidatePath("/flags-ia");
  return Response.json({ ok: true, revalidated: new Date().toISOString() });
}
