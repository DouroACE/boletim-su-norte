// GET /api/exportar?v=episodios&v=obitos&de=AAAA-MM-DD&ate=AAAA-MM-DD → ficheiro .xlsx
import writeExcelFile from "write-excel-file/node";
import { fetchNorte, fetchFriesaPorto, fetchIcaro, fetchObitos, fetchMeteoPorto, fetchUlsNorte, type Point, type UlsRow } from "@/lib/sources";
import { parseRange } from "@/lib/flags";
import { addDays } from "@/lib/stats";
import { buildSheets, parseVars } from "@/lib/export";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REGIAO = process.env.REGIAO_ARS || "ARS Norte";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const today = new Date().toISOString().slice(0, 10);
  const vars = parseVars(url.searchParams.getAll("v"));
  if (!vars.length) {
    // Volta ao formulário (mesmo período) com a mensagem de erro junto ao botão.
    const back = new URL("/exportar", url);
    for (const k of ["de", "ate"]) if (url.searchParams.get(k)) back.searchParams.set(k, url.searchParams.get(k)!);
    back.searchParams.set("erro", "variaveis");
    return Response.redirect(back, 303);
  }
  const range = parseRange({ de: url.searchParams.get("de") ?? undefined, ate: url.searchParams.get("ate") ?? undefined }, today) ?? { from: addDays(today, -89), to: today };
  const want = new Set(vars.map((v) => v.id));
  const has = (...ids: string[]) => ids.some((i) => want.has(i));
  const since = addDays(range.from, -1);

  const erros: Record<string, string> = {};
  const get = async <T,>(ids: string[], fn: () => Promise<T>): Promise<T | null> => {
    if (!has(...ids)) return null;
    try {
      return await fn();
    } catch (e) {
      for (const i of ids) erros[i] = (e as Error).message;
      return null;
    }
  };
  const [norte, friesa, icaro, obitos, meteo, uls] = await Promise.all([
    get(["episodios", "resp", "triagem", "naoUrgentes", "internamento"], () => fetchNorte(since, REGIAO)),
    get(["friesa", "friesa65"], () => fetchFriesaPorto(since)),
    get(["icaro"], () => fetchIcaro(since)),
    get(["obitos"], () => fetchObitos(since)),
    get(["tMed", "tMin", "tMax"], () => fetchMeteoPorto()),
    get(["ulsObitos", "ulsUrg"], () => fetchUlsNorte(today, range.to)),
  ]);
  const met = (k: "tMed" | "tMin" | "tMax"): Point[] => (meteo ?? []).filter((d) => d.date <= today).map((d) => ({ date: d.date, value: d[k] }));
  const daily: Partial<Record<string, Point[]>> = {
    episodios: norte?.episodios, resp: norte?.pctRespiratoria, triagem: norte?.tempoTriagem, naoUrgentes: norte?.naoUrgentes, internamento: norte?.pctInternamento,
    obitos: obitos ?? undefined, friesa: friesa?.geral, friesa65: friesa?.mais65, icaro: icaro ?? undefined,
    tMed: met("tMed"), tMin: met("tMin"), tMax: met("tMax"),
  };
  const geradoEm = new Date().toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" });
  const sheets = buildSheets(vars, range, daily, (uls ?? []) as UlsRow[], erros, geradoEm);
  const buffer = await writeExcelFile(sheets as Parameters<typeof writeExcelFile>[0]).toBuffer();
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="boletim-su-norte_${range.from}_${range.to}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
