// Indicadores da última semana completa do SU (segunda a domingo) face às 8 semanas anteriores.
// O nível vem destas regras (z-score); a IA só propõe as flags e cita estes indicadores.
import type { Level } from "./stats.ts";

/** Um indicador que a IA pode citar. O nível vem sempre das regras estatísticas. */
export type Indicator = { id: string; label: string; level: Level; detail: string };

/** Campos do registo diário do SU usados aqui (ver LocalRec em lib/local.ts). */
export type DiaSU = {
  date: string; total: number; iras?: number | null; irai?: number | null; gastro?: number | null; diarreia?: number | null;
  internamento?: number | null; uci?: number | null; falecidos?: number | null; tempoTriagem?: number | null;
  a80_89?: number | null; a90_99?: number | null; a100?: number | null; tMin?: number | null; tMax?: number | null;
};

export type SemanaSU = { semana: string; dias: number; base: number; indicadores: Indicator[] };

const SEMANAS_BASE = 8;
const MIN_BASE = 4;
const DIAS_MIN = 5;

const t = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const segunda = (d: string) => iso(t(d) - ((new Date(t(d)).getUTCDay() + 6) % 7) * 864e5);
const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const soma = (rs: DiaSU[], f: (r: DiaSU) => number) => rs.reduce((s, r) => s + f(r), 0);
const media = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
const dp = (a: number[]) => { const m = media(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(a.length - 1, 1)); };
const fmt = (x: number, d = 1) => x.toLocaleString("pt-PT", { maximumFractionDigits: d });
const dataPt = (d: string) => d.split("-").reverse().join("/");

type Def = { id: string; label: string; unidade: string; valor: (rs: DiaSU[]) => number; sentido: 1 | -1 };

/** sentido 1: subir é pior; -1: descer é pior (frio). */
const DEFS: Def[] = [
  { id: "su:episodios", label: "Episódios de urgência (média diária)", unidade: "/dia", sentido: 1, valor: (rs) => soma(rs, (r) => n(r.total)) / rs.length },
  { id: "su:respiratorias", label: "Infeções respiratórias agudas (superior + inferior)", unidade: "", sentido: 1, valor: (rs) => soma(rs, (r) => n(r.iras) + n(r.irai)) },
  { id: "su:gastro", label: "Gastroenterite e diarreia", unidade: "", sentido: 1, valor: (rs) => soma(rs, (r) => n(r.gastro) + n(r.diarreia)) },
  { id: "su:internamento", label: "Taxa de internamento a partir do SU", unidade: " %", sentido: 1, valor: (rs) => (100 * soma(rs, (r) => n(r.internamento))) / Math.max(soma(rs, (r) => n(r.total)), 1) },
  { id: "su:uci", label: "Admissões em UCI a partir do SU", unidade: "", sentido: 1, valor: (rs) => soma(rs, (r) => n(r.uci)) },
  { id: "su:falecidos", label: "Óbitos no SU", unidade: "", sentido: 1, valor: (rs) => soma(rs, (r) => n(r.falecidos)) },
  { id: "su:triagem", label: "Tempo triagem → 1.ª observação (média)", unidade: " min", sentido: 1, valor: (rs) => soma(rs, (r) => n(r.tempoTriagem)) / rs.length },
  { id: "su:80mais", label: "Episódios em pessoas com 80+ anos", unidade: " %", sentido: 1, valor: (rs) => (100 * soma(rs, (r) => n(r.a80_89) + n(r.a90_99) + n(r.a100))) / Math.max(soma(rs, (r) => n(r.total)), 1) },
  { id: "su:frio", label: "Temperatura mínima (média da semana)", unidade: " °C", sentido: -1, valor: (rs) => soma(rs, (r) => n(r.tMin)) / rs.length },
  { id: "su:calor", label: "Temperatura máxima (média da semana)", unidade: " °C", sentido: 1, valor: (rs) => soma(rs, (r) => n(r.tMax)) / rs.length },
];

/**
 * Última semana com pelo menos 5 dias, comparada com as 8 semanas completas anteriores.
 * Nível pelo z na direção «pior»: ≥ 1 Atenção, ≥ 2 Alerta. Menos de 4 semanas de base: sem dados.
 */
export function indicadoresDaSemana(dias: DiaSU[]): SemanaSU | null {
  const porSemana = new Map<string, DiaSU[]>();
  for (const r of [...dias].sort((a, b) => a.date.localeCompare(b.date))) {
    const k = segunda(r.date);
    porSemana.set(k, [...(porSemana.get(k) ?? []), r]);
  }
  const semanas = [...porSemana].filter(([, rs]) => rs.length >= DIAS_MIN);
  if (!semanas.length) return null;
  const [semana, atuais] = semanas[semanas.length - 1];
  const base = semanas.slice(-1 - SEMANAS_BASE, -1).map(([, rs]) => rs);

  const indicadores = DEFS.map((d): Indicator => {
    const v = d.valor(atuais);
    if (base.length < MIN_BASE) return { id: d.id, label: d.label, level: "sem-dados", detail: `Semana de ${dataPt(semana)}: ${fmt(v)}${d.unidade}. Semanas anteriores insuficientes para comparar.` };
    const vals = base.map(d.valor);
    const m = media(vals), s = dp(vals);
    const z = s > 0 ? (d.sentido * (v - m)) / s : 0;
    const level: Level = z >= 2 ? "alerta" : z >= 1 ? "atencao" : "normal";
    const varPct = m ? ((v - m) / m) * 100 : 0;
    return {
      id: d.id,
      label: d.label,
      level,
      detail: `Semana de ${dataPt(semana)}: ${fmt(v)}${d.unidade}; média das ${base.length} semanas anteriores ${fmt(m)}${d.unidade} (DP ${fmt(s)}); ${varPct >= 0 ? "+" : "−"}${fmt(Math.abs(varPct), 0)} %; z = ${fmt(d.sentido * z, 1)}.`,
    };
  });
  return { semana, dias: atuais.length, base: base.length, indicadores };
}
