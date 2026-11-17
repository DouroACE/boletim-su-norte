"use client";
// Análise de ficheiros CSV/Excel. Tudo corre no browser; o servidor só recebe o resumo agregado (botão de IA).
import { useEffect, useMemo, useRef, useState } from "react";
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, AreaChart, Area, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { axis, grid, tip, nf, shortDate } from "@/components/charts";
import { parseCSV, toTable, retype, aggregateByDate, correlate, summarize, alinharSeries, eixoDireito, normalizarIndice, matrizCorrelacao, resumoPadroes, MAX_SERIES_GRAFICO, type Table, type ColType, type Period, type AggFn, type Pt, type Column, type Serie, type Matriz } from "@/lib/analise";
import { agregarMensal, detectarModelo, tabelaComCensura, type PredefCorr } from "@/lib/modelos";
import { PainelMensal, PainelModelo, QualidadeDados } from "@/components/analise-modelos";
import estilos from "@/app/analise/analise.module.css";

export type Tab = { nome: string; table: Table };
type StoredCol = { name: string; type: ColType; values: (string | number | null)[] };
type StoredTab = { nome: string; nRegistos: number; colunas: StoredCol[] };
export type StoredProjeto = { id?: number; nome: string; criado: string; tabelas: StoredTab[] };
/** Série disponível para correlação: coluna numérica (ci ≥ 0) ou contagem de registos por data (ci = -1). */
type Fonte = { key: string; label: string; ti: number; ci: number };
export type IA = { estado: "vazio" | "a-gerar" | "ok" | "erro"; linhas?: string[]; modelo?: string; erro?: string };
export type TipoGrafico = "linhas" | "barras" | "area";

const DB_NOME = "analise-uls";
const STORE = "projetos";
const MAX_BYTES = 100 * 1024;
const TIPO_TEXTO: Record<ColType, string> = { date: "Data", number: "Número", category: "Categoria" };
const PERIODOS: [Period, string][] = [["dia", "Dia"], ["semana", "Semana"], ["mes", "Mês"]];
const FUNCOES: [AggFn, string][] = [["soma", "Soma"], ["media", "Média"], ["contagem", "Contagem"]];
const UNIDADE: Record<Period, string> = { dia: "dias", semana: "semanas", mes: "meses" };
const TIPOS_GRAFICO: [TipoGrafico, string][] = [["linhas", "Linhas"], ["barras", "Barras"], ["area", "Área"]];
/** Cores das séries por ordem de escolha: a paleta do globals.css e duas extras (estilos.paleta). */
const CORES = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--serie-5)", "var(--serie-6)"];
const DEMO = ["/demo/ULSSA_DEMO_FICTICIO.xlsx", "/demo/Vigilancia_DEMO_FICTICIO.xlsx"];
const AVISO_FICTICIO = "Dados fictícios de demonstração — não correspondem a atividade real.";

/* ---------- IndexedDB (sem dependências; só no browser) ---------- */

function abrirDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NOME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function dbOp<T>(modo: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await abrirDb();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, modo);
    const req = op(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(req.result); };
    t.onerror = () => { db.close(); reject(t.error); };
    t.onabort = () => { db.close(); reject(t.error); };
  });
}

/* ---------- Conversão para guardar (datas como ISO) ---------- */

const paraGuardar = (t: Tab): StoredTab => ({
  nome: t.nome,
  nRegistos: t.table.nRows,
  colunas: t.table.columns.map((c) => ({
    name: c.name,
    type: c.type,
    values: c.values.map((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v)),
  })),
});

export const deGuardado = (s: StoredTab): Tab => ({
  nome: s.nome,
  table: {
    nRows: s.nRegistos,
    columns: s.colunas.map((c) => ({
      name: c.name,
      type: c.type,
      values: c.values.map((v) => (c.type === "date" && typeof v === "string" ? new Date(v + "T00:00:00Z") : v)),
    })),
  },
});

/* ---------- Séries e leituras ---------- */

function fontesDe(tabs: Tab[]): Fonte[] {
  return tabs.flatMap((t, ti) => {
    const out: Fonte[] = [];
    if (t.table.columns.some((c) => c.type === "date")) out.push({ key: `${ti}:-1`, label: `${t.nome} · registos por data`, ti, ci: -1 });
    t.table.columns.forEach((c, ci) => {
      if (c.type === "number") out.push({ key: `${ti}:${ci}`, label: `${t.nome} · ${c.name}`, ti, ci });
    });
    return out;
  });
}

function serieDe(t: Tab, ci: number, periodo: Period, fn: AggFn): Pt[] {
  const cols = t.table.columns;
  const dCol = cols.find((c) => c.type === "date");
  if (!dCol) return [];
  if (ci < 0) return aggregateByDate(dCol.values, dCol.values.map((v) => (v == null ? null : 1)), periodo, "contagem");
  return aggregateByDate(dCol.values, cols[ci].values, periodo, fn);
}

function topCategorias(values: Column["values"]): { nome: string; n: number }[] {
  const m = new Map<string, number>();
  for (const v of values) if (v != null) m.set(String(v), (m.get(String(v)) ?? 0) + 1);
  return [...m].map(([nome, n]) => ({ nome, n })).sort((a, b) => b.n - a.n).slice(0, 10);
}

function leitura(r: number, n: number): string {
  if (!Number.isFinite(r)) return `Dados insuficientes para medir a correlação (n = ${n}; são precisos pelo menos 8 pares com data comum).`;
  const a = Math.abs(r);
  if (a < 0.1) return "Correlação muito fraca ou inexistente.";
  const forca = a < 0.3 ? "fraca" : a < 0.5 ? "moderada" : a < 0.7 ? "forte" : "muito forte";
  return `Correlação ${forca} ${r > 0 ? "positiva" : "negativa"}.`;
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

function CategoriaChart({ data, label }: { data: { nome: string; n: number }[]; label: string }) {
  return (
    <div className="chart sm" role="img" aria-label={label} style={{ height: Math.max(220, data.length * 32 + 40) }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" {...axis} allowDecimals={false} />
          <YAxis type="category" dataKey="nome" {...axis} width={120} interval={0} />
          <Tooltip {...tip} formatter={(v) => `${nf(0)(v)} registos`} />
          <Bar dataKey="n" fill="var(--c1)" radius={[0, 4, 4, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Dispersao({ pares, x, y }: { pares: { x: number; y: number }[]; x: string; y: string }) {
  return (
    <div className="chart" role="img" aria-label={`Dispersão de ${x} contra ${y}, ${pares.length} pares com data comum`}>
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          {grid}
          <XAxis type="number" dataKey="x" name={x} {...axis} tickFormatter={nf(1)} />
          <YAxis type="number" dataKey="y" name={y} {...axis} width={52} tickFormatter={nf(1)} />
          <Tooltip {...tip} cursor={{ strokeDasharray: "3 3" }} formatter={(v) => nf(2)(v)} />
          <Scatter data={pares} fill="var(--c1)" isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

function LagChart({ lags, label }: { lags: { lag: number; r: number }[]; label: string }) {
  const data = lags.map((l) => ({ lag: l.lag, r: Number.isFinite(l.r) ? l.r : null }));
  return (
    <div className="chart" role="img" aria-label={label}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          {grid}
          <XAxis dataKey="lag" {...axis} interval="preserveStartEnd" />
          <YAxis domain={[-1, 1]} {...axis} width={40} tickFormatter={nf(1)} />
          <Tooltip {...tip} labelFormatter={(l) => `Desfasamento ${l}`} formatter={(v) => nf(2)(v)} />
          <Bar dataKey="r" name="r" fill="var(--c1)" isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
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

  const alternar = (ci: number) =>
    onEscolha(escolhidas.includes(ci) ? escolhidas.filter((x) => x !== ci) : [...escolhidas, ci]);

  return (
    <>
      <h3 className="sub-h">Séries no tempo · {PERIODOS.find((p) => p[0] === periodo)?.[1]} · {FUNCOES.find((f) => f[0] === funcao)?.[1]}</h3>
      <fieldset className={estilos.escolha}>
        <legend>Variáveis (de 1 a {MAX_SERIES_GRAFICO})</legend>
        {numericos.map((ci) => {
          const marcado = escolhidas.includes(ci);
          const bloqueado = marcado ? escolhidas.length <= 1 : escolhidas.length >= MAX_SERIES_GRAFICO;
          return (
            <label key={ci} className={estilos.opcao}>
              <input type="checkbox" checked={marcado} disabled={bloqueado} onChange={() => alternar(ci)} />
              <span>{t.table.columns[ci].name}</span>
            </label>
          );
        })}
      </fieldset>
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

/* ---------- Componente principal ---------- */

export function Analise() {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [nome, setNome] = useState("");
  const [projetos, setProjetos] = useState<StoredProjeto[]>([]);
  const [estado, setEstado] = useState("");
  const [arrastar, setArrastar] = useState(false);
  const [aLer, setALer] = useState(false);
  const [periodo, setPeriodo] = useState<Period>("semana");
  const [funcao, setFuncao] = useState<AggFn>("media");
  const [xKey, setXKey] = useState("");
  const [yKey, setYKey] = useState("");
  const [maxLag, setMaxLag] = useState(14);
  const [ia, setIa] = useState<IA>({ estado: "vazio" });
  const [tipoGrafico, setTipoGrafico] = useState<TipoGrafico>("linhas");
  const [normalizar, setNormalizar] = useState(false);
  /** Colunas numéricas escolhidas por tabela (índice da tabela → índices de coluna). */
  const [escolhas, setEscolhas] = useState<Record<number, number[]>>({});
  /** Comentário de padrões da IA por tabela. */
  const [iaPadroes, setIaPadroes] = useState<Record<number, IA>>({});
  const entrada = useRef<HTMLInputElement>(null);

  const recarregar = () =>
    dbOp<StoredProjeto[]>("readonly", (s) => s.getAll())
      .then(setProjetos)
      .catch(() => setEstado("IndexedDB indisponível neste browser: os projetos não podem ser guardados."));

  useEffect(() => { void recarregar(); }, []);
  // Link de demonstração: /analise?demo=1 abre com os dados fictícios já carregados.
  useEffect(() => { if (new URLSearchParams(window.location.search).get("demo") === "1") void carregarDemo(); }, []);

  const fontes = useMemo(() => fontesDe(tabs), [tabs]);
  const fx = fontes.find((f) => f.key === xKey) ?? fontes[0];
  const fy = fontes.find((f) => f.key === yKey) ?? fontes[1] ?? fontes[0];

  const corr = useMemo(() => {
    if (!fx || !fy) return null;
    const a = serieDe(tabs[fx.ti], fx.ci, periodo, funcao);
    const b = serieDe(tabs[fy.ti], fy.ci, periodo, funcao);
    const bm = new Map(b.map((p) => [p.date, p.value]));
    const pares = a.flatMap((p) => {
      const v = bm.get(p.date);
      return v === undefined ? [] : [{ x: p.value, y: v }];
    });
    return { c: correlate(a, b, maxLag), pares, nomeX: fx.label, nomeY: fy.label };
  }, [tabs, fx, fy, periodo, funcao, maxLag]);

  // A análise de IA deixa de corresponder assim que muda o que está a ser analisado.
  useEffect(() => { setIa({ estado: "vazio" }); }, [tabs, fx, fy, periodo, funcao, maxLag]);
  // O mesmo para o comentário de padrões: deixa de corresponder quando mudam as séries ou o período.
  useEffect(() => { setIaPadroes({}); }, [tabs, periodo, funcao, escolhas]);

  async function carregar(lista: File[]) {
    if (!lista.length) return;
    setALer(true);
    setEstado(`A ler ${lista.length} ficheiro(s)…`);
    const novos: Tab[] = [];
    const erros: string[] = [];
    for (const f of lista) {
      const ext = f.name.split(".").pop()?.toLowerCase();
      try {
        if (ext === "csv") {
          novos.push({ nome: f.name, table: tabelaComCensura(parseCSV(await f.text()), toTable) });
        } else if (ext === "xlsx") {
          const { default: lerXlsx } = await import("read-excel-file/browser");
          for (const folha of await lerXlsx(f)) {
            novos.push({ nome: `${f.name} · ${folha.sheet}`, table: tabelaComCensura(folha.data as unknown as (string | number | Date | null)[][], toTable) });
          }
        } else {
          erros.push(`${f.name}: formato não suportado (use .xlsx ou .csv; o .xls antigo não é suportado).`);
        }
      } catch (e) {
        erros.push(`${f.name}: não foi possível ler (${(e as Error).message}).`);
      }
    }
    const validos = novos.filter((t) => t.table.columns.length > 0);
    setTabs((prev) => [...prev, ...validos]);
    setALer(false);
    setEstado([validos.length ? `${validos.length} tabela(s) carregada(s).` : "", ...erros].filter(Boolean).join(" "));
  }

  /** Carrega os ficheiros de demonstração pelo mesmo caminho que os ficheiros arrastados. */
  async function carregarDemo() {
    setEstado("A carregar dados de demonstração…");
    try {
      const ficheiros = await Promise.all(
        DEMO.map(async (url) => {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return new File([await res.blob()], url.split("/").pop() ?? "demo.xlsx");
        }),
      );
      await carregar(ficheiros);
    } catch (e) {
      setEstado(`Não foi possível carregar os dados de demonstração (${(e as Error).message}).`);
    }
  }

  /** Comentário da IA sobre os padrões das séries escolhidas. Envia só o resumo agregado. */
  async function analisarPadroes(ti: number, series: Serie[]) {
    const marca = (r: IA) => setIaPadroes((p) => ({ ...p, [ti]: r }));
    marca({ estado: "a-gerar" });
    marca(await pedirPadroes(tabs[ti].nome, series, periodo, funcao));
  }

  const alterarTipo = (ti: number, ci: number, tipo: ColType) =>
    setTabs((prev) =>
      prev.map((t, i) =>
        i !== ti ? t : { ...t, table: { ...t.table, columns: t.table.columns.map((c, j) => (j === ci ? retype(c, tipo) : c)) } },
      ),
    );

  async function guardar() {
    if (!tabs.length) { setEstado("Carregue ficheiros antes de guardar."); return; }
    try {
      await dbOp<IDBValidKey>("readwrite", (s) =>
        s.add({ nome: nome.trim() || "Projeto sem nome", criado: new Date().toISOString(), tabelas: tabs.map(paraGuardar) }),
      );
      setEstado("Projeto guardado neste browser.");
      void recarregar();
    } catch {
      setEstado("Não foi possível guardar o projeto.");
    }
  }

  function abrir(p: StoredProjeto) {
    if (tabs.length && !window.confirm("Substituir o projeto atual, ainda não guardado?")) return;
    setTabs(p.tabelas.map(deGuardado));
    setNome(p.nome);
    setXKey("");
    setYKey("");
    setEstado(`Projeto "${p.nome}" aberto.`);
  }

  async function apagar(p: StoredProjeto) {
    const id = p.id;
    if (id == null || !window.confirm(`Apagar o projeto "${p.nome}"? Esta ação não se pode desfazer.`)) return;
    try {
      await dbOp<undefined>("readwrite", (s) => s.delete(id));
      setEstado(`Projeto "${p.nome}" apagado.`);
      void recarregar();
    } catch {
      setEstado("Não foi possível apagar o projeto.");
    }
  }

  function novo() {
    if (tabs.length && !window.confirm("Descartar o projeto atual, ainda não guardado?")) return;
    setTabs([]);
    setNome("");
    setEstado("");
  }

  /** Preenche a secção Correlação com os parâmetros de uma predefinição de modelo. */
  function aplicarPredef(p: PredefCorr) {
    setXKey(p.x);
    setYKey(p.y);
    setPeriodo(p.periodo);
    setFuncao(p.funcao);
    setMaxLag(p.maxLag);
    document.getElementById("h-corr")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  const modelos = tabs.map((t) => detectarModelo(t.table));
  const mensal = useMemo(() => agregarMensal(tabs.map((t) => t.table)), [tabs]);
  const temMensal = !!(mensal.su || mensal.intern || mensal.sud || mensal.csp || mensal.icpc || mensal.virus);

  async function analisarIa() {
    if (!corr) return;
    setIa({ estado: "a-gerar" });
    const corpo = JSON.stringify({
      resumo: tabs.map((t) => ({ tabela: t.nome, ...summarize(t.table) })),
      correlacao: {
        x: corr.nomeX,
        y: corr.nomeY,
        periodo,
        funcao,
        desfasamentoMax: maxLag,
        n: corr.c.n,
        pearson: corr.c.pearson,
        spearman: corr.c.spearman,
        melhorDesfasamento: corr.c.bestLag,
      },
    });
    if (new TextEncoder().encode(corpo).length > MAX_BYTES) {
      setIa({ estado: "erro", erro: "O resumo é demasiado grande: carregue menos colunas." });
      return;
    }
    try {
      const res = await fetch("/api/analise-ia", { method: "POST", headers: { "Content-Type": "application/json" }, body: corpo });
      const j = (await res.json()) as { ok: boolean; text?: string[]; model?: string; error?: string };
      setIa(j.ok && j.text ? { estado: "ok", linhas: j.text, modelo: j.model } : { estado: "erro", erro: j.error ?? "Erro desconhecido." });
    } catch {
      setIa({ estado: "erro", erro: "Não foi possível contactar o servidor." });
    }
  }

  const melhor = corr?.c.bestLag;
  const textoLag =
    !melhor || melhor.lag === 0 || !Number.isFinite(melhor.r)
      ? "Sem desfasamento relevante."
      : melhor.lag > 0
        ? `${corr.nomeX} tende a anteceder ${corr.nomeY} em ${melhor.lag} ${UNIDADE[periodo]}.`
        : `${corr.nomeY} tende a anteceder ${corr.nomeX} em ${-melhor.lag} ${UNIDADE[periodo]}.`;

  const temFicticio = tabs.some((t) => /FICTICIO/i.test(t.nome));

  return (
    <div className="analise">
      {temFicticio && <p role="note" className={estilos.avisoFicticio}>{AVISO_FICTICIO}</p>}
      <section aria-labelledby="h-modelo" className="card">
        <h2 id="h-modelo">Ficheiro mensal da ULSSA</h2>
        <p><a className="btn" href="/api/modelo-mensal" download>Descarregar modelo (.xlsx)</a></p>
        <p className="hint">Preencha um ficheiro por mês (ULSSA_saude_sazonal_AAAA-MM.xlsx) e arraste-o para aqui. Junte vários meses no mesmo projeto para comparar com o ano anterior.</p>
      </section>

      <section aria-labelledby="h-ficheiros" className="card">
        <h2 id="h-ficheiros">Ficheiros</h2>
        <div
          className={`dropzone${arrastar ? " over" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setArrastar(true); }}
          onDragLeave={() => setArrastar(false)}
          onDrop={(e) => { e.preventDefault(); setArrastar(false); void carregar(Array.from(e.dataTransfer.files)); }}
        >
          <p>Arraste aqui ficheiros <strong>.xlsx</strong> ou <strong>.csv</strong>, ou</p>
          <button type="button" className="btn" onClick={() => entrada.current?.click()} disabled={aLer}>Escolher ficheiros</button>
          <input
            ref={entrada}
            type="file"
            multiple
            accept=".xlsx,.xls,.csv"
            hidden
            onChange={(e) => {
              void carregar(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </div>
        <p className="hint">Os ficheiros ficam só neste browser; nada é enviado para o servidor.</p>
        <div className="row-actions">
          <button type="button" className="btn ghost" onClick={() => void carregarDemo()} disabled={aLer}>Carregar dados de demonstração (fictícios)</button>
        </div>
        <p role="status" aria-live="polite" className="hint">{estado}</p>
      </section>

      <section aria-labelledby="h-projetos" className="card">
        <h2 id="h-projetos">Projetos</h2>
        <div className="opts">
          <label className="field">
            Nome do projeto
            <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Projeto sem nome" />
          </label>
          <div className="row-actions">
            <button type="button" className="btn" onClick={guardar} disabled={!tabs.length}>Guardar projeto</button>
            <button type="button" className="btn ghost" onClick={novo}>Novo projeto</button>
          </div>
        </div>
        {projetos.length ? (
          <ul className="proj-list">
            {projetos.map((p) => (
              <li key={p.id}>
                <span><strong>{p.nome}</strong> · {p.tabelas.length} tabela(s) · {new Date(p.criado).toLocaleDateString("pt-PT")}</span>
                <span className="row-actions">
                  <button type="button" className="btn ghost" onClick={() => abrir(p)} aria-label={`Abrir ${p.nome}`}>Abrir</button>
                  <button type="button" className="btn danger" onClick={() => apagar(p)} aria-label={`Apagar ${p.nome}`}>Apagar</button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">Ainda não há projetos guardados.</p>
        )}
      </section>

      {temMensal && (
        <section aria-labelledby="h-mensal-ulssa" className="card">
          <h2 id="h-mensal-ulssa">Painel mensal ULSSA</h2>
          <PainelMensal m={mensal} />
        </section>
      )}

      {tabs.map((t, ti) => (
        <section key={ti} aria-labelledby={`h-tab-${ti}`} className="card">
          <h2 id={`h-tab-${ti}`}>{t.nome}</h2>
          <p className="hint">{t.table.nRows} registos · {t.table.columns.length} colunas</p>
          {modelos[ti] && <PainelModelo modelo={modelos[ti]} tabelas={tabs} ti={ti} aplicar={aplicarPredef} />}
          <div className="table-wrap">
            <table className="col-table">
              <caption className="sr-only">Colunas de {t.nome} e tipo detetado</caption>
              <thead>
                <tr><th scope="col">Coluna</th><th scope="col">Tipo</th><th scope="col">Preenchidas</th></tr>
              </thead>
              <tbody>
                {t.table.columns.map((c, ci) => (
                  <tr key={ci}>
                    <th scope="row">{c.name}</th>
                    <td>
                      <label className="sr-only" htmlFor={`tipo-${ti}-${ci}`}>Tipo da coluna {c.name}</label>
                      <select id={`tipo-${ti}-${ci}`} value={c.type} onChange={(e) => alterarTipo(ti, ci, e.target.value as ColType)}>
                        {(Object.keys(TIPO_TEXTO) as ColType[]).map((k) => <option key={k} value={k}>{TIPO_TEXTO[k]}</option>)}
                      </select>
                    </td>
                    <td>{c.values.filter((v) => v != null).length} / {t.table.nRows}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <QualidadeDados table={t.table} />

          {t.table.columns.some((c) => c.type === "date") ? (
            <SeriesTabela
              t={t}
              periodo={periodo}
              onPeriodo={setPeriodo}
              funcao={funcao}
              onFuncao={setFuncao}
              tipo={tipoGrafico}
              onTipo={setTipoGrafico}
              normalizar={normalizar}
              onNormalizar={setNormalizar}
              escolha={escolhas[ti] ?? t.table.columns.flatMap((c, ci) => (c.type === "number" ? [ci] : [])).slice(0, 1)}
              onEscolha={(cis) => setEscolhas((p) => ({ ...p, [ti]: cis }))}
              ia={iaPadroes[ti] ?? { estado: "vazio" }}
              onAnalisar={(series) => void analisarPadroes(ti, series)}
            />
          ) : (
            <p className="hint">Sem coluna de data: não há séries temporais. Veja as categorias abaixo.</p>
          )}

          {t.table.columns.some((c) => c.type === "category") && (
            <>
              <h3 className="sub-h">Categorias (top 10 por contagem)</h3>
              <div className="analise-grid">
                {t.table.columns.map((c, ci) =>
                  c.type !== "category" ? null : (
                    <div key={ci} className="analise-item">
                      <h4>{c.name}</h4>
                      <CategoriaChart data={topCategorias(c.values)} label={`Top 10 de ${c.name} em ${t.nome}`} />
                    </div>
                  ),
                )}
              </div>
            </>
          )}
        </section>
      ))}

      {fontes.length >= 2 && corr && (
        <section aria-labelledby="h-corr" className="card">
          <h2 id="h-corr">Correlação</h2>
          <p className="hint">As séries são agregadas por data comum. Um desfasamento k compara a variável X com a Y k períodos depois.</p>
          <div className="opts">
            <label className="field">
              Variável X
              <select value={fx?.key} onChange={(e) => setXKey(e.target.value)}>
                {fontes.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </label>
            <label className="field">
              Variável Y
              <select value={fy?.key} onChange={(e) => setYKey(e.target.value)}>
                {fontes.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </label>
            <label className="field">
              Período
              <select value={periodo} onChange={(e) => setPeriodo(e.target.value as Period)}>
                {PERIODOS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
              </select>
            </label>
            <label className="field">
              Função
              <select value={funcao} onChange={(e) => setFuncao(e.target.value as AggFn)}>
                {FUNCOES.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
              </select>
            </label>
            <label className="field">
              Desfasamento máximo (1–30)
              <input
                type="number"
                min={1}
                max={30}
                value={maxLag}
                onChange={(e) => setMaxLag(Math.min(30, Math.max(1, Math.round(Number(e.target.value)) || 1)))}
              />
            </label>
          </div>

          <div className="card corr-card">
            <p className="corr-leitura"><strong>{leitura(corr.c.pearson, corr.c.n)}</strong> Pearson r = {nf(2)(corr.c.pearson)}, n = {corr.c.n}.</p>
            <p>{textoLag}</p>
            <p className="hint">Correlação não implica causalidade.</p>
            <div className="analise-grid">
              <div className="analise-item">
                <h4>Dispersão</h4>
                <Dispersao pares={corr.pares} x={corr.nomeX} y={corr.nomeY} />
              </div>
              <div className="analise-item">
                <h4>r por desfasamento</h4>
                <LagChart lags={corr.c.lags} label={`Correlação de Pearson por desfasamento entre ${corr.nomeX} e ${corr.nomeY}`} />
              </div>
            </div>
            <div className="table-wrap">
              <table className="col-table">
                <caption>Valores da correlação</caption>
                <tbody>
                  <tr><th scope="row">Pares com data comum (n)</th><td>{corr.c.n}</td></tr>
                  <tr><th scope="row">Pearson r</th><td>{nf(2)(corr.c.pearson)}</td></tr>
                  <tr><th scope="row">Spearman ρ</th><td>{nf(2)(corr.c.spearman)}</td></tr>
                  <tr>
                    <th scope="row">Melhor desfasamento</th>
                    <td>{melhor ? `${melhor.lag} ${UNIDADE[periodo]} · r = ${nf(2)(melhor.r)}` : "—"}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <details>
              <summary>Ver r por desfasamento</summary>
              <div className="table-wrap">
                <table className="col-table">
                  <thead><tr><th scope="col">Desfasamento ({UNIDADE[periodo]})</th><th scope="col">r</th></tr></thead>
                  <tbody>
                    {corr.c.lags.map((l) => (
                      <tr key={l.lag}><th scope="row">{l.lag}</th><td>{nf(2)(l.r)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        </section>
      )}

      {tabs.length > 0 && (
        <section aria-labelledby="h-ia" className="card">
          <h2 id="h-ia">Análise com IA</h2>
          <p className="hint">Envia apenas o resumo agregado (nomes de colunas, contagens, mín/máx/média, séries semanais e a correlação), nunca os registos.</p>
          <div className="row-actions">
            <button type="button" className="btn" onClick={analisarIa} disabled={!corr || ia.estado === "a-gerar"}>
              {ia.estado === "a-gerar" ? "A analisar…" : "Analisar com IA"}
            </button>
          </div>
          <p role="status" aria-live="polite" className="hint">{ia.estado === "a-gerar" ? "A gerar a análise…" : ""}</p>
          {ia.estado === "erro" && <p role="alert" className="form-error">{ia.erro}</p>}
          {ia.estado === "ok" && ia.linhas && (
            <div className="ai">
              <div className="ai-meta">
                <span className="tag">Gerado por IA · por validar</span>
                {ia.modelo && <span>{ia.modelo}</span>}
              </div>
              <ul>{ia.linhas.map((l, i) => <li key={i}>{l}</li>)}</ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
