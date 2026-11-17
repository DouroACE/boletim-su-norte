// GET /api/modelo-mensal → ficheiro .xlsx em branco (cabeçalhos das 5 folhas + "Instruções").
import writeExcelFile from "write-excel-file/node";
import { FOLHAS_MENSAIS } from "@/lib/modelos";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Cell = { value: string | number; type?: typeof String; fontWeight?: "bold" } | null;
type Sheet = { sheet: string; data: Cell[][]; columns: { width: number }[]; stickyRowsCount: number };

const CID: [string, string][] = [
  ["A09", "gastroenterite infeciosa"], ["E86.0", "desidratação"], ["I20.0", "angina instável"], ["I21", "enfarte agudo do miocárdio"],
  ["I24.9", "doença isquémica aguda NE"], ["J00-J06", "IRA superiores"], ["J09-J11", "gripe"], ["J20-J22", "IRA inferiores"],
  ["J44", "DPOC"], ["J45", "asma"], ["R11", "náuseas e vómitos"], ["R19.7", "diarreia NE"], ["T58", "monóxido de carbono"], ["T68", "hipotermia"],
];
const ICPC: [string, string][] = [
  ["IRA", "infeções respiratórias agudas: R80, R29.01, A77.01, R71–R83, R99"], ["A04", "mal-estar/cansaço"], ["A08", "inchaço"],
  ["A88", "golpe de calor"], ["D70-D73", "gastroenterite"], ["K07", "edema dos tornozelos"], ["K77", "insuficiência cardíaca"],
  ["S92", "erupção pelo calor"], ["T11", "desidratação"],
];

const texto = (value: string, bold = false): Cell[] => [{ value, type: String, ...(bold ? { fontWeight: "bold" as const } : {}) }];

const INSTRUCOES: Cell[][] = [
  texto("Ficheiro mensal da ULSSA: instruções", true),
  texto(""),
  texto("1. Um ficheiro por mês, com o nome ULSSA_saude_sazonal_AAAA-MM.xlsx (ex.: ULSSA_saude_sazonal_2026-11.xlsx)."),
  texto("2. Prazo: dia 10 do mês seguinte ao de referência."),
  texto("3. Apenas totais agregados. Nunca uma linha por doente."),
  texto("4. Contagens pequenas podem ser escritas como \"<5\" (supressão). Colunas sem dados podem ficar vazias."),
  texto(""),
  texto("Folhas", true),
  ...FOLHAS_MENSAIS.map((f) => texto(`${f.folha}: ${f.cabecalho.join(" | ")}`)),
  texto(""),
  texto("Códigos ICD-10 (SU_diagnosticos)", true),
  ...CID.map(([c, d]) => texto(`${c}: ${d}`)),
  texto(""),
  texto("Códigos ICPC-2 (CSP_ICPC2)", true),
  ...ICPC.map(([c, d]) => texto(`${c}: ${d}`)),
  texto(""),
  texto("Vírus respiratórios (Virus_SPCIRA)", true),
  texto("Semanal, enviado pelo SPCIRA. Semana = data da segunda-feira da semana epidemiológica (AAAA-MM-DD)."),
  texto("Por vírus: positivos e negativos de testes laboratoriais na semana. Positividade = positivos / (positivos + negativos)."),
];

export async function GET() {
  const sheets: Sheet[] = [
    { sheet: "Instruções", data: INSTRUCOES, columns: [{ width: 110 }], stickyRowsCount: 0 },
    ...FOLHAS_MENSAIS.map((f) => ({
      sheet: f.folha,
      data: [f.cabecalho.map((h): Cell => ({ value: h, type: String, fontWeight: "bold" }))],
      columns: f.cabecalho.map((h) => ({ width: Math.max(12, Math.min(40, h.length + 4)) })),
      stickyRowsCount: 1,
    })),
  ];
  const buffer = await writeExcelFile(sheets as Parameters<typeof writeExcelFile>[0]).toBuffer();
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="ULSSA_saude_sazonal_modelo.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
