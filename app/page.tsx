import {
  REVALIDATE, fetchNorte, fetchFriesaPorto, fetchIcaro, fetchObitos, fetchManchester, fetchIpmaForecast, fetchIpmaAvisos, fetchMeteoPorto, fetchUlsNorte, safe,
  type Point, type SourceStatus,
} from "@/lib/sources";
import { seasonOf, seasonalBaseline, rolling, dayOfSeason, addDays, worstLevel, type Flag } from "@/lib/stats";
import { analyseLocal, local } from "@/lib/local";
import { aiSummary } from "@/lib/ai";
import { regionalFlags, historySince, parseRange, rangeQuery, type Range } from "@/lib/flags";
import { DateFilter } from "@/components/date-filter";
import { Chip, LevelIcon, LEVEL_TEXT, Sparkline, Fonte, fmt, fmtDate } from "@/components/ui";
import type { FonteId } from "@/lib/sources";
import { UlsMap } from "@/components/uls-map";
import { SeasonChart, MeteoChart, LocalDailyChart, WeeklyDiagChart, HBarChart, DowChart, ManchesterChart, SimpleLine, type SeasonRow } from "@/components/charts";

export const revalidate = 10800; // 3 h — ISR: a página reconstrói-se sozinha com dados novos

const REGIAO = process.env.REGIAO_ARS || "ARS Norte";
const INSTITUICAO = process.env.INSTITUICAO_SNS || "Unidade Local de Saúde de Santo António, EPE";
const SNS_URL = "https://transparencia.sns.gov.pt/explore/dataset/";

const KPI_FONTE: Record<string, FonteId> = { internamento: "sazonal", friesa: "friesa", obitos: "obitos" };

const lastOf = (p: Point[] | null | undefined) => p?.at(-1)?.date;

function seasonRows(points: Point[], seasonStart: number, range: Range | null): SeasonRow[] {
  const smooth = rolling(points, 7);
  const base = seasonalBaseline(points, seasonStart, 5);
  const cur = new Map<number, number>();
  const prev = new Map<number, number>();
  for (const p of smooth) {
    const s = seasonOf(p.date).start;
    if (s === seasonStart) cur.set(dayOfSeason(p.date), p.value);
    if (s === seasonStart - 1) prev.set(dayOfSeason(p.date), p.value);
  }
  const start = `${seasonStart}-10-01`;
  // Sem filtro: semestre de inverno (1 out → 31 mar), onde se concentra a atividade sazonal. Com filtro: só o intervalo.
  const days = range ? base.days.filter((b) => { const d = addDays(start, b.dos); return d >= range.from && d <= range.to; }) : base.days.slice(0, 182);
  return days.map((b) => {
    const ok = b.n >= 10 && Number.isFinite(b.sd);
    return {
      label: fmtDate(addDays(start, b.dos), { day: "numeric", month: "short" }),
      atual: cur.get(b.dos) ?? null,
      anterior: prev.get(b.dos) ?? null,
      base: ok ? b.mean : null,
      banda: ok ? [Math.max(0, b.mean - 2 * b.sd), b.mean + 2 * b.sd] : null,
    };
  });
}

const AVISO_COR: Record<string, string> = { yellow: "#e3b505", orange: "#e06c1b", red: "#c0262d" };
const AVISO_TXT: Record<string, string> = { yellow: "Amarelo", orange: "Laranja", red: "Vermelho" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const range = parseRange(await searchParams, today);
  const inRange = (pts: Point[]) => (range ? pts.filter((p) => p.date >= range.from && p.date <= range.to) : pts);
  const isCurrent = !range || range.to >= today; // avisos e previsão do IPMA só fazem sentido para o presente
  const season = seasonOf(range?.to ?? today);
  const since = historySince(range?.from ?? today);
  const sinceShort = `${season.start - 1}-10-01`;

  const [norte, friesa, icaro, obitos, manchester, forecast, avisos, meteo, uls] = await Promise.all([
    safe({ id: "sns-urg", name: "SNS Transparência — Vigilância sazonal das urgências (diário)", url: `${SNS_URL}atividade-sindrome-gripal-csh/` }, () => fetchNorte(since, REGIAO), (v) => lastOf(v.episodios)),
    safe({ id: "friesa", name: "Índice FRIESA — impacto do frio, Porto (INSA)", url: `${SNS_URL}indice-friesa/` }, () => fetchFriesaPorto(since), (v) => lastOf(v.mais65)),
    safe({ id: "icaro", name: "Índice ÍCARO — impacto do calor (INSA)", url: `${SNS_URL}evolucao-diaria-do-indice-icaro/` }, () => fetchIcaro(sinceShort), lastOf),
    safe({ id: "obitos", name: "Certificados de óbito diários — Portugal (SICO)", url: `${SNS_URL}evolucao-diaria-de-certificados-de-obito/` }, () => fetchObitos(since), lastOf),
    safe({ id: "manchester", name: `Atendimentos por triagem de Manchester — ${INSTITUICAO.replace(", EPE", "")}`, url: `${SNS_URL}atendimentos-em-urgencia-triagem-manchester/` }, () => fetchManchester(INSTITUICAO, `${season.start - 1}-10`), (v) => v.at(-1)?.mes),
    safe({ id: "ipma-prev", name: "IPMA — Previsão diária, Porto", url: "https://api.ipma.pt/" }, () => fetchIpmaForecast(), (v) => v[0]?.date),
    safe({ id: "ipma-avisos", name: "IPMA — Avisos meteorológicos, distritos do Norte", url: "https://www.ipma.pt/pt/otempo/prev-sam/" }, () => fetchIpmaAvisos(), () => today),
    safe({ id: "meteo", name: "Open-Meteo — Temperatura observada e prevista, Porto", url: "https://open-meteo.com/" }, () => fetchMeteoPorto(), () => today),
    safe({ id: "uls", name: "SICO por instituição e urgências por ULS — Região Norte (mensal)", url: `${SNS_URL}certificados-de-obito-por-instituicao-de-saude/` }, () => fetchUlsNorte(today, range?.to), (v) => v.map((r) => r.obitos.mes ?? "").sort().at(-1)),
  ]);

  const N = norte.value;
  const U = uls.value ?? [];
  const flags: Flag[] = regionalFlags(N, friesa.value?.mais65 ?? [], obitos.value ?? [], today, range);
  const series: Record<string, Point[]> = {
    episodios: N?.episodios ?? [],
    resp: N?.pctRespiratoria ?? [],
    internamento: N?.pctInternamento ?? [],
    triagem: N?.tempoTriagem ?? [],
    friesa: friesa.value?.mais65 ?? [],
    obitos: obitos.value ?? [],
  };
  const level = worstLevel(flags);
  const L = analyseLocal();
  const av = isCurrent ? avisos.value ?? [] : [];
  const summary = await aiSummary(flags, av, L?.patterns ?? []);
  const statuses: SourceStatus[] = [norte, friesa, icaro, obitos, manchester, forecast, avisos, meteo, uls].map((s) => s.status);
  statuses.push({ id: "excel", name: `Dados locais do SU (${local.source})`, url: "#local", ok: !!L, lastDate: L?.last });

  const epiRows = N ? seasonRows(N.episodios, season.start, range) : [];
  const respRows = N ? seasonRows(N.pctRespiratoria, season.start, range) : [];
  const icaroRecent = range ? inRange(icaro.value ?? []) : (icaro.value ?? []).filter((p) => p.date >= `${season.start - 1}-05-01`);
  const meteoRange = range ? (meteo.value ?? []).filter((d) => d.date >= range.from && d.date <= range.to) : meteo.value;

  return (
    <>
      <a className="skip" href="#conteudo">Saltar para o conteúdo</a>
      <header className="masthead">
        <div className="wrap">
          <div>
            <div className="eyebrow">Saúde Pública · Região Norte</div>
            <h1>Boletim de Vigilância Sazonal</h1>
            <p className="sub">
              Procura dos serviços de urgência, infeções respiratórias, temperatura e avisos meteorológicos. Época {season.label}. Os dados públicos atualizam-se sozinhos.
            </p>
          </div>
          <div className="meta">
            <span>Atualizado a <strong>{now.toLocaleString("pt-PT", { timeZone: "Europe/Lisbon", dateStyle: "long", timeStyle: "short" })}</strong></span>
            <span>Dados regionais até <strong>{lastOf(N?.episodios) ? fmtDate(lastOf(N?.episodios)!) : "—"}</strong></span>
            <span>Nova recolha automática a cada 3 horas</span>
          </div>
        </div>
      </header>

      <nav className="toc" aria-label="Secções do boletim">
        <div className="wrap">
          <ul>
            <li><a href="#resumo">Resumo</a></li>
            <li><a href="#indicadores">Indicadores</a></li>
            <li><a href="#tendencias">Tendências</a></li>
            <li><a href="#mapa">Mapa por ULS</a></li>
            <li><a href="#meteorologia">Meteorologia</a></li>
            <li><a href="#local">Dados locais do SU</a></li>
            <li><a href="#metodologia">Metodologia e fontes</a></li>
            <li><a href={`/painel${rangeQuery(range)}`}>Painel de risco →</a></li>
            <li><a href={`/flags-ia${rangeQuery(range)}`}>Flags de IA →</a></li>
          </ul>
        </div>
      </nav>

      <main id="conteudo" className="wrap">
        <DateFilter range={range} today={today} path="/" />

        {/* RESUMO */}
        <section id="resumo" aria-labelledby="h-resumo" className="grid">
          <h2 id="h-resumo" className="sr-only" style={{ position: "absolute", left: -9999 }}>Resumo</h2>
          <div className={`status lv-${level}`}>
            <div className="status-badge">
              <div className="dot"><span style={{ width: 26, height: 26, display: "block" }}><LevelIcon level={level} /></span></div>
              <div>
                <div className="lv">Situação regional: {LEVEL_TEXT[level]}</div>
                <div className="lv-sub">Nível mais alto entre os indicadores com histórico</div>
              </div>
            </div>
            <ul>
              {flags.filter((f) => f.level === "alerta" || f.level === "atencao").map((f) => (
                <li key={f.id}><b>{f.label}</b> — {LEVEL_TEXT[f.level].toLowerCase()} (z = {fmt(f.z, 1)})</li>
              ))}
              {av.length > 0 && <li><b>IPMA:</b> {av.length} aviso(s) ativo(s) nos distritos do Norte</li>}
              {!flags.some((f) => f.level === "alerta" || f.level === "atencao") && !av.length && <li>Sem sinais acima do esperado para esta altura do ano.</li>}
            </ul>
          </div>

          <article className="card ai" aria-labelledby="h-ai">
            <div className="section-head" style={{ marginBottom: 0 }}>
              <h3 id="h-ai" style={{ fontSize: 18 }}>Padrões e sinais da semana</h3>
              <div className="ai-meta">
                {summary.generated === "ia" ? (
                  <>
                    <span className="tag">Gerado por IA · {summary.model}</span>
                    <span className="tag warn">Por validar pela equipa de Saúde Pública</span>
                  </>
                ) : (
                  <span className="tag">Texto automático a partir das regras estatísticas</span>
                )}
              </div>
            </div>
            <ul>{summary.text.map((t, i) => <li key={i}>{t}</li>)}</ul>
            <Fonte ids={["gripal", "sazonal", "friesa", "obitos", "ipmaAvisos"]} extra={summary.generated === "ia" ? `Texto redigido por ${summary.model} a partir destes números` : undefined} />
          </article>
        </section>

        {/* INDICADORES */}
        <section id="indicadores" aria-labelledby="h-ind">
          <div className="section-head">
            <h2 id="h-ind">Indicadores-chave · {REGIAO.replace("ARS ", "Região ")}</h2>
            <p>{range ? "Média do período escolhido, comparada com o período imediatamente anterior e com o mesmo período nos 5 anos anteriores." : "Média dos últimos 7 dias comparada com a semana anterior e com as 5 épocas anteriores para a mesma altura do ano."}</p>
          </div>
          <div className="grid g-kpi">
            {flags.map((f) => (
              <article key={f.id} className="card kpi" aria-labelledby={`k-${f.id}`}>
                <div className="kpi-top">
                  <span id={`k-${f.id}`} className="kpi-label">{f.label}</span>
                  <Chip level={f.level} />
                </div>
                <div className="kpi-value">
                  {fmt(f.current, f.unit === "%" || f.unit === "" ? 1 : 0)}
                  <small>{f.unit}</small>
                </div>
                <div className="kpi-delta">
                  {f.changePct != null ? (
                    <>
                      <b>{f.changePct > 0 ? "▲" : "▼"} {fmt(Math.abs(f.changePct), 1)}%</b> vs. {range ? "período anterior" : "semana anterior"}
                    </>
                  ) : (
                    "—"
                  )}
                  {f.baselineMean != null && <> · esperado {fmt(f.baselineMean, f.unit === "%" || f.unit === "" ? 1 : 0)}</>}
                </div>
                <Sparkline values={(range ? inRange(series[f.id]) : series[f.id].slice(-60)).map((p) => p.value)} label={`Evolução ${range ? "no período escolhido" : "dos últimos 60 dias"}: ${f.label}`} />
                <p className="kpi-note">{f.note}</p>
                <Fonte ids={[KPI_FONTE[f.id] ?? "gripal"]} />
              </article>
            ))}
          </div>
        </section>

        {/* TENDÊNCIAS */}
        <section id="tendencias" aria-labelledby="h-tend">
          <div className="section-head">
            <h2 id="h-tend">Tendências da época</h2>
            <p>Médias móveis de 7 dias, de outubro a março. A faixa azul é o intervalo esperado (média ± 2 desvios-padrão das épocas {season.start - 5}/{String(season.start - 4).slice(2)} a {season.start - 1}/{String(season.start).slice(2)}).</p>
          </div>
          <div className="grid g-2">
            <article className="card">
              <h3>Episódios de urgência por dia · {REGIAO.replace("ARS ", "")}</h3>
              <p className="hint">Estimativa diária da rede de urgência hospitalar.</p>
              {N ? <SeasonChart data={epiRows} unit="episódios" title="Episódios de urgência por dia: época atual, anterior e linha de base" /> : <p className="hint">Fonte indisponível.</p>}
              <Fonte ids={["gripal"]} />
            </article>
            <article className="card">
              <h3>Urgências com diagnóstico de infeção respiratória (%)</h3>
              <p className="hint">Proporção de episódios com infeção respiratória codificada.</p>
              {N ? <SeasonChart data={respRows} unit="%" digits={1} title="Percentagem de urgências com infeção respiratória: época atual, anterior e linha de base" /> : <p className="hint">Fonte indisponível.</p>}
              <Fonte ids={["gripal"]} />
            </article>
          </div>
          {manchester.value && manchester.value.length > 0 && (
            <article className="card" style={{ marginTop: 16 }}>
              <h3>Atendimentos mensais por prioridade de triagem · {INSTITUICAO.replace(", EPE", "")}</h3>
              <p className="hint">Triagem de Manchester. Publicação mensal, com alguns meses de atraso. A SPMS publica totais acumulados no ano; aqui estão convertidos em valores mensais.</p>
              <ManchesterChart data={manchester.value} />
              <Fonte ids={["manchester"]} />
            </article>
          )}
        </section>

        {/* MAPA POR ULS */}
        <section id="mapa" aria-labelledby="h-mapa">
          <div className="section-head">
            <h2 id="h-mapa">Mapa por ULS · Região Norte</h2>
            <p>Último mês publicado de óbitos certificados (SICO, por instituição) e de atendimentos em urgência, comparados com o mesmo mês do ano anterior. A SPMS só publica estes dados por mês; o boletim verifica-os todos os dias.</p>
          </div>
          {U.length ? (
            <div className="grid g-map">
              <article className="card">
                <UlsMap rows={U} />
                <Fonte ids={["obitosInst", "urgUls", "tempos", "osm"]} />
              </article>
              <article className="card table-card">
                <h3>Indicadores por ULS</h3>
                <div className="table-wrap">
                  <table className="uls-table">
                    <caption className="sr-only">Óbitos e urgências por ULS no último mês publicado</caption>
                    <thead>
                      <tr><th scope="col">ULS</th><th scope="col">Óbitos (SICO)</th><th scope="col">Urgências</th><th scope="col">Triagem V+L</th></tr>
                    </thead>
                    <tbody>
                      {U.map((r) => (
                        <tr key={r.key}>
                          <th scope="row">{r.nome}</th>
                          {([[r.obitos, "Óbitos (SICO)"], [r.urgencias, "Urgências"]] as const).map(([m, lbl]) => (
                            <td key={lbl} data-label={lbl}>
                              <span className="num">{fmt(m.valor)}</span>
                              {m.varPct != null && <small> {m.varPct >= 0 ? "▲" : "▼"} {fmt(Math.abs(m.varPct), 0)}%</small>}
                              {" "}<Chip level={m.level} label={m.suspeito ? "A rever" : undefined} />
                            </td>
                          ))}
                          <td data-label="Triagem V+L">{r.pctGrave != null ? `${fmt(r.pctGrave, 1)}%` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="hint">
                  Óbitos: {U[0].obitos.mes ? fmtDate(`${U[0].obitos.mes}-15`, { month: "long", year: "numeric" }) : "—"} · Urgências: {U[0].urgencias.mes ? fmtDate(`${U[0].urgencias.mes}-15`, { month: "long", year: "numeric" }) : "—"}.
                  Variação face ao mesmo mês do ano anterior. V+L = % de atendimentos com triagem vermelha ou laranja.
                  Os óbitos SICO contam só os certificados emitidos nas unidades da ULS (sobretudo óbitos hospitalares), não a residência.
                </p>
                <Fonte ids={["obitosInst", "urgUls", "manchester"]} />
              </article>
            </div>
          ) : (
            <p className="hint">Fonte indisponível neste momento.</p>
          )}
        </section>

        {/* METEOROLOGIA */}
        <section id="meteorologia" aria-labelledby="h-met">
          <div className="section-head">
            <h2 id="h-met">Meteorologia e temperatura</h2>
            <p>Avisos e previsão do IPMA; temperatura observada (Open-Meteo); índices FRIESA (frio) e ÍCARO (calor) do INSA.</p>
          </div>
          <div className="grid g-2">
            <article className="card">
              <h3>Avisos IPMA · distritos do Norte</h3>
              {av.length ? (
                <ul className="avisos" style={{ marginTop: 12 }}>
                  {av.map((a, i) => (
                    <li key={i} className="aviso">
                      <span className="sw" style={{ background: AVISO_COR[a.nivel] }} aria-hidden="true" />
                      <span>
                        <b>{a.distrito}</b> · {a.tipo} · <b>{AVISO_TXT[a.nivel]}</b>
                        <br />
                        <small>{fmtDate(a.inicio, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} → {fmtDate(a.fim, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</small>
                        {a.texto && <><br /><small>{a.texto}</small></>}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="hint" style={{ marginTop: 8 }}>{isCurrent ? "Sem avisos amarelos, laranja ou vermelhos neste momento." : "O IPMA não publica histórico de avisos: só aparecem quando o período inclui hoje."}</p>
              )}
              {forecast.value && (
                <>
                  <h3 style={{ marginTop: 20 }}>Previsão IPMA · Porto</h3>
                  <div className="forecast">
                    {forecast.value.slice(0, 5).map((d) => (
                      <div className="fc" key={d.date}>
                        <b>{fmtDate(d.date, { weekday: "short" })}</b>
                        <span className="tmax">{fmt(d.tMax)}°</span> / <span className="tmin">{fmt(d.tMin)}°</span>
                        <div><small>chuva {fmt(d.precipProb)}%</small></div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <Fonte ids={["ipmaAvisos", "ipmaPrev"]} />
            </article>
            <article className="card">
              <h3>Temperatura no Porto · {range ? "período escolhido" : "últimos 45 dias e próximos 7"}</h3>
              {meteoRange?.length ? <MeteoChart data={meteoRange} today={today} /> : <p className="hint">{range ? "Sem temperatura observada para este período (a fonte só guarda os últimos 45 dias)." : "Fonte indisponível."}</p>}
              <Fonte ids={["meteo"]} />
            </article>
            <article className="card">
              <h3>Índice FRIESA · Porto (65+ anos)</h3>
              <p className="hint">Impacto previsto do frio na mortalidade. Publicado sobretudo entre novembro e março.</p>
              {friesa.value?.mais65.length ? <SimpleLine data={range ? inRange(friesa.value.mais65) : friesa.value.mais65.filter((p) => p.date >= sinceShort)} unit="" label="Índice FRIESA Porto 65+" color="var(--c4)" /> : <p className="hint">Sem dados.</p>}
              <Fonte ids={["friesa"]} />
            </article>
            <article className="card">
              <h3>Índice ÍCARO · calor</h3>
              <p className="hint">Impacto previsto do calor na mortalidade. Publicado sobretudo entre maio e setembro.</p>
              {icaroRecent.length ? <SimpleLine data={icaroRecent} unit="" label="Índice ÍCARO" color="var(--c3)" /> : <p className="hint">Sem dados.</p>}
              <Fonte ids={["icaro"]} />
            </article>
          </div>
        </section>

        {/* DADOS LOCAIS */}
        {L && (
          <section id="local" aria-labelledby="h-local">
            <div className="section-head">
              <h2 id="h-local">Dados locais do SU · {fmtDate(L.first, { month: "short", year: "numeric" })} – {fmtDate(L.last, { month: "short", year: "numeric" })}</h2>
              <p>A partir do ficheiro Excel de afluência ao SU ({L.kpis.dias} dias). Os padrões abaixo são detetados automaticamente.</p>
            </div>
            <div className="grid g-kpi" style={{ marginBottom: 16 }}>
              {[
                ["Média diária", fmt(L.kpis.mediaDiaria), "episódios"],
                ["Total de episódios", fmt(L.kpis.totalEpisodios), ""],
                ["Taxa de internamento", fmt(L.kpis.pctInternamento, 1), "%"],
                ["Triagem → 1.ª observação", fmt(L.kpis.tempoTriagem), "min"],
                ["Utentes com 80+ anos", fmt(L.kpis.pct80, 1), "%"],
                ["Infeções respiratórias agudas", fmt(L.kpis.respiratorias), "diagnósticos"],
              ].map(([k, v, u]) => (
                <div key={k} className="card kpi">
                  <span className="kpi-label">{k}</span>
                  <div className="kpi-value">{v}<small>{u}</small></div>
                </div>
              ))}
            </div>

            <div className="patterns" style={{ marginBottom: 16 }}>
              {L.patterns.map((p) => (
                <article key={p.id} className={`pattern lv-${p.level}`}>
                  <Chip level={p.level} />
                  <h3>{p.title}</h3>
                  <p>{p.detail}</p>
                </article>
              ))}
            </div>

            <div className="grid">
              <article className="card">
                <h3>Afluência diária e temperatura média</h3>
                <LocalDailyChart data={L.daily} />
                  <Fonte ids={["local"]} extra={`Ficheiro ${local.source}`} />
              </article>
              <div className="grid g-2">
                <article className="card">
                  <h3>Diagnósticos infecciosos por semana</h3>
                  <WeeklyDiagChart data={L.weekly} />
                  <Fonte ids={["local"]} extra={`Ficheiro ${local.source}`} />
                </article>
                <article className="card">
                  <h3>Média de episódios por dia da semana</h3>
                  <DowChart data={L.byDow} />
                  <Fonte ids={["local"]} extra={`Ficheiro ${local.source}`} />
                </article>
                <article className="card">
                  <h3>Distribuição por grupo etário</h3>
                  <HBarChart data={L.idades} x="pct" y="grupo" label="Percentagem de episódios por grupo etário" />
                  <Fonte ids={["local"]} extra={`Ficheiro ${local.source}`} />
                </article>
                <article className="card">
                  <h3>Área de residência</h3>
                  <HBarChart data={L.origens} x="pct" y="origem" label="Percentagem de episódios por área de residência" />
                  <Fonte ids={["local"]} extra={`Ficheiro ${local.source}`} />
                </article>
              </div>
            </div>
          </section>
        )}

        {/* METODOLOGIA */}
        <section id="metodologia" aria-labelledby="h-met2">
          <div className="section-head">
            <h2 id="h-met2">Metodologia e fontes</h2>
            <p>Todas as fontes são públicas e gratuitas. Se uma falhar, o boletim mostra as restantes.</p>
          </div>
          <div className="sources" style={{ marginBottom: 16 }}>
            {statuses.map((s) => (
              <div key={s.id} className="src">
                <span className="st" style={{ background: s.ok ? "var(--ok)" : "var(--bad)" }} aria-hidden="true" />
                <span>
                  <a href={s.url} target={s.url.startsWith("http") ? "_blank" : undefined} rel="noreferrer">{s.name}</a>
                  <small>{s.ok ? `Disponível${s.lastDate ? ` · último dado ${s.lastDate}` : ""}` : `Indisponível (${s.error})`}</small>
                </span>
              </div>
            ))}
          </div>
          <details className="method">
            <summary>Como são calculados os alertas</summary>
            <div>
              <p><b>Linha de base sazonal.</b> Para cada dia da época (1 de outubro a 30 de setembro) calcula-se a média e o desvio-padrão da média móvel de 7 dias nas 5 épocas anteriores, numa janela de ±7 dias.</p>
              <p><b>Níveis.</b> z = (média dos últimos 7 dias − média esperada) ÷ desvio-padrão. <b>Normal</b> se z &lt; 1; <b>Atenção</b> se 1 ≤ z &lt; 2; <b>Alerta</b> se z ≥ 2. Indicadores sem dados recentes aparecem como “Sem dados”.</p>
              <p><b>Dados locais.</b> Um dia é anómalo quando o número de episódios ultrapassa a média + 2 desvios-padrão para o mesmo dia da semana. A associação entre temperatura e infeções respiratórias usa a correlação de Pearson com desfasamentos de 0 a 14 dias.</p>
              <p><b>Inteligência artificial.</b> Um modelo de linguagem open-source (Llama 3.3 ou Qwen 2.5) recebe apenas os números já calculados e redige a síntese. A IA não decide níveis de alerta. Sem chave de API configurada, o texto é gerado por regras.</p>
              <p><b>Mapa por ULS.</b> Óbitos: contagem mensal de certificados SICO por instituição, somada por ULS; o nível usa um teste de Poisson face ao mesmo mês do ano anterior (<b>Atenção</b> z ≥ 2, <b>Alerta</b> z ≥ 3). Urgências: a SPMS publica valores acumulados no ano, convertidos aqui em mensais; <b>Atenção</b> ≥ +10 %, <b>Alerta</b> ≥ +20 % face ao mesmo mês. O mês corrente (incompleto) é ignorado.</p>
              <p><b>Atualização.</b> Além do ISR de 3 em 3 horas, um cron diário da Vercel (07:00 UTC) invalida o cache e volta a recolher todas as fontes.</p>
              <p><b>Limitações.</b> Os dados do SNS Transparência são provisórios e podem ser revistos. Os índices FRIESA e ÍCARO são sazonais. A correlação não implica causalidade.</p>
            </div>
          </details>
        </section>
      </main>

      <footer>
        <div className="wrap">
          Boletim produzido automaticamente para apoio à vigilância em Saúde Pública. Fontes: SNS Transparência (SPMS), INSA, DGS, IPMA, Open-Meteo. Não substitui a avaliação da Autoridade de Saúde.
        </div>
      </footer>
    </>
  );
}
