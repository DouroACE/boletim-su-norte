// Níveis de risco do Plano Nacional de Preparação e Resposta Sazonal em Saúde 2026–2027 (DGS / DE-SNS),
// tabela de critérios assistenciais da p. 20. Nível = número de limiares atingidos (0 a 3).
// Também: faixa mensal dos últimos meses, situação do boletim e rótulos de qualidade do ar, pólen e UV.
// Só importa tipos de ./stats e ./uls (sem código de execução), para o selfcheck o conseguir carregar.
import type { Flag, Level } from "./stats";
import type { MonthVal } from "./uls";

export type DgsLevel = 0 | 1 | 2 | 3;

export type DgsIndicator = {
  id: string;
  label: string;
  unit: string;
  /** Limiares dos níveis 1, 2 e 3 (Infinity = esse nível não existe para o indicador). */
  thresholds: [number, number, number] | null;
  value: number | null;
  /** Quem tem os dados quando ainda não os temos. */
  pedir?: string;
  note: string;
};

export const DGS_TEXT: Record<DgsLevel, string> = { 0: "Verde", 1: "Amarelo", 2: "Laranja", 3: "Vermelho" };

/** Procura do SU: aumento face ao mesmo mês do ano anterior (%). */
export const LIMIAR_PROCURA: [number, number, number] = [10, 25, 50];
/** Taxa de ocupação hospitalar (%). */
export const LIMIAR_OCUPACAO: [number, number, number] = [85, 95, 105];

export function dgsLevel(value: number, t: [number, number, number]): DgsLevel {
  return t.filter((x) => value >= x).length as DgsLevel;
}

/** Nível DGS → nível de sinal do boletim: 0 Normal; 1 Atenção; 2 e 3 Alerta. */
export function dgsToLevel(l: DgsLevel | null): Level {
  if (l == null) return "sem-dados";
  return l === 0 ? "normal" : l === 1 ? "atencao" : "alerta";
}

const RANK: Record<Level, number> = { "sem-dados": -1, normal: 0, atencao: 1, alerta: 2 };
/** Pior nível de uma lista; "sem-dados" só se não houver nenhum nível com dados. */
export const worstOf = (levels: Level[]): Level => levels.reduce<Level>((w, l) => (RANK[l] > RANK[w] ? l : w), "sem-dados");

/** "Aumento" face ao esperado (mesma altura do ano nas épocas anteriores), em %. Só para o fallback regional. */
const increase = (f: Flag | undefined) =>
  f?.current != null && f.baselineMean ? ((f.current - f.baselineMean) / f.baselineMean) * 100 : null;

/** Valores da ULSSA para os indicadores DGS, já com a nota (mês) escrita pela página. */
export type UlssaDgs = { procura: number | null; procuraNota: string; ocupacao: number | null; ocupacaoNota: string };

/** Os 7 indicadores da tabela. Procura do SU e ocupação vêm da ULSSA; os restantes pedem-se à ULS, SPMS ou ACSS. */
export function dgsIndicators(flags: Flag[], ulssa?: UlssaDgs): DgsIndicator[] {
  const procura = ulssa ? ulssa.procura : increase(flags.find((f) => f.id === "episodios"));
  return [
    { id: "procura", label: "Procura do SU", unit: "%", thresholds: LIMIAR_PROCURA, value: procura, pedir: "ULS", note: ulssa?.procuraNota ?? "Episódios de urgência (ARS Norte) face ao esperado para esta altura do ano." },
    { id: "boarding", label: "Dias de boarding no SU", unit: "%", thresholds: [10, 20, 30], value: null, pedir: "ULS", note: "Aumento dos dias de boarding." },
    { id: "espera", label: "Espera urgentes e muito urgentes", unit: "%", thresholds: [20, 40, 60], value: null, pedir: "SPMS", note: "Aumento do tempo médio de espera no SU." },
    { id: "ocupacao", label: "Ocupação hospitalar", unit: "%", thresholds: LIMIAR_OCUPACAO, value: ulssa ? ulssa.ocupacao : null, pedir: "ULS", note: ulssa?.ocupacaoNota ?? "Taxa de ocupação." },
    { id: "medicina", label: "Ocupação de Medicina", unit: "%", thresholds: [100, 100, Infinity], value: null, pedir: "ULS", note: "≥ 100 % corresponde ao nível 2." },
    { id: "csp", label: "Procura da consulta aberta (CSP)", unit: "%", thresholds: [15, 30, 45], value: null, pedir: "ACSS", note: "Aumento da procura." },
    { id: "vagas", label: "Hora em que esgotam as vagas (CSP)", unit: "", thresholds: null, value: null, pedir: "ACSS", note: "Antes das 12:00 / 10:30 / 09:00." },
  ];
}

/** Nível global = o mais alto entre os indicadores com dados; null se nenhum tiver. */
export function regionalDgsLevel(ind: DgsIndicator[]): { level: DgsLevel | null; withData: number; reason: string } {
  const scored = ind.filter((i) => i.value != null && i.thresholds).map((i) => ({ i, l: dgsLevel(i.value!, i.thresholds!) }));
  if (!scored.length) return { level: null, withData: 0, reason: "Sem indicadores com dados." };
  const top = scored.reduce((a, b) => (b.l > a.l ? b : a));
  const v = top.i.value!;
  return {
    level: top.l,
    withData: scored.length,
    reason: `${top.i.label} ${v >= 0 ? "+" : "−"}${Math.abs(v).toLocaleString("pt-PT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} % → nível ${top.l} (${DGS_TEXT[top.l]})`,
  };
}

/* ------------------------------------------------------------------ */
/* Faixa mensal (painel): últimos meses publicados                      */
/* ------------------------------------------------------------------ */

export type MesRisco = { mes: string; procura: DgsLevel | null; ocupacao: DgsLevel | null; nivel: DgsLevel | null };
const prevYear = (m: string) => `${Number(m.slice(0, 4)) - 1}${m.slice(4)}`;

/** Um mês por célula: pior nível entre procura do SU (vs. mesmo mês do ano anterior) e ocupação. */
export function faixaMensal(urg: MonthVal[], ocup: MonthVal[], n = 12): MesRisco[] {
  const u = new Map(urg.map((s) => [s.mes, s.valor]));
  const o = new Map(ocup.map((s) => [s.mes, s.valor]));
  const meses = [...new Set([...u.keys(), ...o.keys()])].sort().slice(-n);
  return meses.map((mes) => {
    const v = u.get(mes);
    const h = u.get(prevYear(mes));
    const pct = v != null && h != null && Number.isFinite(v) && Number.isFinite(h) && h > 0 ? ((v - h) / h) * 100 : null;
    const procura = pct == null ? null : dgsLevel(pct, LIMIAR_PROCURA);
    const x = o.get(mes);
    const ocupacao = x != null && Number.isFinite(x) ? dgsLevel(x, LIMIAR_OCUPACAO) : null;
    const niveis = [procura, ocupacao].filter((l): l is DgsLevel => l != null);
    return { mes, procura, ocupacao, nivel: niveis.length ? (Math.max(...niveis) as DgsLevel) : null };
  });
}

/** Séries mensais até ao mês limite (AAAA-MM), inclusive. Sem limite, devolve tudo. */
export const ateMes = <T extends { mes: string }>(s: T[], limite?: string | null): T[] => (limite ? s.filter((x) => x.mes <= limite) : s);

/* ------------------------------------------------------------------ */
/* Qualidade do ar, pólen e UV: rótulos qualitativos                    */
/* ------------------------------------------------------------------ */

export type AirVar = "pm10" | "pm2_5" | "ozone" | "grass_pollen" | "birch_pollen" | "olive_pollen";
export const AIR_VARS: AirVar[] = ["pm10", "pm2_5", "ozone", "grass_pollen", "birch_pollen", "olive_pollen"];
export type AirDay = Partial<Record<AirVar, number>>;

/** Máximo diário de cada variável a partir de séries horárias (dia = primeiros 10 caracteres da hora local). */
export function dailyMax(time: string[], hourly: Partial<Record<AirVar, (number | null)[]>>): Record<string, AirDay> {
  const out: Record<string, AirDay> = {};
  time.forEach((t, i) => {
    const row = (out[t.slice(0, 10)] ??= {});
    for (const v of AIR_VARS) {
      const x = hourly[v]?.[i];
      if (x == null || !Number.isFinite(x)) continue;
      row[v] = Math.max(row[v] ?? -Infinity, x);
    }
  });
  return out;
}

// shortcut: escala europeia EAQI (horária) aplicada ao máximo do dia; indicativa, não é o índice oficial diário.
const EAQI: Record<"pm10" | "pm2_5" | "ozone", number[]> = {
  pm10: [20, 40, 50, 100, 150],
  pm2_5: [10, 20, 25, 50, 75],
  ozone: [50, 100, 130, 240, 380],
};
const EAQI_TXT = ["Boa", "Razoável", "Moderada", "Fraca", "Muito fraca", "Extremamente fraca"];
export function airLabel(v: "pm10" | "pm2_5" | "ozone", x: number | undefined): string {
  if (x == null) return "Sem dados";
  return EAQI_TXT[EAQI[v].filter((lim) => x > lim).length];
}

// shortcut: limiares de pólen (grãos/m³) indicativos; confirmar com a rede de aerobiologia antes de uso público.
const POLEN_LIM = [1, 20, 80, 200];
const POLEN_TXT = ["Nula", "Baixa", "Moderada", "Alta", "Muito alta"];
const POLEN_NOME: Record<"grass_pollen" | "birch_pollen" | "olive_pollen", string> = { grass_pollen: "gramíneas", birch_pollen: "bétula", olive_pollen: "oliveira" };
/** Pólen do dia: o tipo com maior valor. */
export function polenDia(d: AirDay): { label: string; tipo: string | null } {
  const tipos = (["grass_pollen", "birch_pollen", "olive_pollen"] as const).filter((k) => d[k] != null);
  if (!tipos.length) return { label: "Sem dados", tipo: null };
  const top = tipos.reduce((a, b) => ((d[b] ?? 0) > (d[a] ?? 0) ? b : a));
  const x = d[top]!;
  return { label: POLEN_TXT[POLEN_LIM.filter((l) => x >= l).length], tipo: POLEN_NOME[top] };
}

/** Índice UV máximo (escala da OMS). */
export function uvLabel(x: number | null | undefined): string {
  if (x == null || !Number.isFinite(x)) return "Sem dados";
  if (x < 3) return "Baixo";
  if (x < 6) return "Moderado";
  if (x < 8) return "Elevado";
  if (x < 11) return "Muito elevado";
  return "Extremo";
}
