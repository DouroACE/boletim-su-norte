// Análise dos dados locais do SU (ficheiro Excel convertido em data/su-local.json).
import raw from "@/data/su-local.json";
import { mean, sd, pearson, rolling, addDays } from "./stats";

export type LocalRec = {
  date: string;
  total: number;
  a0_9: number; a10_19: number; a20_29: number; a30_39: number; a40_49: number; a50_59: number;
  a60_69: number; a70_79: number; a80_89: number; a90_99: number; a100: number; aUnk: number;
  gastro: number; angina: number; iras: number; irai: number; diarreia: number; desidratacao: number;
  tempoTriagem: number; falecidos: number; internamento: number; enfermaria: number; uci: number; idadeMedia: number;
  oGondomar: number; oPortoOcidental: number; oPortoOriental: number; oOutra: number; oDesconhecida: number;
  tMed: number; tMin: number; tMax: number; precip: number; icaro: number;
};

const compact = raw as { source: string; cols: string[]; rows: (string | number | null)[][] };
const records = compact.rows.map((row) => Object.fromEntries(compact.cols.map((c, i) => [c, row[i]])) as unknown as LocalRec);
export const local = { source: compact.source, records };
const R = local.records;

const DOW = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const dow = (iso: string) => new Date(iso + "T12:00:00Z").getUTCDay();
const sum = (a: number[]) => a.reduce((s, x) => s + (x || 0), 0);
const pct = (a: number, b: number) => (b ? (a / b) * 100 : 0);

export type Pattern = { id: string; level: "info" | "atencao" | "alerta"; title: string; detail: string };

export function analyseLocal() {
  if (!R.length) return null;
  const first = R[0].date;
  const last = R.at(-1)!.date;

  const totals = R.map((r) => ({ date: r.date, value: r.total }));
  const ma7 = rolling(totals, 7);
  const resp = R.map((r) => ({ date: r.date, value: (r.iras || 0) + (r.irai || 0) }));
  const respMa = rolling(resp, 7);

  // Série diária para gráficos
  const daily = R.map((r, i) => ({
    date: r.date,
    total: r.total,
    ma7: ma7.find((m) => m.date === r.date)?.value ?? null,
    respiratorias: (r.iras || 0) + (r.irai || 0),
    respMa7: respMa.find((m) => m.date === r.date)?.value ?? null,
    gastro: (r.gastro || 0) + (r.diarreia || 0),
    internamento: r.internamento,
    uci: r.uci,
    tempoTriagem: r.tempoTriagem,
    tMed: r.tMed,
    tMin: r.tMin,
    tMax: r.tMax,
    idx: i,
  }));

  // Semanas (segunda a domingo)
  const weekKey = (iso: string) => addDays(iso, -((dow(iso) + 6) % 7));
  const weeks = new Map<string, LocalRec[]>();
  for (const r of R) {
    const k = weekKey(r.date);
    if (!weeks.has(k)) weeks.set(k, []);
    weeks.get(k)!.push(r);
  }
  const weekly = [...weeks.entries()]
    .filter(([, rs]) => rs.length >= 5)
    .map(([w, rs]) => ({
      semana: w,
      total: mean(rs.map((r) => r.total)),
      respiratorias: sum(rs.map((r) => (r.iras || 0) + (r.irai || 0))),
      gastro: sum(rs.map((r) => (r.gastro || 0) + (r.diarreia || 0))),
      pctInternamento: pct(sum(rs.map((r) => r.internamento)), sum(rs.map((r) => r.total))),
      pct80: pct(sum(rs.map((r) => r.a80_89 + r.a90_99 + r.a100)), sum(rs.map((r) => r.total))),
      tempoTriagem: mean(rs.map((r) => r.tempoTriagem)),
      tMed: mean(rs.map((r) => r.tMed)),
    }));

  // Padrão semanal (dia da semana)
  const byDow = DOW.map((nome, d) => {
    const v = R.filter((r) => dow(r.date) === d).map((r) => r.total);
    return { dia: nome, media: mean(v), sd: sd(v) };
  });
  const order = [1, 2, 3, 4, 5, 6, 0].map((i) => byDow[i]);

  // Dias anómalos: total acima de média + 2 DP para o mesmo dia da semana
  const anomalias = R.filter((r) => {
    const b = byDow[dow(r.date)];
    return r.total > b.media + 2 * b.sd;
  }).map((r) => ({ date: r.date, total: r.total, esperado: byDow[dow(r.date)].media }));

  // Grupos etários
  const ageKeys: [keyof LocalRec, string][] = [
    ["a0_9", "0–9"], ["a10_19", "10–19"], ["a20_29", "20–29"], ["a30_39", "30–39"], ["a40_49", "40–49"],
    ["a50_59", "50–59"], ["a60_69", "60–69"], ["a70_79", "70–79"], ["a80_89", "80–89"], ["a90_99", "90–99"], ["a100", "100+"],
  ];
  const totalAll = sum(R.map((r) => r.total));
  const idades = ageKeys.map(([k, label]) => {
    const n = sum(R.map((r) => r[k] as number));
    return { grupo: label, n, pct: pct(n, totalAll) };
  });

  // Origem (área de residência)
  const origens = [
    ["oPortoOcidental", "Porto Ocidental"], ["oPortoOriental", "Porto Oriental"], ["oGondomar", "Gondomar"],
    ["oOutra", "Outra"], ["oDesconhecida", "Desconhecida"],
  ].map(([k, label]) => {
    const n = sum(R.map((r) => r[k as keyof LocalRec] as number));
    return { origem: label, n, pct: pct(n, totalAll) };
  });

  // Correlação temperatura média ↔ infeções respiratórias, com desfasamento 0–14 dias
  const lags = Array.from({ length: 15 }, (_, lag) => {
    const x: number[] = [];
    const y: number[] = [];
    for (let i = lag; i < R.length; i++) {
      const t = R[i - lag].tMed;
      if (t == null) continue;
      x.push(t);
      y.push((R[i].iras || 0) + (R[i].irai || 0));
    }
    return { lag, r: pearson(x, y) };
  });
  const best = lags.reduce((a, b) => (Math.abs(b.r) > Math.abs(a.r) ? b : a));

  const peakWeek = weekly.reduce((a, b) => (b.total > a.total ? b : a));
  const peakResp = weekly.reduce((a, b) => (b.respiratorias > a.respiratorias ? b : a));
  const lowWeek = weekly.reduce((a, b) => (b.total < a.total ? b : a));

  const kpis = {
    dias: R.length,
    mediaDiaria: mean(R.map((r) => r.total)),
    totalEpisodios: totalAll,
    pctInternamento: pct(sum(R.map((r) => r.internamento)), totalAll),
    uciTotal: sum(R.map((r) => r.uci)),
    falecidos: sum(R.map((r) => r.falecidos)),
    tempoTriagem: mean(R.map((r) => r.tempoTriagem)),
    diasTriagem90: R.filter((r) => r.tempoTriagem > 90).length,
    idadeMedia: mean(R.map((r) => r.idadeMedia)),
    pct80: pct(sum(R.map((r) => r.a80_89 + r.a90_99 + r.a100)), totalAll),
    respiratorias: sum(R.map((r) => (r.iras || 0) + (r.irai || 0))),
    diasIcaro: R.filter((r) => (r.icaro || 0) > 0).length,
  };

  const fmtD = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("pt-PT", { day: "numeric", month: "short" });
  const patterns: Pattern[] = [
    {
      id: "pico",
      level: "info",
      title: `Semana de maior afluência: ${fmtD(peakWeek.semana)}`,
      detail: `Média de ${peakWeek.total.toFixed(0)} episódios/dia, ${pct(peakWeek.total - kpis.mediaDiaria, kpis.mediaDiaria).toFixed(0)}% acima da média do período (${kpis.mediaDiaria.toFixed(0)}/dia). Semana mais calma: ${fmtD(lowWeek.semana)} (${lowWeek.total.toFixed(0)}/dia).`,
    },
    {
      id: "resp",
      level: "atencao",
      title: `Pico de infeções respiratórias agudas na semana de ${fmtD(peakResp.semana)}`,
      detail: `${peakResp.respiratorias} diagnósticos de infeção respiratória aguda (superior + inferior) nessa semana, num total de ${kpis.respiratorias} no período.`,
    },
    {
      id: "temp",
      level: Math.abs(best.r) >= 0.3 ? "atencao" : "info",
      title: `Temperatura e infeções respiratórias: r = ${best.r.toFixed(2)} com ${best.lag} dia(s) de desfasamento`,
      detail:
        best.r < 0
          ? `Dias mais frios tendem a ser seguidos, ${best.lag} dia(s) depois, de mais diagnósticos respiratórios. Correlação ${Math.abs(best.r) >= 0.5 ? "forte" : Math.abs(best.r) >= 0.3 ? "moderada" : "fraca"}; não prova causalidade.`
          : `Sem associação inversa clara entre frio e diagnósticos respiratórios neste período (r = ${best.r.toFixed(2)}).`,
    },
    {
      id: "dow",
      level: "info",
      title: `Padrão semanal: ${order.reduce((a, b) => (b.media > a.media ? b : a)).dia} é o dia com mais procura`,
      detail: `Média de ${order.reduce((a, b) => (b.media > a.media ? b : a)).media.toFixed(0)} episódios, contra ${order.reduce((a, b) => (b.media < a.media ? b : a)).media.toFixed(0)} ao ${order.reduce((a, b) => (b.media < a.media ? b : a)).dia}. Útil para planear escalas.`,
    },
    {
      id: "anom",
      level: anomalias.length ? "alerta" : "info",
      title: `${anomalias.length} dia(s) com afluência fora do padrão`,
      detail: anomalias.length
        ? `Acima de média + 2 desvios-padrão para o mesmo dia da semana: ${anomalias.slice(0, 6).map((a) => `${fmtD(a.date)} (${a.total})`).join(", ")}${anomalias.length > 6 ? "…" : ""}.`
        : "Nenhum dia ultrapassou média + 2 desvios-padrão para o mesmo dia da semana.",
    },
    {
      id: "triagem",
      level: kpis.diasTriagem90 > 10 ? "atencao" : "info",
      title: `Tempo médio triagem → 1.ª observação: ${kpis.tempoTriagem.toFixed(0)} min`,
      detail: `${kpis.diasTriagem90} dia(s) com tempo médio acima de 90 minutos.`,
    },
    {
      id: "idosos",
      level: "info",
      title: `${kpis.pct80.toFixed(1)}% dos episódios em pessoas com 80 ou mais anos`,
      detail: `Idade média dos utentes: ${kpis.idadeMedia.toFixed(1)} anos. Taxa de internamento: ${kpis.pctInternamento.toFixed(1)}% (${kpis.uciTotal} para UCI).`,
    },
  ];

  return { first, last, daily, weekly, byDow: order, anomalias, idades, origens, lags, best, kpis, patterns };
}
