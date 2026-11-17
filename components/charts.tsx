"use client";
import {
  ResponsiveContainer, ComposedChart, LineChart, Line, Area, Bar, BarChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from "recharts";

export const axis = { stroke: "var(--ink-3)", fontSize: 12, tickLine: false };
const legendFmt = (v: string) => <span style={{ color: "var(--ink-2)" }}>{v}</span>;
export const grid = <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />;
export const tip = {
  contentStyle: { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 13, color: "var(--ink)" },
  labelStyle: { color: "var(--ink)", fontWeight: 700 },
};
export const nf = (d = 0) => (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? v.toLocaleString("pt-PT", { maximumFractionDigits: d }) : "—";
export const shortDate = (iso: string) => {
  const d = new Date(iso + "T12:00:00Z");
  return d.toLocaleDateString("pt-PT", { day: "numeric", month: "short" });
};

export type SeasonRow = { label: string; atual: number | null; anterior: number | null; base: number | null; banda: [number, number] | null };

/** Época atual vs época anterior vs linha de base (média ± 2 DP de 5 épocas). */
export function SeasonChart({ data, unit, digits = 0, title }: { data: SeasonRow[]; unit: string; digits?: number; title: string }) {
  return (
    <div className="chart" role="img" aria-label={title}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          {grid}
          <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={28} />
          <YAxis {...axis} width={52} tickFormatter={nf(digits)} domain={["auto", "auto"]} />
          <Tooltip {...tip} formatter={(v, n) => (Array.isArray(v) ? `${nf(digits)(v[0])} – ${nf(digits)(v[1])} ${unit}` : `${nf(digits)(v)} ${unit}`)} />
          <Legend wrapperStyle={{ fontSize: 13 }} formatter={legendFmt} />
          <Area dataKey="banda" name="Intervalo esperado (±2 DP)" stroke="none" fill="var(--band)" isAnimationActive={false} />
          <Line dataKey="base" name="Linha de base (5 épocas)" stroke="var(--c1)" strokeDasharray="4 4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          <Line dataKey="anterior" name="Época anterior" stroke="var(--c2)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          <Line dataKey="atual" name="Época atual" stroke="var(--c3)" strokeWidth={2.5} dot={false} isAnimationActive={false} connectNulls={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export type MeteoRow = { date: string; tMin: number; tMax: number; precip: number; gMin?: number | null; gMax?: number | null };
export function MeteoChart({ data, today }: { data: MeteoRow[]; today: string }) {
  return (
    <div className="chart" role="img" aria-label="Temperatura mínima e máxima no Porto (linhas contínuas) e em Gondomar (tracejado), com precipitação no Porto. Últimos 45 dias e próximos 7.">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          {grid}
          <XAxis dataKey="date" {...axis} tickFormatter={shortDate} minTickGap={28} />
          <YAxis yAxisId="t" {...axis} width={40} unit="°" />
          <YAxis yAxisId="p" orientation="right" {...axis} width={36} hide />
          <Tooltip {...tip} labelFormatter={(l) => shortDate(String(l))} formatter={(v, n) => (n === "Precipitação" ? `${nf(1)(v)} mm` : `${nf(1)(v)} °C`)} />
          <Legend wrapperStyle={{ fontSize: 13 }} formatter={legendFmt} />
          <Bar yAxisId="p" dataKey="precip" name="Precipitação (Porto)" fill="var(--accent-soft)" isAnimationActive={false} />
          <Line yAxisId="t" dataKey="tMax" name="Máxima Porto" stroke="var(--c3)" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line yAxisId="t" dataKey="tMin" name="Mínima Porto" stroke="var(--c4)" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line yAxisId="t" dataKey="gMax" name="Máxima Gondomar" stroke="var(--c3)" strokeWidth={1.5} strokeDasharray="5 3" dot={false} isAnimationActive={false} connectNulls={false} />
          <Line yAxisId="t" dataKey="gMin" name="Mínima Gondomar" stroke="var(--c4)" strokeWidth={1.5} strokeDasharray="5 3" dot={false} isAnimationActive={false} connectNulls={false} />
          <ReferenceLine yAxisId="t" x={today} stroke="var(--ink-3)" strokeDasharray="3 3" label={{ value: "hoje", fill: "var(--ink-3)", fontSize: 11, position: "insideTopRight" }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Barras mensais (valores em falta não se desenham). refs = linhas de referência horizontais. */
export function MonthlyBars({ data, title, unit, digits = 0, refs = [] }: { data: { mes: string; valor: number }[]; title: string; unit: string; digits?: number; refs?: { y: number; label: string }[] }) {
  const rows = data.map((d) => ({ mes: d.mes, valor: Number.isFinite(d.valor) ? d.valor : null }));
  const mesLongo = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("pt-PT", { month: "long", year: "numeric", timeZone: "Europe/Lisbon" });
  const mesCurto = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("pt-PT", { month: "short", year: "2-digit", timeZone: "Europe/Lisbon" });
  return (
    <div className="chart" role="img" aria-label={title}>
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          {grid}
          <XAxis dataKey="mes" {...axis} tickFormatter={mesCurto} minTickGap={16} />
          <YAxis {...axis} width={52} tickFormatter={nf(digits)} />
          <Tooltip {...tip} labelFormatter={(l) => mesLongo(String(l))} formatter={(v) => `${nf(digits)(v)} ${unit}`} />
          <Bar dataKey="valor" name={unit} fill="var(--c1)" isAnimationActive={false} />
          {refs.map((r) => (
            <ReferenceLine key={r.y} y={r.y} stroke="var(--c3)" strokeDasharray="4 4" label={{ value: r.label, fill: "var(--ink-3)", fontSize: 11, position: "insideTopLeft" }} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LocalDailyChart({ data }: { data: { date: string; total: number; ma7: number | null; tMed: number }[] }) {
  return (
    <div className="chart" role="img" aria-label="Episódios diários de urgência com média móvel de 7 dias e temperatura média">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: -8 }}>
          {grid}
          <XAxis dataKey="date" {...axis} tickFormatter={shortDate} minTickGap={32} />
          <YAxis yAxisId="n" {...axis} width={44} />
          <YAxis yAxisId="t" orientation="right" {...axis} width={36} unit="°" />
          <Tooltip {...tip} labelFormatter={(l) => shortDate(String(l))} formatter={(v, n) => (n === "Temperatura média" ? `${nf(1)(v)} °C` : nf(0)(v))} />
          <Legend wrapperStyle={{ fontSize: 13 }} formatter={legendFmt} />
          <Bar yAxisId="n" dataKey="total" name="Episódios/dia" fill="var(--accent-soft)" isAnimationActive={false} />
          <Line yAxisId="n" dataKey="ma7" name="Média móvel 7 dias" stroke="var(--c1)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
          <Line yAxisId="t" dataKey="tMed" name="Temperatura média" stroke="var(--c4)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function WeeklyDiagChart({ data }: { data: { semana: string; respiratorias: number; gastro: number }[] }) {
  return (
    <div className="chart sm" role="img" aria-label="Diagnósticos semanais de infeções respiratórias agudas e gastrointestinais">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          {grid}
          <XAxis dataKey="semana" {...axis} tickFormatter={shortDate} minTickGap={24} />
          <YAxis {...axis} width={36} />
          <Tooltip {...tip} labelFormatter={(l) => `Semana de ${shortDate(String(l))}`} />
          <Legend wrapperStyle={{ fontSize: 13 }} formatter={legendFmt} />
          <Bar dataKey="respiratorias" name="Infeções respiratórias agudas" stackId="a" fill="var(--c3)" isAnimationActive={false} />
          <Bar dataKey="gastro" name="Gastroenterite / diarreia" stackId="a" fill="var(--c4)" isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HBarChart({ data, x, y, label, unit = "%" }: { data: Record<string, number | string>[]; x: string; y: string; label: string; unit?: string }) {
  return (
    <div className="chart sm" role="img" aria-label={label}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" {...axis} tickFormatter={nf(0)} unit={unit} />
          <YAxis type="category" dataKey={y} {...axis} width={110} interval={0} />
          <Tooltip {...tip} formatter={(v) => `${nf(1)(v)}${unit}`} />
          <Bar dataKey={x} fill="var(--c1)" radius={[0, 4, 4, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DowChart({ data }: { data: { dia: string; media: number }[] }) {
  return (
    <div className="chart sm" role="img" aria-label="Média de episódios por dia da semana">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          {grid}
          <XAxis dataKey="dia" {...axis} />
          <YAxis {...axis} width={40} />
          <Tooltip {...tip} formatter={(v) => `${nf(0)(v)} episódios`} />
          <Bar dataKey="media" name="Média" fill="var(--c1)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const TRI = [
  ["vermelha", "Vermelha", "#c0262d"],
  ["laranja", "Laranja", "#e06c1b"],
  ["amarela", "Amarela", "#e3b505"],
  ["verde", "Verde", "#2e8b57"],
  ["azul", "Azul", "#2f6fb5"],
  ["branca", "Branca", "#b9c0cb"],
  ["semTriagem", "Sem triagem", "#7a8494"],
] as const;

export function ManchesterChart({ data }: { data: Record<string, number | string>[] }) {
  return (
    <div className="chart" role="img" aria-label="Atendimentos mensais na urgência por cor da triagem de Manchester">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          {grid}
          <XAxis dataKey="mes" {...axis} />
          <YAxis {...axis} width={68} tickFormatter={nf(0)} />
          <Tooltip {...tip} formatter={(v) => nf(0)(v)} />
          <Legend wrapperStyle={{ fontSize: 13 }} formatter={legendFmt} />
          {TRI.map(([k, n, c]) => (
            <Bar key={k} dataKey={k} name={n} stackId="m" fill={c} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SimpleLine({ data, unit, label, color = "var(--c1)", digits = 2 }: { data: { date: string; value: number }[]; unit: string; label: string; color?: string; digits?: number }) {
  return (
    <div className="chart sm" role="img" aria-label={label}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          {grid}
          <XAxis dataKey="date" {...axis} tickFormatter={shortDate} minTickGap={28} />
          <YAxis {...axis} width={48} tickFormatter={nf(digits)} />
          <Tooltip {...tip} labelFormatter={(l) => shortDate(String(l))} formatter={(v) => `${nf(digits)(v)} ${unit}`} />
          <Line dataKey="value" name={label} stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

