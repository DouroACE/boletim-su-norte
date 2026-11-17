import type { Metadata } from "next";
import { parseRange, rangeQuery } from "@/lib/flags";
import { VARIAVEIS } from "@/lib/export";
import { addDays } from "@/lib/stats";
import { FONTES } from "@/lib/sources";

export const metadata: Metadata = { title: "Exportar para Excel · Boletim de Vigilância Sazonal" };

const PADRAO = new Set(["episodios", "resp", "internamento", "obitos"]);

export default async function ExportarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const today = new Date().toISOString().slice(0, 10);
  const sp = await searchParams;
  const range = parseRange(sp, today);
  const erro = sp.erro === "variaveis";
  const from = range?.from ?? addDays(today, -89);
  const to = range?.to ?? today;
  const grupos = [...new Set(VARIAVEIS.map((v) => v.grupo))];
  const q = rangeQuery(range);

  return (
    <>
      <a className="skip" href="#conteudo">Saltar para o conteúdo</a>
      <header className="masthead">
        <div className="wrap">
          <div>
            <div className="eyebrow">Saúde Pública · Região Norte</div>
            <h1>Exportar para Excel</h1>
            <p className="sub">Escolha as variáveis e o período. O ficheiro .xlsx tem uma folha diária, uma folha mensal por ULS (se escolher variáveis por ULS) e uma folha com as fontes.</p>
          </div>
        </div>
      </header>

      <nav className="toc" aria-label="Navegação">
        <div className="wrap">
          <ul>
            <li><a href={`/${q}`}>← Boletim</a></li>
            <li><a href={`/painel${q}`}>Painel de risco</a></li>
            <li><a href={`/flags-ia${q}`}>Flags de IA</a></li>
          </ul>
        </div>
      </nav>

      <main id="conteudo" className="wrap">
        <form method="get" action="/api/exportar" className="card export-form">
          <fieldset className="export-dates">
            <legend>Período</legend>
            <label>De<input type="date" name="de" defaultValue={from} min="2015-01-01" max={today} required /></label>
            <label>Até<input type="date" name="ate" defaultValue={to} min="2015-01-01" max={today} required /></label>
          </fieldset>

          {grupos.map((g) => (
            <fieldset key={g} className="export-group">
              <legend>{g}</legend>
              {VARIAVEIS.filter((v) => v.grupo === g).map((v) => (
                <label key={v.id} className="check">
                  <input type="checkbox" name="v" value={v.id} defaultChecked={PADRAO.has(v.id)} />
                  <span>
                    {v.label}
                    <small>{FONTES[v.fonte].nome}{v.nota ? ` · ${v.nota}` : ""}</small>
                  </span>
                </label>
              ))}
            </fieldset>
          ))}

          <div className="export-actions">
            <button type="submit">Exportar Excel (.xlsx)</button>
            {erro && <p className="form-error" role="alert">Escolha pelo menos uma variável para exportar.</p>}
            <p className="hint">Se não escolher nenhuma variável, o ficheiro não é gerado. Os dados são provisórios e podem ser revistos pelas entidades de origem.</p>
          </div>
        </form>
      </main>
    </>
  );
}
