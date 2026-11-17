// GET /api/modelo-semanal → modelo .xlsx em branco: uma folha por equipa (Campo | Valor | Ajuda) e a folha diária.
import writeExcelFile from "write-excel-file/node";
import { COLUNAS_DIARIAS, FOLHAS_CAMPOS, FOLHA_DIARIA } from "@/lib/semanal";

export const dynamic = "force-static";
export const runtime = "nodejs";

type Cell = { value: string; type: typeof String; fontWeight?: "bold" } | null;
type Sheet = { sheet: string; data: Cell[][]; columns: { width: number }[]; stickyRowsCount: number };

const t = (value: string, bold = false): Cell => ({ value, type: String, ...(bold ? { fontWeight: "bold" as const } : {}) });

const LEIA_ME: Cell[][] = [
  [t("Ficheiro semanal de Saúde Sazonal · ULS Santo António", true)],
  [t("")],
  [t("1. Um ficheiro por semana (segunda a domingo), com o nome ULSSA_semana_AAAA-MM-DD.xlsx (data da segunda-feira).")],
  [t("2. Cada equipa preenche só a coluna Valor da sua folha: Hospital, CSP, USP e Laboratório. Não mude a coluna Campo.")],
  [t("3. Indicadores diários: uma linha por dia (Data em dd/mm/aaaa). Pode acrescentar colunas com números.")],
  [t("4. Apenas totais agregados. Nunca nomes, números de processo ou uma linha por doente.")],
  [t("5. A USP larga o ficheiro em Relatórios, revê e copia a tabela para a DE-SNS (até segunda-feira).")],
  [t("6. Vazios: os textos do CSP e da USP são sugeridos automaticamente; níveis vazios ficam 0 (Verde).")],
];

export async function GET() {
  const sheets: Sheet[] = [
    { sheet: "Leia-me", data: LEIA_ME, columns: [{ width: 110 }], stickyRowsCount: 0 },
    ...FOLHAS_CAMPOS.map(({ folha, campos }) => ({
      sheet: folha,
      data: [[t("Campo", true), t("Valor", true), t("Ajuda", true)], ...campos.map((c) => [t(c.rotulo), null, t(c.ajuda)])],
      columns: [{ width: 48 }, { width: 40 }, { width: 50 }],
      stickyRowsCount: 1,
    })),
    {
      sheet: FOLHA_DIARIA,
      data: [COLUNAS_DIARIAS.map((h) => t(h, true))],
      columns: COLUNAS_DIARIAS.map((h) => ({ width: Math.max(12, Math.min(36, h.length + 4)) })),
      stickyRowsCount: 1,
    },
  ];
  const buffer = await writeExcelFile(sheets as Parameters<typeof writeExcelFile>[0]).toBuffer();
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="ULSSA_semana_modelo.xlsx"',
    },
  });
}
