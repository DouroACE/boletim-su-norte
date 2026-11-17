import {
  fetchNorte, fetchFriesaPorto, fetchIcaro, fetchManchester, fetchIpmaForecast, fetchIpmaAvisos, fetchMeteo, fetchQualidadeAr, fetchUlsNorte, fetchUlssaMensal, fetchObitosDiarios,
  PORTO, GONDOMAR, FONTES, safe, type Point, type SourceStatus, type FonteId,
} from "@/lib/sources";
import { seasonOf, seasonalBaseline, rolling, dayOfSeason, addDays, type Level } from "@/lib/stats";
import { analyseLocal, local } from "@/lib/local";
import { aiSummary } from "@/lib/ai";
import { regionalFlags, historySince, parseRange, rangeQuery, type Range } from "@/lib/flags";
import { DateFilter } from "@/components/date-filter";
import { Chip, LevelIcon, LEVEL_TEXT, Sparkline, Fonte, fmt, fmtDate } from "@/components/ui";
import { SeasonChart, MeteoChart, LocalDailyChart, WeeklyDiagChart, HBarChart, DowChart, ManchesterChart, SimpleLine, MonthlyBars, type SeasonRow, type MeteoRow } from "@/components/charts";
import { DGS_TEXT, dgsLevel, dgsToLevel, worstOf, uvLabel, airLabel, polenDia, ateMes, LIMIAR_OCUPACAO, LIMIAR_PROCURA, type DgsLevel, type AirDay } from "@/lib/risk";
import { compareHomologous } from "@/lib/uls";

export const revalidate = 10800; // 3 h — ISR: a página reconstrói-se sozinha com dados novos

const INSTITUICAO = process.env.INSTITUICAO_SNS || "Unidade Local de Saúde de Santo António, EPE";
const REGIAO = process.env.REGIAO_ARS || "ARS Norte";
const SNS_URL = "https://transparencia.sns.gov.pt/explore/dataset/";
const ULSSA = "santo-antonio";
const REG_IDS = ["episodios", "resp", "internamento", "triagem"];
const KPI_FONTE: Record<string, FonteId> = { internamento: "sazonal", friesa: "friesa", obitos: "obitos" };

const lastOf = (p: Point[] | null | undefined) => p?.at(-1)?.date;
const mesExtenso = (m: string | null | undefined) => (m ? fmtDate(`${m}-15`, { month: "long", year: "numeric" }) : "—");
const mesCurto = (m: string) => fmtDate(`${m}-15`, { month: "short", year: "2-digit" });
const pctTxt = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : `${v >= 0 ? "▲" : "▼"} ${fmt(Math.abs(v), 1)}%`);
const dgsBadge = (l: DgsLevel | null) => (l == null ? <span className="muted">Sem dados</span> : <span className={`dgs-badge dgs-${l}`}>N{l} · {DGS_TEXT[l]}</span>);

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
const worst = (ls: Level[]) => worstOf(ls);

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const range = parseRange(await searchParams, today);
  const inRange = (pts: Point[]) => (range ? pts.filter((p) => p.date >= range.from && p.date <= range.to) : pts);
  const isCurrent = !range || range.to >= today; // avisos e previsão do IPMA só fazem sentido para o presente
  const season = seasonOf(range?.to ?? today);
  const since = historySince(range?.from ?? today);
  const sinceShort = `${season.start - 1}-10-01`;
  const limite = range?.to.slice(0, 7) ?? null;

  const [norte, friesa, icaro, obitos, manchester, forecast, avisos, meteoP, meteoG, arP, arG, uls, ulssa] = await Promise.all([
    safe({ id: "sns-urg", name: `SNS Transparência — Vigilância sazonal das urgências, ${REGIAO} (contexto regional)`, url: `${SNS_URL}atividade-sindrome-gripal-csh/` }, () => fetchNorte(since, REGIAO), (v) => lastOf(v.episodios)),
    safe({ id: "friesa", name: "Índice FRIESA — impacto do frio, Porto (INSA)", url: `${SNS_URL}indice-friesa/` }, () => fetchFriesaPorto(since), (v) => lastOf(v.mais65)),
    safe({ id: "icaro", name: "Índice ÍCARO — impacto do calor (INSA)", url: `${SNS_URL}evolucao-diaria-do-indice-icaro/` }, () => fetchIcaro(sinceShort), lastOf),
    safe({ id: "obitos", name: "Óbitos por dia — Região Norte (eVM, DGS); alternativa: SICO nacional", url: "https://evm.min-saude.pt/" }, () => fetchObitosDiarios(since), (v) => lastOf(v.pontos)),
    safe({ id: "manchester", name: `Atendimentos por triagem de Manchester — ${INSTITUICAO.replace(", EPE", "")}`, url: `${SNS_URL}atendimentos-em-urgencia-triagem-manchester/` }, () => fetchManchester(INSTITUICAO, `${season.start - 1}-10`), (v) => v.at(-1)?.mes),
    safe({ id: "ipma-prev", name: "IPMA — Previsão diária, Porto", url: "https://api.ipma.pt/" }, () => fetchIpmaForecast(), (v) => v[0]?.date),
    safe({ id: "ipma-avisos", name: "IPMA — Avisos meteorológicos, distrito do Porto", url: "https://www.ipma.pt/pt/otempo/prev-sam/" }, () => fetchIpmaAvisos(), () => today),
    safe({ id: "meteo-porto", name: "Open-Meteo — Temperatura e UV, Porto", url: "https://open-meteo.com/" }, () => fetchMeteo(PORTO.lat, PORTO.lon), () => today),
    safe({ id: "meteo-gondomar", name: "Open-Meteo — Temperatura e UV, Gondomar", url: "https://open-meteo.com/" }, () => fetchMeteo(GONDOMAR.lat, GONDOMAR.lon), () => today),
    safe({ id: "ar-porto", name: "Open-Meteo — Qualidade do ar e pólen, Porto", url: "https://open-meteo.com/en/docs/air-quality-api" }, () => fetchQualidadeAr(PORTO.lat, PORTO.lon), () => today),
    safe({ id: "ar-gondomar", name: "Open-Meteo — Qualidade do ar e pólen, Gondomar", url: "https://open-meteo.com/en/docs/air-quality-api" }, () => fetchQualidadeAr(GONDOMAR.lat, GONDOMAR.lon), () => today),
    safe({ id: "uls", name: "SNS Transparência — Urgências e óbitos SICO por ULS, Região Norte (mensal)", url: `${SNS_URL}certificados-de-obito-por-instituicao-de-saude/` }, () => fetchUlsNorte(today, range?.to), (v) => v.map((r) => r.obitos.mes ?? "").sort().at(-1)),
    safe({ id: "ulssa", name: "SNS Transparência — Ocupação hospitalar e consultas CSP, ULS Santo António (mensal)", url: FONTES.ocupacao.url }, () => fetchUlssaMensal(today), (v) => v.ocupacao.at(-1)?.mes),
  ]);

  /* ---------- dados da ULSSA (último mês publicado, até ao fim do filtro) ---------- */
  const U = uls.value ?? [];
  const urgRow = U.find((r) => r.key === ULSSA);
  const urg = urgRow?.urgencias;
  const obt = urgRow?.obitos;
  const M = ulssa.value;
  const ocup = ateMes(M?.ocupacao ?? [], limite).filter((s) => Number.isFinite(s.valor)).at(-1) ?? null;
  const ocupSeries = ateMes(M?.ocupacao ?? [], limite).slice(-24);
  const cspSeries = ateMes(M?.cspPresenciais ?? [], limite);
  const csp = compareHomologous(cspSeries, "pct");
  const procuraLevel: DgsLevel | null = urg && urg.varPct != null && !urg.suspeito ? dgsLevel(urg.varPct, LIMIAR_PROCURA) : null;
  const ocupLevel: DgsLevel | null = ocup ? dgsLevel(ocup.valor, LIMIAR_OCUPACAO) : null;

  /* ---------- sinais regionais (contexto) e os que pesam na situação ---------- */
  const N = norte.value;
  const regional = regionalFlags(N, friesa.value?.mais65 ?? [], obitos.value?.pontos ?? [], today, range, obitos.value?.norte);
  const flagsFoco = regional.filter((f) => f.id === "friesa" || f.id === "obitos");
  const flagFriesa = regional.find((f) => f.id === "friesa");
  const flagObitos = regional.find((f) => f.id === "obitos");
  const series: Record<string, Point[]> = {
    episodios: N?.episodios ?? [],
    resp: N?.pctRespiratoria ?? [],
    internamento: N?.pctInternamento ?? [],
    triagem: N?.tempoTriagem ?? [],
    friesa: friesa.value?.mais65 ?? [],
    obitos: obitos.value?.pontos ?? [],
  };
  const avisosPto = isCurrent && avisos.value ? avisos.value.filter((a) => a.distrito === "Porto") : null;
  const L = analyseLocal();
  const summary = await aiSummary(flagsFoco, avisosPto ?? [], L?.patterns ?? []);

  type Sinal = { label: string; level: Level; texto: string };
  const sinais: Sinal[] = [
    { label: "Procura do SU (ULS Santo António)", level: dgsToLevel(procuraLevel), texto: urg?.valor != null ? `${mesExtenso(urg.mes)}: ${fmt(urg.valor)} atendimentos${urg.varPct != null ? `, ${pctTxt(urg.varPct)} face ao mesmo mês do ano anterior` : ""}` : "sem dados publicados" },
    { label: "Ocupação hospitalar (ULS Santo António)", level: dgsToLevel(ocupLevel), texto: ocup ? `${mesExtenso(ocup.mes)}: ${fmt(ocup.valor, 1)} %` : "sem dados publicados" },
  ];
  if (avisosPto) {
    sinais.push({
      label: "Avisos IPMA (distrito do Porto)",
      // Só os avisos de temperatura (tempo quente/frio) sobem a situação; os restantes (agitação marítima, vento…) ficam como contexto.
      level: worst(["normal", ...avisosPto.filter((a) => /quente|frio/i.test(a.tipo)).map((a): Level => (a.nivel === "yellow" ? "atencao" : "alerta"))]),
      texto: avisosPto.length ? avisosPto.map((a) => `${a.tipo} ${AVISO_TXT[a.nivel].toLowerCase()}`).join("; ") : "sem avisos amarelos, laranja ou vermelhos",
    });
  }
  if (flagFriesa) sinais.push({ label: "Índice FRIESA (Porto, 65+)", level: flagFriesa.level, texto: flagFriesa.current != null ? `média dos últimos 7 dias ${fmt(flagFriesa.current, 1)}` : "sem dados recentes" });
  const situacao = worst(sinais.map((s) => s.level));

  const epiRows = N ? seasonRows(N.episodios, season.start, range) : [];
  const respRows = N ? seasonRows(N.pctRespiratoria, season.start, range) : [];
  const icaroRecent = range ? inRange(icaro.value ?? []) : (icaro.value ?? []).filter((p) => p.date >= `${season.start - 1}-05-01`);

  // Temperatura Porto + Gondomar, pelo mesmo dia
  const gByDate = new Map((meteoG.value ?? []).map((d) => [d.date, d]));
  const meteoRows: MeteoRow[] = (meteoP.value ?? []).map((d) => ({ date: d.date, tMin: d.tMin, tMax: d.tMax, precip: d.precip, gMin: gByDate.get(d.date)?.tMin ?? null, gMax: gByDate.get(d.date)?.tMax ?? null }));
  const meteoRange = range ? meteoRows.filter((d) => d.date >= range.from && d.date <= range.to) : meteoRows;
  const uvDias = (meteoP.value ?? []).filter((d) => d.date >= today).slice(0, 5);

  // Qualidade do ar: hoje e dois dias seguintes
  const dias = [today, addDays(today, 1), addDays(today, 2)];
  const diaLabel = (d: string) => (d === today ? "hoje" : fmtDate(d, { weekday: "short", day: "numeric", month: "short" }));
  const arLinhas: { lugar: string; dia: string; d: AirDay | undefined }[] = [];
  for (const [lugar, ar] of [["Porto", arP.value], ["Gondomar", arG.value]] as const) for (const dia of dias) arLinhas.push({ lugar, dia, d: ar?.[dia] });

  const statuses: SourceStatus[] = [norte, friesa, icaro, obitos, manchester, forecast, avisos, meteoP, meteoG, arP, arG, uls, ulssa].map((s) => s.status);
  statuses.push({ id: "excel", name: `Dados locais do SU (${local.source})`, url: "#local", ok: !!L, lastDate: L?.last });

  return (
    <>
      <a className="skip" href="#conteudo">Saltar para o conteúdo</a>
      <header className="masthead">
        <div className="wrap">
          <div>
            <div className="eyebrow">Saúde Pública · ULS Santo António</div>
            <h1>Boletim de Vigilância Sazonal</h1>
            <p className="sub">
              Procura das urgências, ocupação hospitalar, consultas, mortalidade, temperatura e avisos para Gondomar e Porto Ocidental. Época {season.label}. Os dados públicos atualizam-se sozinhos.
            </p>
          </div>
          <div className="meta">
            <span>Atualizado a <strong>{now.toLocaleString("pt-PT", { timeZone: "Europe/Lisbon", dateStyle: "long", timeStyle: "short" })}</strong></span>
            <span>Último mês publicado da ULSSA <strong>{mesExtenso(urg?.mes ?? ocup?.mes)}</strong></span>
            <span>Nova recolha automática a cada 3 horas</span>
          </div>
        </div>
      </header>

      <nav className="toc" aria-label="Secções do site">
        <div className="wrap">
          <ul>
            <li><a href={`/${rangeQuery(range)}`} aria-current="page">Boletim</a></li>
            <li><a href={`/painel${rangeQuery(range)}`}>Painel de risco →</a></li>
            <li><a href="/analise">Vigilância da equipa →</a></li>
            <li><a href="/alertas">Alertas →</a></li>
            <li><a href="/relatorios">Relatórios →</a></li>
            <li><a href={`/flags-ia${rangeQuery(range)}`}>Flags de IA →</a></li>
            <li><a href={`/exportar${rangeQuery(range)}`}>Exportar →</a></li>
          </ul>
        </div>
      </nav>

      <main id="conteudo" className="wrap">
        <DateFilter range={range} today={today} path="/" />

        {/* RESUMO */}
        <section id="resumo" aria-labelledby="h-resumo" className="grid">
          <h2 id="h-resumo" className="sr-only">Resumo</h2>
          <div className={`status lv-${situacao}`}>
            <div className="status-badge">
              <div className="dot"><span style={{ width: 26, height: 26, display: "block" }}><LevelIcon level={situacao} /></span></div>
              <div>
                <div className="lv">Situação ULS Santo António: {LEVEL_TEXT[situacao]}</div>
                <div className="lv-sub">Urgências e ocupação da ULSSA, avisos IPMA do distrito do Porto e índice FRIESA. Os indicadores regionais não entram.</div>
              </div>
            </div>
            <ul>
              {sinais.filter((s) => s.level === "alerta" || s.level === "atencao").map((s) => (
                <li key={s.label}><b>{s.label}</b> — {LEVEL_TEXT[s.level].toLowerCase()}: {s.texto}</li>
              ))}
              {!sinais.some((s) => s.level === "alerta" || s.level === "atencao") && <li>Sem sinais acima do esperado para esta altura do ano.</li>}
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
            <Fonte ids={["friesa", obitos.value?.norte ? "evm" : "obitos", "ipmaAvisos"]} extra={summary.generated === "ia" ? `Texto redigido por ${summary.model} a partir destes números` : undefined} />
          </article>
        </section>

        {/* ULS SANTO ANTÓNIO */}
        <section id="ulssa" aria-labelledby="h-ulssa">
          <div className="section-head">
            <h2 id="h-ulssa">ULS Santo António · Gondomar e Porto Ocidental</h2>
            <p>Dados mensais publicados pela SPMS, com 1 a 3 meses de atraso: mostra-se o último mês publicado. Não há série diária pública por ULS.</p>
          </div>
          <div className="grid g-kpi">
            <article className="card kpi" aria-labelledby="k-urg">
              <div className="kpi-top"><span id="k-urg" className="kpi-label">Atendimentos em urgência</span>{dgsBadge(procuraLevel)}</div>
              <div className="kpi-value">{fmt(urg?.valor)}<small>atendimentos</small></div>
              <div className="kpi-delta">
                {urg?.varPct != null ? <><b>{pctTxt(urg.varPct)}</b> vs. {mesExtenso(urg.mes ? `${Number(urg.mes.slice(0, 4)) - 1}${urg.mes.slice(4)}` : null)} (ano anterior: {fmt(urg.homologo)})</> : "—"}
              </div>
              <p className="kpi-note">Último mês publicado: {mesExtenso(urg?.mes)}. Níveis DGS para a procura do SU: 10 %, 25 % e 50 % face ao mesmo mês do ano anterior.{urg?.suspeito ? " A rever: a SPMS repetiu um mês na publicação." : ""}</p>
              <Fonte ids={["urgUls"]} />
            </article>

            <article className="card kpi" aria-labelledby="k-ocup">
              <div className="kpi-top"><span id="k-ocup" className="kpi-label">Taxa de ocupação hospitalar</span>{dgsBadge(ocupLevel)}</div>
              <div className="kpi-value">{fmt(ocup?.valor, 1)}<small>%</small></div>
              <div className="kpi-delta">{ocup ? `Mês de ${mesExtenso(ocup.mes)}` : "—"}{M?.lotacao != null && <> · lotação praticada: {fmt(M.lotacao)} camas</>}</div>
              <p className="kpi-note">Dias de internamento ÷ (lotação × dias do mês). Níveis DGS: 85 %, 95 % e 105 %.</p>
              <Fonte ids={["ocupacao"]} />
            </article>

            <article className="card kpi" aria-labelledby="k-csp">
              <div className="kpi-top"><span id="k-csp" className="kpi-label">Consultas médicas CSP presenciais</span></div>
              <div className="kpi-value">{fmt(csp.valor)}<small>consultas</small></div>
              <div className="kpi-delta">
                {csp.varPct != null ? <><b>{pctTxt(csp.varPct)}</b> vs. mesmo mês do ano anterior ({fmt(csp.homologo)})</> : "—"}
              </div>
              <p className="kpi-note">Último mês publicado: {mesExtenso(csp.mes)}. Consultas dos CSP da ULSSA, sem nível de risco associado.</p>
              <Fonte ids={["csp"]} />
            </article>

            <article className="card kpi" aria-labelledby="k-obt">
              <div className="kpi-top"><span id="k-obt" className="kpi-label">Óbitos certificados (SICO)</span>{obt && <Chip level={obt.level} />}</div>
              <div className="kpi-value">{fmt(obt?.valor)}<small>óbitos</small></div>
              <div className="kpi-delta">
                {obt?.homologo != null ? <>Mesmo mês do ano anterior: {fmt(obt.homologo)}</> : "—"}
              </div>
              <p className="kpi-note">Certificados emitidos nas unidades da ULSSA (sobretudo óbitos hospitalares), não a residência. Teste de Poisson face ao mesmo mês do ano anterior.</p>
              <Fonte ids={["obitosInst"]} />
            </article>
          </div>

          <div className="grid g-2" style={{ marginTop: 16 }}>
            <article className="card">
              <h3>Taxa de ocupação hospitalar por mês</h3>
              <p className="hint">Últimos 24 meses publicados. Linhas de referência: 85 % e 95 % (DGS).</p>
              {ocupSeries.length ? (
                <MonthlyBars data={ocupSeries} unit="%" digits={1} title="Taxa de ocupação hospitalar mensal da ULS Santo António, últimos 24 meses, com referências a 85 % e 95 %" refs={[{ y: 85, label: "85 %" }, { y: 95, label: "95 %" }]} />
              ) : <p className="hint">Fonte indisponível.</p>}
              <Fonte ids={["ocupacao"]} />
            </article>
            <article className="card">
              <h3>Consultas médicas presenciais nos CSP por mês</h3>
              <p className="hint">Últimos 24 meses publicados.</p>
              {cspSeries.length ? (
                <MonthlyBars data={cspSeries.slice(-24)} unit="consultas" title="Consultas médicas presenciais nos cuidados de saúde primários da ULS Santo António, por mês, últimos 24 meses" />
              ) : <p className="hint">Fonte indisponível.</p>}
              <Fonte ids={["csp"]} />
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

        {/* MORTALIDADE */}
        <section id="mortalidade" aria-labelledby="h-mort">
          <div className="section-head">
            <h2 id="h-mort">Mortalidade · Região Norte</h2>
            <p>Região Norte (eVM) — não há série diária pública por ACeS; usar o ficheiro da equipa na página Vigilância.</p>
          </div>
          <article className="card">
            <h3>{obitos.value?.norte ? "Óbitos por dia · Região Norte (eVM)" : "Óbitos certificados por dia · Portugal (SICO)"}</h3>
            {!obitos.value?.norte && <p className="hint">eVM indisponível: a mostrar os certificados de óbito de Portugal.</p>}
            {flagObitos && (
              <p className="hint" style={{ marginTop: 6 }}>
                <Chip level={flagObitos.level} /> Média dos últimos 7 dias: <b>{fmt(flagObitos.current, 1)}</b> por dia · esperado para esta altura: {fmt(flagObitos.baselineMean, 1)}
              </p>
            )}
            {series.obitos.length ? (
              <SimpleLine data={range ? inRange(series.obitos) : series.obitos.filter((p) => p.date >= sinceShort)} unit="óbitos" label={obitos.value?.norte ? "Óbitos diários, Região Norte (eVM)" : "Óbitos certificados diários, Portugal (SICO)"} color="var(--c2)" digits={0} />
            ) : <p className="hint">Fonte indisponível.</p>}
            <Fonte ids={[obitos.value?.norte ? "evm" : "obitos"]} />
          </article>
        </section>

        {/* METEOROLOGIA E AMBIENTE */}
        <section id="meteorologia" aria-labelledby="h-met">
          <div className="section-head">
            <h2 id="h-met">Meteorologia e ambiente</h2>
            <p>Porto e Gondomar: temperatura, UV, qualidade do ar e pólen (Open-Meteo). Avisos e previsão do IPMA para o distrito do Porto, que inclui os dois concelhos. Índices FRIESA e ÍCARO do INSA.</p>
          </div>
          <div className="grid g-2">
            <article className="card">
              <h3>Avisos IPMA · distrito do Porto</h3>
              {avisosPto?.length ? (
                <ul className="avisos" style={{ marginTop: 12 }}>
                  {avisosPto.map((a, i) => (
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
                <p className="hint" style={{ marginTop: 8 }}>{isCurrent ? (avisos.value ? "Sem avisos amarelos, laranja ou vermelhos neste momento." : "Fonte indisponível neste momento.") : "O IPMA não publica histórico de avisos: só aparecem quando o período inclui hoje."}</p>
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
              <h3>Temperatura · Porto e Gondomar</h3>
              <p className="hint">{range ? "Período escolhido." : "Últimos 45 dias e próximos 7."} Porto em linha contínua, Gondomar tracejado.</p>
              {meteoRange.length ? <MeteoChart data={meteoRange} today={today} /> : <p className="hint">{range ? "Sem temperatura observada para este período (a fonte só guarda os últimos 45 dias)." : "Fonte indisponível."}</p>}
              <Fonte ids={["meteo"]} />
            </article>

            <article className="card">
              <h3>Índice UV máximo previsto</h3>
              <p className="hint">Escala da OMS: baixo (0–2), moderado (3–5), elevado (6–7), muito elevado (8–10), extremo (11+).</p>
              {uvDias.length ? (
                <div className="table-wrap">
                  <table className="uls-table">
                    <caption className="sr-only">Índice UV máximo diário, Porto e Gondomar</caption>
                    <thead><tr><th scope="col">Dia</th><th scope="col">Porto</th><th scope="col">Gondomar</th></tr></thead>
                    <tbody>
                      {uvDias.map((d) => {
                        const g = gByDate.get(d.date);
                        return (
                          <tr key={d.date}>
                            <th scope="row">{diaLabel(d.date)}</th>
                            <td data-label="Porto"><span className="num">{fmt(d.uvMax, 1)}</span> <small>{uvLabel(d.uvMax)}</small></td>
                            <td data-label="Gondomar"><span className="num">{fmt(g?.uvMax, 1)}</span> <small>{uvLabel(g?.uvMax)}</small></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : <p className="hint">Fonte indisponível.</p>}
              <Fonte ids={["meteo"]} />
            </article>

            <article className="card">
              <h3>Qualidade do ar e pólen · hoje e próximos 2 dias</h3>
              <p className="hint">Valores máximos do dia. Classificação aproximada, pela escala europeia para o ar e uma escala indicativa para o pólen.</p>
              {arP.value || arG.value ? (
                <div className="table-wrap">
                  <table className="uls-table">
                    <caption className="sr-only">Qualidade do ar e pólen para Porto e Gondomar, hoje e nos dois dias seguintes</caption>
                    <thead><tr><th scope="col">Local e dia</th><th scope="col">PM10</th><th scope="col">PM2,5</th><th scope="col">Ozono</th><th scope="col">Pólen</th></tr></thead>
                    <tbody>
                      {arLinhas.map(({ lugar, dia, d }) => {
                        const p = d ? polenDia(d) : null;
                        return (
                          <tr key={`${lugar}-${dia}`}>
                            <th scope="row">{lugar} · {diaLabel(dia)}</th>
                            <td data-label="PM10"><span className="num">{airLabel("pm10", d?.pm10)}</span> <small>{d?.pm10 != null ? `${fmt(d.pm10)} µg/m³` : ""}</small></td>
                            <td data-label="PM2,5"><span className="num">{airLabel("pm2_5", d?.pm2_5)}</span> <small>{d?.pm2_5 != null ? `${fmt(d.pm2_5)} µg/m³` : ""}</small></td>
                            <td data-label="Ozono"><span className="num">{airLabel("ozone", d?.ozone)}</span> <small>{d?.ozone != null ? `${fmt(d.ozone)} µg/m³` : ""}</small></td>
                            <td data-label="Pólen"><span className="num">{p?.label ?? "Sem dados"}</span> <small>{p?.tipo ? `(${p.tipo})` : ""}</small></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : <p className="hint">Fonte indisponível.</p>}
              <Fonte ids={["ar"]} />
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

        {/* CONTEXTO REGIONAL — colapsado; não entra na situação */}
        <section id="regional" aria-label="Contexto regional (ARS Norte)">
          <details className="method">
            <summary>Contexto regional (ARS Norte)</summary>
            <div>
              <p className="hint">Indicadores da Região Norte, não da ULS Santo António. Não entram na situação do topo nem no nível de risco do painel.</p>
              {N ? (
                <>
                  <div className="grid g-kpi">
                    {regional.filter((f) => REG_IDS.includes(f.id)).map((f) => (
                      <article key={f.id} className="card kpi" aria-labelledby={`rk-${f.id}`}>
                        <div className="kpi-top">
                          <span id={`rk-${f.id}`} className="kpi-label">{f.label}</span>
                          <Chip level={f.level} />
                        </div>
                        <div className="kpi-value">
                          {fmt(f.current, f.unit === "%" || f.unit === "" ? 1 : 0)}
                          <small>{f.unit}</small>
                        </div>
                        <div className="kpi-delta">
                          {f.changePct != null ? <><b>{f.changePct > 0 ? "▲" : "▼"} {fmt(Math.abs(f.changePct), 1)}%</b> vs. {range ? "período anterior" : "semana anterior"}</> : "—"}
                          {f.baselineMean != null && <> · esperado {fmt(f.baselineMean, f.unit === "%" || f.unit === "" ? 1 : 0)}</>}
                        </div>
                        <Sparkline values={(range ? inRange(series[f.id]) : series[f.id].slice(-60)).map((p) => p.value)} label={`Evolução ${range ? "no período escolhido" : "dos últimos 60 dias"}: ${f.label}`} />
                        <p className="kpi-note">{f.note}</p>
                        <Fonte ids={[KPI_FONTE[f.id] ?? "gripal"]} />
                      </article>
                    ))}
                  </div>
                  <div className="grid g-2" style={{ marginTop: 16 }}>
                    <article className="card">
                      <h3>Episódios de urgência por dia · {REGIAO.replace("ARS ", "")}</h3>
                      <p className="hint">Estimativa diária da rede de urgência hospitalar. Médias móveis de 7 dias, de outubro a março.</p>
                      <SeasonChart data={epiRows} unit="episódios" title="Episódios de urgência por dia na região: época atual, anterior e linha de base" />
                      <Fonte ids={["gripal"]} />
                    </article>
                    <article className="card">
                      <h3>Urgências com diagnóstico de infeção respiratória (%)</h3>
                      <p className="hint">Proporção de episódios com infeção respiratória codificada.</p>
                      <SeasonChart data={respRows} unit="%" digits={1} title="Percentagem de urgências com infeção respiratória na região: época atual, anterior e linha de base" />
                      <Fonte ids={["gripal"]} />
                    </article>
                  </div>
                </>
              ) : <p className="hint">Fonte indisponível.</p>}
            </div>
          </details>
        </section>

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
              <p><b>Situação da ULSSA.</b> O nível do topo é o mais alto entre a procura do SU, a ocupação hospitalar (nível DGS: 1 → Atenção; 2 e 3 → Alerta), os avisos IPMA do distrito do Porto e o índice FRIESA. Os indicadores regionais não entram.</p>
              <p><b>Procura do SU e óbitos (ULSSA).</b> Atendimentos em urgência e óbitos SICO por mês, comparados com o mesmo mês do ano anterior. A SPMS publica os atendimentos acumulados no ano; aqui estão convertidos em mensais. Procura: níveis DGS 10 %, 25 % e 50 %. Óbitos: teste de Poisson (Atenção z ≥ 2, Alerta z ≥ 3). Um mês repetido pela SPMS fica “a rever”.</p>
              <p><b>Ocupação.</b> Dias de internamento ÷ (lotação praticada × dias do mês). Níveis DGS: 85 %, 95 % e 105 %.</p>
              <p><b>Linha de base sazonal (regional).</b> Para cada dia da época (1 de outubro a 30 de setembro) calcula-se a média e o desvio-padrão da média móvel de 7 dias nas 5 épocas anteriores, numa janela de ±7 dias. z = (média dos últimos 7 dias − média esperada) ÷ desvio-padrão. <b>Atenção</b> se z ≥ 1; <b>Alerta</b> se z ≥ 2.</p>
              <p><b>Dados locais.</b> Um dia é anómalo quando o número de episódios ultrapassa a média + 2 desvios-padrão para o mesmo dia da semana. A associação entre temperatura e infeções respiratórias usa a correlação de Pearson com desfasamentos de 0 a 14 dias.</p>
              <p><b>Inteligência artificial.</b> Um modelo de linguagem open-source (Llama 3.3 ou Qwen 2.5) recebe apenas os números já calculados e redige a síntese. A IA não decide níveis de alerta. Sem chave de API configurada, o texto é gerado por regras.</p>
              <p><b>Atualização.</b> Além do ISR de 3 em 3 horas, um cron diário da Vercel (07:00 UTC) invalida o cache e volta a recolher todas as fontes.</p>
              <p><b>Limitações.</b> Os dados do SNS Transparência são provisórios e podem ser revistos. Os índices FRIESA e ÍCARO são sazonais. A correlação não implica causalidade.</p>
            </div>
          </details>
        </section>
      </main>

      <footer>
        <div className="wrap">
          Boletim produzido automaticamente para apoio à vigilância em Saúde Pública da ULS Santo António (Gondomar e Porto Ocidental). Fontes: SNS Transparência (SPMS), INSA, DGS, IPMA, Open-Meteo. Não substitui a avaliação da Autoridade de Saúde.
        </div>
      </footer>
    </>
  );
}
