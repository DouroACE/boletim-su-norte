// Níveis de risco do Plano Nacional de Preparação e Resposta Sazonal em Saúde 2026–2027 (DGS / DE-SNS),
// tabela de critérios assistenciais da p. 20. Nível = número de limiares atingidos (0 a 3).
import type { Flag } from "./stats";

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

export function dgsLevel(value: number, t: [number, number, number]): DgsLevel {
  return t.filter((x) => value >= x).length as DgsLevel;
}

/** "Aumento" face ao esperado (mesma altura do ano nas épocas anteriores), em %. */
const increase = (f: Flag | undefined) =>
  f?.current != null && f.baselineMean ? ((f.current - f.baselineMean) / f.baselineMean) * 100 : null;

/** Os 7 indicadores da tabela; só a procura do SU tem hoje fonte pública diária (ARS Norte). */
export function dgsIndicators(flags: Flag[]): DgsIndicator[] {
  const procura = increase(flags.find((f) => f.id === "episodios"));
  return [
    { id: "procura", label: "Procura do SU", unit: "%", thresholds: [10, 25, 50], value: procura, note: "Episódios de urgência (ARS Norte) face ao esperado para esta altura do ano." },
    { id: "boarding", label: "Dias de boarding no SU", unit: "%", thresholds: [10, 20, 30], value: null, pedir: "ULS", note: "Aumento dos dias de boarding." },
    { id: "espera", label: "Espera urgentes e muito urgentes", unit: "%", thresholds: [20, 40, 60], value: null, pedir: "SPMS", note: "Aumento do tempo médio de espera no SU." },
    { id: "ocupacao", label: "Ocupação hospitalar", unit: "%", thresholds: [85, 95, 105], value: null, pedir: "ULS", note: "Taxa de ocupação." },
    { id: "medicina", label: "Ocupação de Medicina", unit: "%", thresholds: [100, 100, Infinity], value: null, pedir: "ULS", note: "≥ 100 % corresponde ao nível 2." },
    { id: "csp", label: "Procura da consulta aberta (CSP)", unit: "%", thresholds: [15, 30, 45], value: null, pedir: "ACSS", note: "Aumento da procura." },
    { id: "vagas", label: "Hora em que esgotam as vagas (CSP)", unit: "", thresholds: null, value: null, pedir: "ACSS", note: "Antes das 12:00 / 10:30 / 09:00." },
  ];
}

/** Nível regional = o mais alto entre os indicadores com dados; null se nenhum tiver. */
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
