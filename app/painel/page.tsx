import type { Metadata } from "next";
import { fetchUlsNorte, fetchUlssaMensal } from "@/lib/sources";
import { parseRange, rangeQuery } from "@/lib/flags";
import { dgsIndicators, regionalDgsLevel, faixaMensal, ateMes, DGS_TEXT, type DgsLevel } from "@/lib/risk";
import { DateFilter } from "@/components/date-filter";
import { RiskGauge, BulletRow } from "@/components/risk-viz";
import { Fonte, fmtDate } from "@/components/ui";
import { Imprimir, RodapeImpressao } from "@/components/imprimir";

export const metadata: Metadata = { title: "Nível de risco · ULS Santo António · Boletim" };
export const revalidate = 10800;

const orNull = <T,>(p: Promise<T>) => p.catch(() => null);
const ULSSA = "santo-antonio";
const mesExtenso = (m: string | null | undefined) => (m ? fmtDate(`${m}-15`, { month: "long", year: "numeric" }) : "—");
const mesCurto = (m: string) => fmtDate(`${m}-15`, { month: "short", year: "2-digit" });

export default async function PainelPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const range = parseRange(await searchParams, today);
  const limite = range?.to.slice(0, 7) ?? null; // com filtro de datas, só conta até ao fim do intervalo
  const [uls, ulssa] = await Promise.all([orNull(fetchUlsNorte(today, range?.to)), orNull(fetchUlssaMensal(today))]);

  const row = uls?.find((r) => r.key === ULSSA);
  const urg = row?.urgencias;
  const urgSerie = ateMes(urg?.serie ?? [], limite);
  const ultimoUrg = urgSerie.at(-1);
  const procura = urg && urg.varPct != null && !urg.suspeito ? urg.varPct : null;
  const ocupSerie = ateMes(ulssa?.ocupacao ?? [], limite).filter((s) => Number.isFinite(s.valor));
  const ocup = ocupSerie.at(-1) ?? null;

  const ind = dgsIndicators([], {
    procura,
    procuraNota: `Último mês publicado: ${mesExtenso(urg?.mes)}. Atendimentos em urgência face ao mesmo mês do ano anterior.`,
    ocupacao: ocup?.valor ?? null,
    ocupacaoNota: `Último mês publicado: ${mesExtenso(ocup?.mes)}. Dias de internamento ÷ (lotação × dias do mês).`,
  });
  const reg = regionalDgsLevel(ind);
  const faixa = faixaMensal(urgSerie, ocupSerie, 12);
  const q = rangeQuery(range);
  const mesOc = ocup?.mes ?? ultimoUrg?.mes;

  return (
    <>
      <a className="skip" href="#conteudo">Saltar para o conteúdo</a>
      <header className="masthead">
        <div className="wrap">
          <div>
            <div className="eyebrow">Saúde Pública · ULS Santo António</div>
            <h1>Nível de risco · ULS Santo António</h1>
            <p className="sub">Nível de risco do Plano Nacional de Preparação e Resposta Sazonal 2026–2027 (DGS / DE-SNS), com os dados da ULS Santo António (Gondomar e Porto Ocidental).</p>
          </div>
          <div className="meta">
            <span>Gerado a <strong>{now.toLocaleString("pt-PT", { timeZone: "Europe/Lisbon", dateStyle: "long", timeStyle: "short" })}</strong></span>
            <Imprimir />
          </div>
        </div>
      </header>
      <RodapeImpressao />

      <nav className="toc" aria-label="Secções do site">
        <div className="wrap">
          <ul>
            <li><a href={`/${q}`}>Boletim</a></li>
            <li><a href="/painel" aria-current="page">Painel de risco</a></li>
            <li><a href="/analise">Vigilância da equipa →</a></li>
            <li><a href="/alertas">Alertas →</a></li>
            <li><a href="/relatorios">Relatórios →</a></li>
            <li><a href={`/flags-ia${q}`}>Flags de IA →</a></li>
            <li><a href={`/exportar${q}`}>Exportar →</a></li>
          </ul>
        </div>
      </nav>

      <main id="conteudo" className="wrap">
        <DateFilter range={range} today={today} path="/painel" />

        <section id="nivel" aria-labelledby="h-nivel" className="grid g-2">
          <h2 id="h-nivel" className="sr-only">Nível de risco e últimos meses</h2>
          <article className="card risk-card">
            <h3>Nível de risco DGS · ULS Santo António</h3>
            <RiskGauge level={reg.level} label="Nível de risco DGS da ULS Santo António" />
            <p className="risk-level">
              {reg.level == null ? "Sem dados" : <span className={`dgs-badge dgs-${reg.level}`}>Nível {reg.level} · {DGS_TEXT[reg.level]}</span>}
            </p>
            <p className="hint center">{reg.reason}</p>
            <p className="partial">
              Parcial: {reg.withData} de {ind.length} indicadores da tabela DGS com dados. Os restantes dependem de dados das ULS, SPMS e ACSS.
            </p>
            <Fonte ids={["dgs", "urgUls", "ocupacao"]} />
          </article>

          <article className="card risk-card">
            <h3>Últimos 12 meses publicados</h3>
            <p className="hint">Cada mês mostra o pior nível entre a procura do SU (face ao mesmo mês do ano anterior) e a ocupação hospitalar.{mesOc ? ` Último mês: ${mesExtenso(mesOc)}.` : ""}</p>
            {faixa.length ? (
              <ol className="mstrip" aria-label="Nível de risco por mês">
                {faixa.map((m) => (
                  <li key={m.mes} className={`mcell${m.nivel == null ? "" : ` dgs-${m.nivel}`}`}>
                    <span className="mcell-mes">{mesCurto(m.mes)}</span>
                    <span className="mcell-nivel">{m.nivel == null ? "Sem dados" : `N${m.nivel} · ${DGS_TEXT[m.nivel]}`}</span>
                    <span className="mcell-det">
                      Procura {m.procura == null ? "—" : `N${m.procura}`} · Ocupação {m.ocupacao == null ? "—" : `N${m.ocupacao}`}
                    </span>
                  </li>
                ))}
              </ol>
            ) : <p className="hint">Fonte indisponível neste momento.</p>}
            <Fonte ids={["urgUls", "ocupacao"]} />
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
            <p className="hint">"Aumento" = variação face ao mesmo mês do ano anterior. A referência exata ainda está por confirmar com a DGS.</p>
            <Fonte ids={["dgs", "urgUls", "ocupacao"]} />
          </article>
        </section>
      </main>

      <footer>
        <div className="wrap">Painel de apoio à decisão. O nível de risco é parcial enquanto faltarem dados assistenciais das ULS, SPMS e ACSS; não substitui a avaliação da Equipa Local nem da Autoridade de Saúde.</div>
      </footer>
    </>
  );
}
