import type { Metadata } from "next";
import { fetchNorte, fetchFriesaPorto, fetchObitos, fetchUlsNorte, type UlsRow } from "@/lib/sources";
import { regionalFlags, historySince, parseRange, rangeQuery } from "@/lib/flags";
import { dgsIndicators, regionalDgsLevel, dgsLevel, DGS_TEXT, type DgsLevel } from "@/lib/risk";
import { levelRank, type Level } from "@/lib/stats";
import { DateFilter } from "@/components/date-filter";
import { RiskGauge, LevelDonut, BulletRow } from "@/components/risk-viz";
import { Chip, fmt, fmtDate } from "@/components/ui";

export const metadata: Metadata = { title: "Painel de risco · Boletim de Vigilância Sazonal" };

const REGIAO = process.env.REGIAO_ARS || "ARS Norte";
const orNull = <T,>(p: Promise<T>) => p.catch(() => null);

/** Pior sinal estatístico da ULS (óbitos ou urgências); "a rever" quando a SPMS repetiu um mês. */
const ulsLevel = (r: UlsRow): Level => {
  return [r.obitos.level, r.urgencias.level].reduce((w, l) => (levelRank[l] > levelRank[w] ? l : w), "sem-dados" as Level);
};
const ulsDgs = (r: UlsRow): DgsLevel | null =>
  r.urgencias.varPct != null && !r.urgencias.suspeito ? dgsLevel(r.urgencias.varPct, [10, 25, 50]) : null;
const pct = (v: number | null) => (v == null ? "" : ` ${v >= 0 ? "▲" : "▼"} ${fmt(Math.abs(v), 0)}%`);
const mes = (m: string | null) => (m ? fmtDate(`${m}-15`, { month: "short", year: "numeric" }) : "—");

export default async function PainelPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const range = parseRange(await searchParams, today);
  const since = historySince(range?.from ?? today);
  const [norte, friesa, obitos, uls] = await Promise.all([
    orNull(fetchNorte(since, REGIAO)),
    orNull(fetchFriesaPorto(since)),
    orNull(fetchObitos(since)),
    orNull(fetchUlsNorte(today, range?.to)),
  ]);
  const flags = regionalFlags(norte, friesa?.mais65 ?? [], obitos ?? [], today, range);
  const ind = dgsIndicators(flags);
  const reg = regionalDgsLevel(ind);
  const U = [...(uls ?? [])].sort((a, b) => levelRank[ulsLevel(b)] - levelRank[ulsLevel(a)] || (ulsDgs(b) ?? -1) - (ulsDgs(a) ?? -1));
  const count = (l: Level) => U.filter((r) => ulsLevel(r) === l).length;
  const q = rangeQuery(range);

  return (
    <>
      <a className="skip" href="#conteudo">Saltar para o conteúdo</a>
      <header className="masthead">
        <div className="wrap">
          <div>
            <div className="eyebrow">Saúde Pública · Região Norte</div>
            <h1>Painel de risco</h1>
            <p className="sub">Nível de risco do Plano Nacional de Preparação e Resposta Sazonal 2026–2027 (DGS / DE-SNS) e sinais por ULS.</p>
          </div>
          <div className="meta">
            <span>Gerado a <strong>{now.toLocaleString("pt-PT", { timeZone: "Europe/Lisbon", dateStyle: "long", timeStyle: "short" })}</strong></span>
          </div>
        </div>
      </header>

      <nav className="toc" aria-label="Navegação">
        <div className="wrap">
          <ul>
            <li><a href={`/${q}`}>← Boletim</a></li>
            <li><a href="#nivel">Nível de risco</a></li>
            <li><a href="#indicadores-dgs">Indicadores DGS</a></li>
            <li><a href="#matriz">Matriz por ULS</a></li>
            <li><a href={`/flags-ia${q}`}>Flags de IA →</a></li>
          </ul>
        </div>
      </nav>

      <main id="conteudo" className="wrap">
        <DateFilter range={range} today={today} path="/painel" />

        <section id="nivel" aria-labelledby="h-nivel" className="grid g-2">
          <h2 id="h-nivel" className="sr-only">Nível de risco e ULS com sinal</h2>
          <article className="card risk-card">
            <h3>Nível de risco DGS · Região Norte</h3>
            <RiskGauge level={reg.level} label="Nível de risco DGS da Região Norte" />
            <p className="risk-level">
              {reg.level == null ? "Sem dados" : <span className={`dgs-badge dgs-${reg.level}`}>Nível {reg.level} · {DGS_TEXT[reg.level]}</span>}
            </p>
            <p className="hint center">{reg.reason}</p>
            <p className="partial">
              Parcial: {reg.withData} de {ind.length} indicadores da tabela DGS com dados. Os restantes dependem de dados das ULS, SPMS e ACSS.
            </p>
          </article>
          <article className="card risk-card">
            <h3>ULS por sinal estatístico</h3>
            <p className="hint">Pior sinal entre óbitos (SICO) e urgências no último mês publicado, face ao mesmo mês do ano anterior.</p>
            {U.length ? (
              <LevelDonut counts={[
                { level: "normal", n: count("normal") },
                { level: "atencao", n: count("atencao") },
                { level: "alerta", n: count("alerta") },
                { level: "sem-dados", label: "A rever / sem dados", n: count("sem-dados") },
              ]} />
            ) : <p className="hint">Fonte indisponível neste momento.</p>}
          </article>
        </section>

        <section id="indicadores-dgs" aria-labelledby="h-dgs">
          <div className="section-head">
            <h2 id="h-dgs">Indicadores do Plano Sazonal (critérios assistenciais, p. 20)</h2>
            <p>Cada barra mostra onde o valor está face aos limiares dos níveis 1, 2 e 3. Tracejado = indicador sem fonte disponível.</p>
          </div>
          <article className="card">
            <ul className="bullets">{ind.map((i) => <BulletRow key={i.id} ind={i} />)}</ul>
            <ul className="dgs-legend" aria-label="Legenda dos níveis">
              {([0, 1, 2, 3] as DgsLevel[]).map((k) => <li key={k}><span className={`dgs-badge dgs-${k}`}>N{k}</span> {DGS_TEXT[k]}</li>)}
            </ul>
            <p className="hint">"Aumento" = média dos últimos 7 dias (ou do período escolhido) face ao esperado para a mesma altura nas épocas anteriores. A referência exata ainda está por confirmar com a DGS.</p>
          </article>
        </section>

        <section id="matriz" aria-labelledby="h-matriz">
          <div className="section-head">
            <h2 id="h-matriz">Matriz por ULS</h2>
            <p>Ordenada pela gravidade. Nível DGS aplicado à procura do SU de cada ULS (mês homólogo); sinais estatísticos para óbitos e urgências.</p>
          </div>
          <article className="card">
            {U.length ? (
              <div className="table-wrap">
                <table className="uls-table">
                  <caption className="sr-only">Nível DGS e sinais estatísticos por ULS</caption>
                  <thead>
                    <tr><th scope="col">ULS</th><th scope="col">Nível DGS (procura SU)</th><th scope="col">Óbitos (SICO)</th><th scope="col">Urgências</th></tr>
                  </thead>
                  <tbody>
                    {U.map((r) => {
                      const d = ulsDgs(r);
                      return (
                        <tr key={r.key}>
                          <th scope="row">{r.nome}</th>
                          <td data-label="Nível DGS">{d == null ? <span className="muted">{r.urgencias.suspeito ? "A rever" : "—"}</span> : <span className={`dgs-badge dgs-${d}`}>N{d} · {DGS_TEXT[d]}</span>}</td>
                          {([[r.obitos, "Óbitos (SICO)"], [r.urgencias, "Urgências"]] as const).map(([m, lbl]) => (
                            <td key={lbl} data-label={lbl}>
                              <span className="num">{fmt(m.valor)}</span><small>{pct(m.varPct)} · {mes(m.mes)}</small>{" "}
                              <Chip level={m.level} label={m.suspeito ? "A rever" : undefined} />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : <p className="hint">Fonte indisponível neste momento.</p>}
            <p className="hint">"A rever": a SPMS repetiu o valor de um mês na publicação, por isso a comparação fica suspensa até ser corrigida.</p>
          </article>
        </section>
      </main>

      <footer>
        <div className="wrap">Painel de apoio à decisão. O nível de risco é parcial enquanto faltarem dados assistenciais das ULS; não substitui a avaliação da Equipa Local nem da Autoridade de Saúde.</div>
      </footer>
    </>
  );
}
