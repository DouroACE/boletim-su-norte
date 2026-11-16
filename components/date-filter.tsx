// Filtro de datas: formulário GET simples (funciona sem JavaScript). O intervalo vai no URL (?de=&ate=),
// por isso pode ser partilhado e é o mesmo nas duas páginas.
import { addDays, seasonOf } from "@/lib/stats";
import type { Range } from "@/lib/flags";
import { fmtDate } from "@/components/ui";

export function DateFilter({ range, today, path }: { range: Range | null; today: string; path: string }) {
  const s = seasonOf(today).start;
  const presets: [string, string, string][] = [
    ["7 dias", addDays(today, -6), today],
    ["30 dias", addDays(today, -29), today],
    ["90 dias", addDays(today, -89), today],
    ["Época atual", `${s}-10-01`, today],
    ["Época anterior", `${s - 1}-10-01`, `${s}-09-30`],
  ];
  const d = (iso: string) => fmtDate(iso, { day: "numeric", month: "short", year: "numeric" });
  return (
    <section className="filter card" aria-labelledby="h-filtro">
      <div className="filter-head">
        <h2 id="h-filtro">Período</h2>
        <p>
          {range ? <>A mostrar <b>{d(range.from)} – {d(range.to)}</b>. Flags comparadas com o mesmo período nos 5 anos anteriores.</> : <>A mostrar o <b>estado atual</b> (últimos 7 dias).</>}
        </p>
      </div>
      <form method="get" action={path} className="filter-form">
        <label>
          De
          <input type="date" name="de" defaultValue={range?.from} min="2015-01-01" max={today} required />
        </label>
        <label>
          Até
          <input type="date" name="ate" defaultValue={range?.to ?? today} min="2015-01-01" max={today} required />
        </label>
        <button type="submit">Aplicar</button>
      </form>
      <div className="presets" role="group" aria-label="Atalhos de período">
        {presets.map(([label, from, to]) => (
          <a key={label} href={`${path}?de=${from}&ate=${to}`} aria-current={range?.from === from && range?.to === to ? "true" : undefined}>{label}</a>
        ))}
        {range && <a href={path}>Limpar</a>}
      </div>
    </section>
  );
}
