// eVM (Vigilância da Mortalidade, DGS): óbitos diários por região de saúde, publicados até ao dia anterior.
// Não há API oficial: os valores vêm do JSON dos gráficos Highcharts da página /chart?t=ARS.
// shortcut: depende do formato HTML do eVM; se a DGS o mudar, parseEvm devolve [] e o boletim usa o SICO nacional.
export type EvmPoint = { date: string; value: number };

/** Extrai a série diária (todos os anos) do gráfico cujo título contém `regiao`. As datas vêm todas no
 *  eixo de 2012 (ano bissexto) e o ano está no nome da série. */
export function parseEvm(html: string, regiao: string): EvmPoint[] {
  const block = html.split("new Highcharts.Chart(").slice(1).find((b) => new RegExp(`"text":\\s*"[^"]*${regiao}[^"]*"`).test(b));
  if (!block) return [];
  const out: EvmPoint[] = [];
  for (const m of block.matchAll(/"data":\s*(\[\s*\[[\s\S]*?\]\s*\])\s*,\s*"name":\s*"(\d{4})"/g)) {
    const year = m[2];
    let pts: [number, number | null][];
    try {
      pts = JSON.parse(m[1]);
    } catch {
      continue;
    }
    for (const [ts, v] of pts) {
      if (v == null || !Number.isFinite(v)) continue;
      const md = new Date(ts).toISOString().slice(5, 10);
      const date = `${year}-${md}`;
      if (new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) continue; // 29/02 em anos não bissextos
      out.push({ date, value: v });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
