"use client";
// Gráfico de várias séries, matriz de correlação e comentário da IA (usados no Workspace). Só o resumo agregado sai do browser.
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip, Legend } from "recharts";
import { axis, grid, tip, nf, shortDate } from "@/components/charts";
import { aggregateByDate, alinharSeries, eixoDireito, normalizarIndice, matrizCorrelacao, resumoPadroes, MAX_SERIES_GRAFICO, type Table, type Period, type AggFn, type Pt, type Serie, type Matriz } from "@/lib/analise";
import estilos from "@/components/analise.module.css";

export type Tab = { nome: string; table: Table };
export type IA = { estado: "vazio" | "a-gerar" | "ok" | "erro"; linhas?: string[]; modelo?: string; erro?: string };
export type TipoGrafico = "linhas" | "barras" | "area";

const MAX_BYTES = 100 * 1024;
const PERIODOS: [Period, string][] = [["dia", "Dia"], ["semana", "Semana"], ["mes", "Mês"]];
const FUNCOES: [AggFn, string][] = [["soma", "Soma"], ["media", "Média"], ["contagem", "Contagem"]];
const UNIDADE: Record<Period, string> = { dia: "dias", semana: "semanas", mes: "meses" };
const TIPOS_GRAFICO: [TipoGrafico, string][] = [["linhas", "Linhas"], ["barras", "Barras"], ["area", "Área"]];
/** Cores das séries por ordem de escolha: a paleta do globals.css e duas extras (estilos.paleta). */
const CORES = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--serie-5)", "var(--serie-6)"];

/* ---------- Séries e leituras ---------- */

function serieDe(t: Tab, ci: number, periodo: Period, fn: AggFn): Pt[] {
  const cols = t.table.columns;
  const dCol = cols.find((c) => c.type === "date");
  if (!dCol) return [];
  if (ci < 0) return aggregateByDate(dCol.values, dCol.values.map((v) => (v == null ? null : 1)), periodo, "contagem");
  return aggregateByDate(dCol.values, cols[ci].values, periodo, fn);
}

/* ---------- Gráficos ---------- */

/** Índices como o ÍCARO ficam entre 0 e 2: com valores pequenos o eixo mostra casas decimais para as marcas não se repetirem. */
const marcaEixo = (v: number) => nf(v === 0 || Math.abs(v) >= 10 ? 0 : Math.abs(v) < 1 ? 2 : 1)(v);

/** Séries escolhidas no mesmo gráfico; as marcadas em `direita` usam o eixo direito. */
function SeriesGrafico({ dados, series, direita, tipo, label }: { dados: Record<string, string | number | null>[]; series: Serie[]; direita: boolean[]; tipo: TipoGrafico; label: string }) {
  const temDireita = direita.some(Boolean);
  const marcas = series.map((s, i) => {
    const props = { dataKey: `s${i}`, name: s.label, yAxisId: direita[i] ? "dir" : "esq", isAnimationActive: false };
    if (tipo === "barras") return <Bar key={i} {...props} fill={CORES[i]} />;
    if (tipo === "area") return <Area key={i} {...props} type="monotone" stroke={CORES[i]} fill={CORES[i]} fillOpacity={0.2} connectNulls />;
    return <Line key={i} {...props} type="monotone" stroke={CORES[i]} strokeWidth={2} dot={false} connectNulls />;
  });
  // Recharts procura eixos e marcas entre os filhos diretos: não os envolver num Fragment.
  const Quadro = tipo === "barras" ? BarChart : tipo === "area" ? AreaChart : LineChart;
  return (
    <div className={`chart ${estilos.paleta}`} role="img" aria-label={label}>
      <ResponsiveContainer>
        <Quadro data={dados} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          {grid}
          <XAxis dataKey="date" {...axis} tickFormatter={shortDate} minTickGap={28} />
          <YAxis yAxisId="esq" {...axis} width={52} tickFormatter={marcaEixo} />
          {temDireita && <YAxis yAxisId="dir" orientation="right" {...axis} width={52} tickFormatter={marcaEixo} />}
          <Tooltip {...tip} labelFormatter={(l) => shortDate(String(l))} formatter={(v) => nf(2)(v)} />
          <Legend wrapperStyle={{ fontSize: 13, color: "var(--ink-2)" }} />
          {marcas}
        </Quadro>
      </ResponsiveContainer>
    </div>
  );
}

/** Fundo da célula pela força de r: verde para positiva, vermelho para negativa; mais intenso quanto mais forte. */
function fundoCorrelacao(r: number): string | undefined {
  if (!Number.isFinite(r)) return undefined;
  const pct = Math.round(Math.min(1, Math.abs(r)) * 50);
  return `color-mix(in srgb, ${r < 0 ? "var(--bad)" : "var(--accent)"} ${pct}%, var(--surface))`;
}

function MatrizCorrelacao({ m, label }: { m: Matriz; label: string }) {
  return (
    <div className="table-wrap">
      <table className={`col-table ${estilos.matriz}`}>
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Variável</th>
            {m.nomes.map((nome, j) => <th key={j} scope="col">{nome}</th>)}
          </tr>
        </thead>
        <tbody>
          {m.nomes.map((nome, i) => (
            <tr key={i}>
              <th scope="row">{nome}</th>
              {m.r[i].map((r, j) => (
                <td key={j} className={estilos.celula} style={{ background: fundoCorrelacao(r) }}>
                  <strong>{nf(2)(r)}</strong>
                  <small>n = {m.n[i][j]}</small>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Séries de uma tabela (gráfico, matriz e comentário de IA) ---------- */

type SeriesProps = {
  t: Tab;
  periodo: Period;
  onPeriodo: (p: Period) => void;
  funcao: AggFn;
  onFuncao: (f: AggFn) => void;
  tipo: TipoGrafico;
  onTipo: (t: TipoGrafico) => void;
  normalizar: boolean;
  onNormalizar: (v: boolean) => void;
  escolha: number[];
  onEscolha: (cis: number[]) => void;
  ia: IA;
  onAnalisar: (series: Serie[]) => void;
  /** Na Vigilância, período e função vêm da secção Correlação; noutras páginas não há essa secção. */
  notaCorrelacao?: boolean;
};

export function SeriesTabela({ t, periodo, onPeriodo, funcao, onFuncao, tipo, onTipo, normalizar, onNormalizar, escolha, onEscolha, ia, onAnalisar, notaCorrelacao = true }: SeriesProps) {
  const numericos = t.table.columns.flatMap((c, ci) => (c.type === "number" ? [ci] : []));
  const escolhidas = escolha.filter((ci) => numericos.includes(ci)).slice(0, MAX_SERIES_GRAFICO);
  const series: Serie[] = escolhidas.map((ci) => ({ label: t.table.columns[ci].name, pts: serieDe(t, ci, periodo, funcao) }));
  // Normalizado, todas as séries ficam em torno de 100: não há necessidade de eixo direito.
  const direita = normalizar ? series.map(() => false) : eixoDireito(series);
  const exibidas: Serie[] = normalizar ? series.map((s) => ({ label: s.label, pts: normalizarIndice(s.pts) })) : series;
  const dados = alinharSeries(exibidas);
  const nomesDireita = series.filter((_, i) => direita[i]).map((s) => s.label);
  const nomes = series.map((s) => s.label).join(", ");

  // Agrupa as variáveis pela origem («Semana · …», «Diário · …»); sem prefixo ficam em «Variáveis».
  const grupos = [...numericos.reduce((m, ci) => {
    const nome = t.table.columns[ci].name;
    const g = nome.includes(" · ") ? nome.split(" · ")[0] : "Variáveis";
    return m.set(g, [...(m.get(g) ?? []), ci]);
  }, new Map<string, number[]>())];

  const livres = numericos.filter((ci) => !escolhidas.includes(ci));
  const rotulo = (ci: number, grupo: string) => { const n = t.table.columns[ci].name; return n.startsWith(`${grupo} · `) ? n.slice(grupo.length + 3) : n; };

  return (
    <>
      <h3 className="sub-h">Séries no tempo · {PERIODOS.find((p) => p[0] === periodo)?.[1]} · {FUNCOES.find((f) => f[0] === funcao)?.[1]}</h3>
      <div className={estilos.variaveis}>
        <p className={estilos.legendaGrupos}>Variáveis (até {MAX_SERIES_GRAFICO})</p>
        {escolhidas.map((ci, k) => (
          <div key={k} className={estilos.linhaVariavel}>
            <span className={estilos.amostraCor} style={{ background: CORES[k] }} aria-hidden="true" />
            <label className="field">
              <span className="sr-only">Variável {k + 1}</span>
              <select value={ci} onChange={(e) => onEscolha(escolhidas.map((x, j) => (j === k ? Number(e.target.value) : x)))}>
                {grupos.map(([grupo, cis]) => (
                  <optgroup key={grupo} label={grupo}>
                    {cis.filter((c) => c === ci || !escolhidas.includes(c)).map((c) => <option key={c} value={c}>{rotulo(c, grupo)}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
            <button type="button" className="btn ghost" disabled={escolhidas.length <= 1} onClick={() => onEscolha(escolhidas.filter((_, j) => j !== k))} aria-label={`Tirar ${t.table.columns[ci].name}`}>Tirar</button>
          </div>
        ))}
        {escolhidas.length < MAX_SERIES_GRAFICO && livres.length > 0 && (
          <button type="button" className="btn ghost" onClick={() => onEscolha([...escolhidas, livres[0]])}>+ Adicionar variável</button>
        )}
      </div>
      <div className={estilos.controlos}>
        <label className="field">
          Tipo de gráfico
          <select value={tipo} onChange={(e) => onTipo(e.target.value as TipoGrafico)}>
            {TIPOS_GRAFICO.map(([k, rotulo]) => <option key={k} value={k}>{rotulo}</option>)}
          </select>
        </label>
        <label className="field">
          Período
          <select value={periodo} onChange={(e) => onPeriodo(e.target.value as Period)}>
            {PERIODOS.map(([k, rotulo]) => <option key={k} value={k}>{rotulo}</option>)}
          </select>
        </label>
        <label className="field">
          Função
          <select value={funcao} onChange={(e) => onFuncao(e.target.value as AggFn)}>
            {FUNCOES.map(([k, rotulo]) => <option key={k} value={k}>{rotulo}</option>)}
          </select>
        </label>
        <label className={estilos.marca}>
          <input type="checkbox" checked={normalizar} onChange={(e) => onNormalizar(e.target.checked)} />
          Normalizar (índice 100 = média)
        </label>
      </div>
      {notaCorrelacao && <p className="hint">Período e função são os mesmos da secção Correlação.</p>}

      {series.length === 0 ? (
        <p className="hint">Escolha pelo menos uma variável numérica.</p>
      ) : (
        <>
          {normalizar && <p className={estilos.nota}>Cada série está dividida pela sua média e multiplicada por 100.</p>}
          {dados.length === 0 ? (
            <p className="hint">Sem valores para as variáveis escolhidas.</p>
          ) : (
            <SeriesGrafico
              dados={dados}
              series={exibidas}
              direita={direita}
              tipo={tipo}
              label={`${nomes} em ${t.nome}, por ${UNIDADE[periodo]}`}
            />
          )}
          {nomesDireita.length > 0 && (
            <p className={estilos.nota}>Eixo direito: {nomesDireita.join(", ")} (escala pelo menos 10× menor que a das restantes).</p>
          )}

          <div className="row-actions">
            <button type="button" className="btn ghost" onClick={() => onAnalisar(series)} disabled={ia.estado === "a-gerar"}>
              {ia.estado === "a-gerar" ? "A comentar…" : "Comentar padrões com IA"}
            </button>
          </div>
          <p role="status" aria-live="polite" className="hint">{ia.estado === "a-gerar" ? "A gerar o comentário…" : ""}</p>
          {ia.estado === "erro" && <p role="alert" className="form-error">{ia.erro}</p>}
          {ia.estado === "ok" && ia.linhas && (
            <div className="ai">
              <div className="ai-meta">
                <span className="tag">Gerado por IA · por validar</span>
                {ia.modelo && <span>{ia.modelo}</span>}
              </div>
              <ul>{ia.linhas.map((l, i) => <li key={i}>{l}</li>)}</ul>
              <p className="hint">Comentário gerado por IA a partir de resumos agregados; confirme antes de usar.</p>
            </div>
          )}

          {series.length >= 2 && (
            <>
              <h4>Correlação entre variáveis</h4>
              <MatrizCorrelacao
                m={matrizCorrelacao(series)}
                label={`Correlação de Pearson entre ${nomes} (agregado por ${UNIDADE[periodo]}, sem desfasamento)`}
              />
              <p className="hint">Verde: relação positiva; vermelho: negativa; cor mais intensa, relação mais forte. Correlação não implica causalidade.</p>
            </>
          )}
        </>
      )}
    </>
  );
}

/** Pede à IA um comentário sobre os padrões das séries. Envia só o resumo agregado (médias, picos, correlações). */
export async function pedirPadroes(tabela: string, series: Serie[], periodo: Period, funcao: AggFn): Promise<IA> {
  const corpo = JSON.stringify({ tipo: "padroes", tabela, ...resumoPadroes(series, periodo, funcao) });
  if (new TextEncoder().encode(corpo).length > MAX_BYTES) return { estado: "erro", erro: "O resumo é demasiado grande: escolha menos variáveis." };
  try {
    const res = await fetch("/api/analise-ia", { method: "POST", headers: { "Content-Type": "application/json" }, body: corpo });
    const j = (await res.json()) as { ok: boolean; text?: string[]; model?: string; error?: string };
    return j.ok && j.text ? { estado: "ok", linhas: j.text, modelo: j.model } : { estado: "erro", erro: j.error ?? "Erro desconhecido." };
  } catch {
    return { estado: "erro", erro: "Não foi possível contactar o servidor." };
  }
}
