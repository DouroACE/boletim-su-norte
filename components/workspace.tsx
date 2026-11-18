"use client";
// Workspace: estudos com as semanas carregadas em Relatórios e as séries públicas diárias.
// Tudo corre no browser; só o botão de IA envia um resumo agregado (médias, picos, correlações).
import { useEffect, useMemo, useState } from "react";
import { SeriesTabela, pedirPadroes, type IA, type TipoGrafico } from "@/components/analise";
import { lerStore } from "@/components/relatorios";
import { lerHistorico } from "@/components/historico";
import { lerSU } from "@/components/boletim-semana";
import { tabelaSU } from "@/lib/su-ficheiro";
import { guardar } from "@/lib/partilha";
import type { LocalRec } from "@/lib/local";
import { tabelaHistorico, type Historico } from "@/lib/historico";
import { juntarTabelas, tabelaDePontos, type AggFn, type Period, type Serie } from "@/lib/analise";
import { normalizarRegisto, type RegistoSemanal } from "@/lib/relatorios";
import { tabelaDiaria, tabelaSemanal } from "@/lib/semanal";
import type { Point } from "@/lib/sources";

export type SeriePublica = { nome: string; pts: Point[] | null };

/** Um gráfico do estudo: variáveis (pelo nome), opções e as notas da IA (por validar) quando existem. */
export type GraficoGuardado = { variaveis: string[]; periodo: Period; funcao: AggFn; tipo: TipoGrafico; normalizar: boolean; notas?: string[] };
/** Estudo guardado: um ou mais gráficos. */
export type Estudo = { nome: string; graficos: GraficoGuardado[]; guardado?: string };

type Grafico = { id: number; escolha: number[]; periodo: Period; funcao: AggFn; tipo: TipoGrafico; normalizar: boolean; ia: IA };
const MAX_GRAFICOS = 6;
let proximoId = 1;
const novoGrafico = (escolha: number[]): Grafico => ({ id: proximoId++, escolha, periodo: "semana", funcao: "media", tipo: "linhas", normalizar: false, ia: { estado: "vazio" } });

const CHAVE_ESTUDOS = "workspace-estudos-v1" as const;
const NOME = "Workspace de saúde sazonal";
const DEMO = "/demo/semanas_FICTICIO.json";
const AVISO_FICTICIO = "Dados fictícios de demonstração — não correspondem a atividade real.";

/** Estudos guardados. Os do formato antigo (um só gráfico, campos soltos) passam a um estudo com um gráfico. */
export function lerEstudos(): Estudo[] {
  try {
    const j: unknown = JSON.parse(localStorage.getItem(CHAVE_ESTUDOS) ?? "[]");
    if (!Array.isArray(j)) return [];
    return j.flatMap((e): Estudo[] => {
      if (!e || typeof e.nome !== "string") return [];
      if (Array.isArray(e.graficos)) return [e as Estudo];
      if (!Array.isArray(e.variaveis)) return [];
      const { variaveis, periodo = "semana", funcao = "media", tipo = "linhas", normalizar = false, notas } = e;
      return [{ nome: e.nome, guardado: e.guardado, graficos: [{ variaveis, periodo, funcao, tipo, normalizar, notas }] }];
    });
  } catch {
    return [];
  }
}

// Grava no browser e, com login da equipa, também na base partilhada.
const gravarEstudos = (e: Estudo[]): boolean => guardar(CHAVE_ESTUDOS, e);

export function Workspace({ publicos }: { publicos: SeriePublica[] }) {
  const [registos, setRegistos] = useState<RegistoSemanal[]>([]);
  const [historico, setHistorico] = useState<Historico>({});
  const [su, setSu] = useState<LocalRec[]>([]);
  const [demo, setDemo] = useState(false);
  const [estado, setEstado] = useState("");
  const [graficos, setGraficos] = useState<Grafico[]>(() => [novoGrafico([1, 2])]);
  const [estudos, setEstudos] = useState<Estudo[]>([]);
  const [nomeEstudo, setNomeEstudo] = useState("");

  useEffect(() => {
    const l = lerStore();
    setRegistos(l.ok ? Object.values(l.dados) : []);
    setEstudos(lerEstudos());
    setHistorico(lerHistorico().metricas);
    setSu(lerSU().registos);
  }, []);

  // Ordem fixa: semanas, indicadores diários, séries públicas e histórico importado no Boletim. Os estudos guardam as variáveis pelo nome.
  const table = useMemo(
    () =>
      juntarTabelas([
        { prefixo: "Semana", table: tabelaSemanal(registos) },
        { prefixo: "Diário", table: tabelaDiaria(registos) },
        { prefixo: "SU", table: tabelaSU(demo ? [] : su) },
        ...publicos.filter((p) => p.pts?.length).map((p) => ({ prefixo: "Público", table: tabelaDePontos(p.nome, p.pts ?? []) })),
        { prefixo: "Histórico", table: tabelaHistorico(historico) },
      ]),
    [registos, publicos, historico, su, demo],
  );
  const nomes = table.columns.map((c) => c.name);

  async function carregarDemo() {
    setEstado("A carregar semanas fictícias…");
    try {
      const j: unknown = await (await fetch(DEMO)).json();
      const rs = Array.isArray(j) ? j.map(normalizarRegisto).filter((r): r is RegistoSemanal => r !== null) : [];
      if (!rs.length) throw new Error("ficheiro vazio");
      setRegistos(rs);
      setDemo(true);
      setEstado(`${rs.length} semanas fictícias carregadas (não ficam guardadas).`);
    } catch (e) {
      setEstado(`Não foi possível carregar a demonstração (${(e as Error).message}).`);
    }
  }

  function voltarAosMeus() {
    const l = lerStore();
    setRegistos(l.ok ? Object.values(l.dados) : []);
    setDemo(false);
    setEstado("");
  }

  const mudar = (id: number, alteracao: Partial<Grafico>) => setGraficos((gs) => gs.map((g) => (g.id === id ? { ...g, ...alteracao } : g)));
  // Gráfico novo: as duas primeiras variáveis que ainda não estão noutro gráfico (ou as duas primeiras de todas).
  function adicionarGrafico() {
    const usadas = new Set(graficos.flatMap((g) => g.escolha));
    const numericos = table.columns.flatMap((c, ci) => (c.type === "number" ? [ci] : []));
    const livres = numericos.filter((ci) => !usadas.has(ci));
    setGraficos((gs) => [...gs, novoGrafico((livres.length ? livres : numericos).slice(0, 2))]);
  }

  function guardarEstudo() {
    const nome = nomeEstudo.trim();
    if (!nome) { setEstado("Dê um nome ao estudo."); return; }
    const antigo = estudos.find((e) => e.nome === nome);
    const novo: Estudo = {
      nome,
      guardado: new Date().toISOString().slice(0, 10),
      graficos: graficos.map((g, i) => ({
        variaveis: g.escolha.map((ci) => nomes[ci]).filter(Boolean), periodo: g.periodo, funcao: g.funcao, tipo: g.tipo, normalizar: g.normalizar,
        notas: g.ia.estado === "ok" ? g.ia.linhas : antigo?.graficos[i]?.notas,
      })),
    };
    const lista = [...estudos.filter((e) => e.nome !== nome), novo];
    if (!gravarEstudos(lista)) { setEstado("Não foi possível guardar neste browser."); return; }
    setEstudos(lista);
    setNomeEstudo("");
    setEstado(`Estudo «${nome}» guardado.`);
  }

  function abrirEstudo(e: Estudo) {
    let faltam = 0;
    setGraficos(e.graficos.map((g) => {
      const idx = g.variaveis.map((v) => nomes.indexOf(v)).filter((i) => i > 0);
      faltam += g.variaveis.length - idx.length;
      return { ...novoGrafico(idx), periodo: g.periodo, funcao: g.funcao, tipo: g.tipo, normalizar: g.normalizar,
        ia: g.notas?.length ? { estado: "ok", linhas: g.notas, modelo: "notas guardadas com o estudo" } : { estado: "vazio" } };
    }));
    setNomeEstudo(e.nome);
    setEstado(`Estudo «${e.nome}» aberto (${e.graficos.length} gráfico(s)).${faltam ? ` ${faltam} variável(is) sem dados neste momento.` : ""}`);
  }

  function apagarEstudo(nome: string) {
    const lista = estudos.filter((e) => e.nome !== nome);
    if (gravarEstudos(lista)) setEstudos(lista);
  }

  async function analisar(g: Grafico, series: Serie[]) {
    mudar(g.id, { ia: { estado: "a-gerar" } });
    mudar(g.id, { ia: await pedirPadroes(NOME, series, g.periodo, g.funcao) });
  }

  const semanas = registos.length;
  const comDiario = registos.filter((r) => r.diario).length;

  return (
    <>
      <details className="card dobra" open>
        <summary><h2 id="h-dados">Dados</h2></summary>
        {demo && <p className="banner-ficticio" role="note">{AVISO_FICTICIO}</p>}
        <p className="hint">
          {semanas
            ? `${semanas} semana(s) ${demo ? "fictícias" : "carregadas em Relatórios"}, ${comDiario} com indicadores diários, e ${publicos.filter((p) => p.pts?.length).length} séries públicas diárias.`
            : "Ainda não há semanas neste browser: largue o Excel semanal em Relatórios. As séries públicas já estão disponíveis."}
        </p>
        <div className="row-actions">
          {demo ? (
            <button type="button" className="btn ghost" onClick={voltarAosMeus}>Voltar às minhas semanas</button>
          ) : (
            <button type="button" className="btn ghost" onClick={() => void carregarDemo()}>Experimentar com semanas fictícias</button>
          )}
          <a className="btn ghost" href="/relatorios">Carregar semanas em Relatórios</a>
        </div>
        <p className="hint" role="status" aria-live="polite">{estado}</p>
      </details>

      <details className="card dobra" open>
        <summary><h2 id="h-estudo">Estudo</h2></summary>
        <p className="hint">Cada gráfico junta até 6 variáveis, com a sua matriz de correlação e o comentário da IA. Junte mais gráficos para estudar outras variáveis lado a lado. Correlação não implica causalidade.</p>
        {table.columns.length < 2 ? (
          <p className="hint">Sem variáveis com data para estudar.</p>
        ) : (
          <>
            {graficos.map((g, i) => (
              <section key={g.id} className="grafico-estudo" aria-labelledby={`h-grafico-${g.id}`}>
                <div className="grafico-estudo-topo">
                  <h3 id={`h-grafico-${g.id}`}>Gráfico {i + 1}</h3>
                  {graficos.length > 1 && (
                    <button type="button" className="btn ghost" onClick={() => setGraficos((gs) => gs.filter((x) => x.id !== g.id))}>Remover gráfico</button>
                  )}
                </div>
                <SeriesTabela
                  t={{ nome: NOME, table }}
                  periodo={g.periodo}
                  onPeriodo={(periodo) => mudar(g.id, { periodo })}
                  funcao={g.funcao}
                  onFuncao={(funcao) => mudar(g.id, { funcao })}
                  tipo={g.tipo}
                  onTipo={(tipo) => mudar(g.id, { tipo })}
                  normalizar={g.normalizar}
                  onNormalizar={(normalizar) => mudar(g.id, { normalizar })}
                  escolha={g.escolha}
                  onEscolha={(escolha) => mudar(g.id, { escolha })}
                  ia={g.ia}
                  onAnalisar={(series) => void analisar(g, series)}
                  notaCorrelacao={false}
                />
              </section>
            ))}
            {graficos.length < MAX_GRAFICOS && (
              <div className="row-actions">
                <button type="button" className="btn" onClick={adicionarGrafico}>+ Adicionar gráfico</button>
              </div>
            )}
          </>
        )}
      </details>

      <details className="card dobra" open={estudos.length > 0}>
        <summary><h2 id="h-estudos">Estudos guardados</h2></summary>
        <p className="hint">Guarda todos os gráficos, com as variáveis, as opções e as notas da IA (peça-as em «Comentar padrões com IA» antes de guardar). Os estudos guardados podem dar origem a comunicados na página Comunicação. Ficam só neste browser.</p>
        <div className="row-actions">
          <label className="field">
            Nome do estudo
            <input value={nomeEstudo} onChange={(e) => setNomeEstudo(e.target.value)} maxLength={80} placeholder="ex.: Frio e urgências" />
          </label>
          <button type="button" className="btn" onClick={guardarEstudo}>Guardar estudo atual</button>
        </div>
        {estudos.length > 0 && (
          <ul className="lista-estudos">
            {estudos.map((e) => (
              <li key={e.nome}>
                <span><strong>{e.nome}</strong> · {e.graficos.length} gráfico(s): {e.graficos.map((g) => g.variaveis.join(", ")).join(" | ")}{e.graficos.some((g) => g.notas?.length) ? " · com notas da IA" : ""}</span>
                <span className="row-actions">
                  <button type="button" className="btn ghost" onClick={() => abrirEstudo(e)}>Abrir</button>
                  <button type="button" className="btn danger" onClick={() => apagarEstudo(e.nome)} aria-label={`Apagar ${e.nome}`}>Apagar</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </details>
    </>
  );
}
