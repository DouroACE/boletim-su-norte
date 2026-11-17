import type { Metadata } from "next";
import { fetchFriesaPorto, fetchObitosDiarios, fetchIpmaAvisos, fetchUlsNorte, fetchUlssaMensal } from "@/lib/sources";
import { regionalFlags, historySince, toIndicators, parseRange, rangeQuery } from "@/lib/flags";
import { ateMes } from "@/lib/risk";
import { DateFilter } from "@/components/date-filter";
import { aiFlags, ruleFlags } from "@/lib/ai";
import { Chip, LEVEL_TEXT } from "@/components/ui";

export const revalidate = 10800;
export const metadata: Metadata = { title: "Flags de IA · ULS Santo António · Boletim" };

// Uma fonte em baixo não deve apagar a página: devolve o valor por omissão.
const orNull = <T,>(p: Promise<T>) => p.catch(() => null);

export default async function FlagsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const range = parseRange(await searchParams, today);
  const since = historySince(range?.from ?? today);
  const limite = range?.to.slice(0, 7) ?? null;
  const isCurrent = !range || range.to >= today;
  const [friesa, obitos, avisos, uls, ulssa] = await Promise.all([
    orNull(fetchFriesaPorto(since)),
    orNull(fetchObitosDiarios(since)),
    orNull(fetchIpmaAvisos()),
    orNull(fetchUlsNorte(today, range?.to)),
    orNull(fetchUlssaMensal(today)),
  ]);
  // Só os sinais regionais que entram nas flags: FRIESA (Porto, 65+) e óbitos da Região Norte (eVM).
  const regionais = regionalFlags(null, friesa?.mais65 ?? [], obitos?.pontos ?? [], today, range, obitos?.norte).filter((f) => f.id === "friesa" || f.id === "obitos");
  const mensal = ulssa && { ...ulssa, ocupacao: ateMes(ulssa.ocupacao, limite), cspPresenciais: ateMes(ulssa.cspPresenciais, limite), cspNaoPresenciais: ateMes(ulssa.cspNaoPresenciais, limite) };
  const avisosPorto = isCurrent && avisos ? avisos.filter((a) => a.distrito === "Porto") : null;
  const indicators = toIndicators(regionais, uls?.find((r) => r.key === "santo-antonio"), mensal, avisosPorto);
  const periodo = range ? `de ${range.from} a ${range.to}` : "último mês publicado e últimos 7 dias";
  const result = await aiFlags(indicators, avisosPorto ?? [], periodo);
  const stat = ruleFlags(indicators);
  const label = new Map(indicators.map((i) => [i.id, i.label]));
  const q = rangeQuery(range);

  return (
    <>
      <a className="skip" href="#conteudo">Saltar para o conteúdo</a>
      <header className="masthead">
        <div className="wrap">
          <div>
            <div className="eyebrow">Saúde Pública · ULS Santo António</div>
            <h1>Flags de IA</h1>
            <p className="sub">Sinais propostos por um modelo de linguagem a partir dos indicadores mensais da ULS Santo António, do índice FRIESA, dos óbitos da Região Norte e dos avisos do distrito do Porto. O nível de cada flag vem sempre das regras estatísticas, nunca da IA.</p>
          </div>
          <div className="meta">
            <span>Gerado a <strong>{now.toLocaleString("pt-PT", { timeZone: "Europe/Lisbon", dateStyle: "long", timeStyle: "short" })}</strong></span>
            <span>{indicators.length} indicadores analisados</span>
          </div>
        </div>
      </header>

      <nav className="toc" aria-label="Secções do site">
        <div className="wrap">
          <ul>
            <li><a href={`/${q}`}>Boletim</a></li>
            <li><a href={`/painel${q}`}>Painel de risco</a></li>
            <li><a href="/analise">Vigilância da equipa →</a></li>
            <li><a href="/alertas">Alertas →</a></li>
            <li><a href={`/flags-ia${q}`} aria-current="page">Flags de IA</a></li>
            <li><a href={`/exportar${q}`}>Exportar →</a></li>
          </ul>
        </div>
      </nav>

      <main id="conteudo" className="wrap">
        <DateFilter range={range} today={today} path="/flags-ia" />

        <section id="ia" aria-labelledby="h-ia">
          <div className="section-head">
            <h2 id="h-ia">{result.generated === "ia" ? "Flags propostas pela IA" : "Flags (IA indisponível)"}</h2>
            <div className="ai-meta">
              {result.generated === "ia" ? (
                <>
                  <span className="tag">Gerado por IA · {result.model}</span>
                  <span className="tag warn">Por validar pela equipa de Saúde Pública</span>
                </>
              ) : (
                <span className="tag warn">
                  {result.error ? `IA falhou (${result.error}); a mostrar as regras estatísticas` : "Sem GROQ_API_KEY nem HF_TOKEN configurados; a mostrar as regras estatísticas"}
                </span>
              )}
            </div>
          </div>
          {result.flags.length ? (
            <div className="flags">
              {result.flags.map((f, i) => (
                <article key={i} className={`flag lv-${f.level}`}>
                  <Chip level={f.level} label={f.level === "info" ? "Padrão" : LEVEL_TEXT[f.level]} />
                  <h3>{f.titulo}</h3>
                  {f.evidencia && <p><b>Evidência:</b> {f.evidencia}</p>}
                  {f.investigar && <p><b>A verificar:</b> {f.investigar}</p>}
                  {result.generated === "ia" && (
                    <div className="refs" aria-label="Indicadores citados">
                      {f.indicadores.map((id) => <code key={id} title={label.get(id)}>{label.get(id) ?? id}</code>)}
                    </div>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <p className="hint">Nenhum sinal acima do esperado. Todos os indicadores estão dentro do normal.</p>
          )}
        </section>

        {result.generated === "ia" && (
          <section id="regras" aria-labelledby="h-regras">
            <div className="section-head">
              <h2 id="h-regras">Flags estatísticas (regras)</h2>
              <p>Indicadores em Atenção ou Alerta segundo as regras, para comparar com o que a IA destacou.</p>
            </div>
            {stat.length ? (
              <div className="flags">
                {stat.map((f) => (
                  <article key={f.indicadores[0]} className={`flag lv-${f.level}`}>
                    <Chip level={f.level} />
                    <h3>{f.titulo}</h3>
                    <p>{f.evidencia}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="hint">Nenhum indicador em Atenção ou Alerta.</p>
            )}
          </section>
        )}

        <section id="dados" aria-labelledby="h-dados">
          <details className="method">
            <summary id="h-dados">Dados enviados à IA ({indicators.length} indicadores)</summary>
            <div>
              <p>O modelo recebe apenas esta tabela e os avisos do IPMA do distrito do Porto. Flags que citem indicadores que não estão aqui são descartadas automaticamente. Os óbitos da Região Norte são regionais (eVM), não da ULSSA.</p>
              <div className="table-wrap">
                <table className="inputs">
                  <thead><tr><th scope="col">Indicador</th><th scope="col">Nível</th><th scope="col">Números</th></tr></thead>
                  <tbody>
                    {indicators.map((i) => (
                      <tr key={i.id}><td>{i.label}</td><td><Chip level={i.level} /></td><td>{i.detail}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </details>
        </section>
      </main>

      <footer>
        <div className="wrap">As flags de IA são uma ajuda à triagem de sinais e não substituem a avaliação da Autoridade de Saúde.</div>
      </footer>
    </>
  );
}
