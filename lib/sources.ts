// Recolha automática de dados públicos e gratuitos.
// Todas as chamadas usam o cache da Next.js (ISR): a página volta a buscar os dados
// sozinha, no máximo de REVALIDATE em REVALIDATE segundos, sem servidor próprio.

export const REVALIDATE = 60 * 60 * 3; // 3 horas

const SNS = "https://transparencia.sns.gov.pt/api/explore/v2.1/catalog/datasets";

export type Point = { date: string; value: number };
export type SourceStatus = { id: string; name: string; url: string; ok: boolean; lastDate?: string; error?: string };

async function getJSON<T>(url: string, revalidate = REVALIDATE): Promise<T> {
  const res = await fetch(url, {
    next: { revalidate },
    headers: { Accept: "application/json", "User-Agent": "boletim-vigilancia-sazonal/1.0" },
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

const day = (s: string) => String(s).slice(0, 10);

function sortPts(p: Point[]) {
  return p.filter((x) => Number.isFinite(x.value)).sort((a, b) => a.date.localeCompare(b.date));
}

/* ------------------------------------------------------------------ */
/* SNS Transparência — vigilância sazonal das urgências (ARS Norte)    */
/* ------------------------------------------------------------------ */

export type NorteSeries = {
  episodios: Point[];
  pctRespiratoria: Point[];
  tempoTriagem: Point[];
  naoUrgentes: Point[];
  pctInternamento: Point[];
};

type SnsRow = { periodo: string; indicador: string; valor: number };

async function snsExport(dataset: string, where: string): Promise<SnsRow[]> {
  const q = new URLSearchParams({ where, select: "periodo,indicador,valor", order_by: "periodo" });
  return getJSON<SnsRow[]>(`${SNS}/${dataset}/exports/json?${q}`);
}

export async function fetchNorte(sinceISO: string, regiao = "ARS Norte"): Promise<NorteSeries> {
  const where = `ars="${regiao}" AND periodo >= date'${sinceISO}'`;
  const [gripal, sazonal] = await Promise.all([
    snsExport("atividade-sindrome-gripal-csh", where),
    snsExport("monitorizacao-sazonal-csh", `${where} AND indicador LIKE "internamento"`),
  ]);
  const pick = (rows: SnsRow[], test: (i: string) => boolean) =>
    sortPts(rows.filter((r) => test(r.indicador.toLowerCase())).map((r) => ({ date: day(r.periodo), value: Number(r.valor) })));
  return {
    episodios: pick(gripal, (i) => i.startsWith("número estimado")),
    pctRespiratoria: pick(gripal, (i) => i.includes("infeção respiratória")),
    tempoTriagem: pick(gripal, (i) => i.startsWith("tempo médio")),
    naoUrgentes: pick(gripal, (i) => i.includes("verde ou azul")),
    pctInternamento: pick(sazonal, (i) => i.includes("internamento")),
  };
}

/* Índices de impacto da temperatura na saúde (INSA/DGS) */
export async function fetchFriesaPorto(sinceISO: string): Promise<{ geral: Point[]; mais65: Point[] }> {
  const q = new URLSearchParams({ where: `data >= date'${sinceISO}'`, order_by: "data" });
  const rows = await getJSON<{ data: string; porto: number; porto65: number }[]>(`${SNS}/indice-friesa/exports/json?${q}`);
  return {
    geral: sortPts(rows.map((r) => ({ date: day(r.data), value: Number(r.porto) }))),
    mais65: sortPts(rows.map((r) => ({ date: day(r.data), value: Number(r.porto65) }))),
  };
}

export async function fetchIcaro(sinceISO: string): Promise<Point[]> {
  const q = new URLSearchParams({ where: `periodo >= date'${sinceISO}'`, order_by: "periodo" });
  const rows = await getJSON<{ periodo: string; ii: string }[]>(`${SNS}/evolucao-diaria-do-indice-icaro/exports/json?${q}`);
  return sortPts(rows.map((r) => ({ date: day(r.periodo), value: Number(r.ii) })));
}

/* Certificados de óbito diários (Portugal) */
export async function fetchObitos(sinceISO: string): Promise<Point[]> {
  const q = new URLSearchParams({
    where: `data_de_certificacao >= date'${sinceISO}'`,
    select: "data_de_certificacao,no_de_certificados_de_obito_diarios",
    order_by: "data_de_certificacao",
  });
  const rows = await getJSON<{ data_de_certificacao: string; no_de_certificados_de_obito_diarios: number }[]>(
    `${SNS}/evolucao-diaria-de-certificados-de-obito/exports/json?${q}`
  );
  return sortPts(rows.map((r) => ({ date: day(r.data_de_certificacao), value: Number(r.no_de_certificados_de_obito_diarios) })));
}

/* Atendimentos mensais por triagem de Manchester numa instituição (ex.: ULS Santo António) */
export type Manchester = { mes: string; vermelha: number; laranja: number; amarela: number; verde: number; azul: number; branca: number; semTriagem: number };
export async function fetchManchester(instituicao: string, sinceMonth: string): Promise<Manchester[]> {
  const q = new URLSearchParams({ where: `instituicao="${instituicao}" AND tempo >= "${sinceMonth}"`, order_by: "tempo" });
  type R = Record<string, number | string>;
  const rows = await getJSON<R[]>(`${SNS}/atendimentos-em-urgencia-triagem-manchester/exports/json?${q}`);
  const n = (r: R, k: string) => Number(r[`no_de_atendimentos_em_urgencia_su_triagem_manchester_${k}`] ?? 0);
  return rows.map((r) => ({
    mes: String(r.tempo),
    vermelha: n(r, "vermelha"),
    laranja: n(r, "laranja"),
    amarela: n(r, "amarela"),
    verde: n(r, "verde"),
    azul: n(r, "azul"),
    branca: n(r, "branca"),
    semTriagem: Number(r.no_de_atendimentos_em_sem_triagem_manchester ?? 0),
  }));
}

/* ------------------------------------------------------------------ */
/* IPMA — previsão e avisos meteorológicos (API aberta)               */
/* ------------------------------------------------------------------ */

export type Forecast = { date: string; tMin: number; tMax: number; precipProb: number; weatherType: number };
export async function fetchIpmaForecast(globalIdLocal = 1131200): Promise<Forecast[]> {
  const j = await getJSON<{ data: Record<string, string | number>[] }>(
    `https://api.ipma.pt/open-data/forecast/meteorology/cities/daily/${globalIdLocal}.json`,
    60 * 60
  );
  return j.data.map((d) => ({
    date: String(d.forecastDate),
    tMin: Number(d.tMin),
    tMax: Number(d.tMax),
    precipProb: Number(d.precipitaProb),
    weatherType: Number(d.idWeatherType),
  }));
}

export const DISTRITOS_NORTE: Record<string, string> = {
  VCT: "Viana do Castelo",
  BRG: "Braga",
  PTO: "Porto",
  VRL: "Vila Real",
  BGC: "Bragança",
};

export type Aviso = { distrito: string; tipo: string; nivel: "yellow" | "orange" | "red"; inicio: string; fim: string; texto: string };
export async function fetchIpmaAvisos(): Promise<Aviso[]> {
  const j = await getJSON<{ idAreaAviso: string; awarenessTypeName: string; awarenessLevelID: string; startTime: string; endTime: string; text: string }[]>(
    "https://api.ipma.pt/open-data/forecast/warnings/warnings_www.json",
    60 * 30
  );
  return j
    .filter((a) => a.idAreaAviso in DISTRITOS_NORTE && a.awarenessLevelID !== "green")
    .map((a) => ({
      distrito: DISTRITOS_NORTE[a.idAreaAviso],
      tipo: a.awarenessTypeName,
      nivel: a.awarenessLevelID as Aviso["nivel"],
      inicio: a.startTime,
      fim: a.endTime,
      texto: a.text,
    }))
    .sort((a, b) => a.inicio.localeCompare(b.inicio));
}

/* ------------------------------------------------------------------ */
/* Open-Meteo — temperatura observada (últimos 30 dias) no Porto       */
/* ------------------------------------------------------------------ */

export type Meteo = { date: string; tMed: number; tMin: number; tMax: number; precip: number };
export async function fetchMeteoPorto(): Promise<Meteo[]> {
  const q = new URLSearchParams({
    latitude: "41.1496",
    longitude: "-8.6109",
    daily: "temperature_2m_mean,temperature_2m_min,temperature_2m_max,precipitation_sum",
    past_days: "45",
    forecast_days: "7",
    timezone: "Europe/Lisbon",
  });
  const j = await getJSON<{ daily: Record<string, (number | string)[]> }>(`https://api.open-meteo.com/v1/forecast?${q}`, 60 * 60);
  const d = j.daily;
  return (d.time as string[]).map((t, i) => ({
    date: t,
    tMed: Number(d.temperature_2m_mean[i]),
    tMin: Number(d.temperature_2m_min[i]),
    tMax: Number(d.temperature_2m_max[i]),
    precip: Number(d.precipitation_sum[i]),
  }));
}

/* Helper: corre uma recolha e devolve o estado da fonte, sem rebentar a página */
export async function safe<T>(meta: Omit<SourceStatus, "ok">, fn: () => Promise<T>, last?: (v: T) => string | undefined) {
  try {
    const value = await fn();
    return { value, status: { ...meta, ok: true, lastDate: last?.(value) } as SourceStatus };
  } catch (e) {
    return { value: null, status: { ...meta, ok: false, error: (e as Error).message } as SourceStatus };
  }
}
