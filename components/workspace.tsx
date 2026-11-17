"use client";
// Workspace: estudos com as semanas carregadas em Relatórios e as séries públicas diárias.
// Tudo corre no browser; só o botão de IA envia um resumo agregado (médias, picos, correlações).
import { useEffect, useMemo, useState } from "react";
import { SeriesTabela, pedirPadroes, type IA, type TipoGrafico } from "@/components/analise";
import { lerStore } from "@/components/relatorios";
import { lerHistorico } from "@/components/historico";
import { tabelaHistorico, type Historico } from "@/lib/historico";
import { juntarTabelas, tabelaDePontos, type AggFn, type Period, type Serie } from "@/lib/analise";
import { normalizarRegisto, type RegistoSemanal } from "@/lib/relatorios";
import { tabelaDiaria, tabelaSemanal } from "@/lib/semanal";
import type { Point } from "@/lib/sources";

export type SeriePublica = { nome: string; pts: Point[] | null };

type Estudo = { nome: string; variaveis: string[]; periodo: Period; funcao: AggFn; tipo: TipoGrafico; normalizar: boolean };

const CHAVE_ESTUDOS = "workspace-estudos-v1";
const NOME = "Workspace de saúde sazonal";
const DEMO = "/demo/semanas_FICTICIO.json";
const AVISO_FICTICIO = "Dados fictícios de demonstração — não correspondem a atividade real.";

function lerEstudos(): Estudo[] {
  try {
    const j: unknown = JSON.parse(localStorage.getItem(CHAVE_ESTUDOS) ?? "[]");
    return Array.isArray(j) ? (j.filter((e) => e && typeof e.nome === "string" && Array.isArray(e.variaveis)) as Estudo[]) : [];
  } catch {
    return [];
  }
}

function gravarEstudos(e: Estudo[]): boolean {
  try {
    localStorage.setItem(CHAVE_ESTUDOS, JSON.stringify(e));
    return true;
  } catch {
    return false;
  }
}

export function Workspace({ publicos }: { publicos: SeriePublica[] }) {
  const [registos, setRegistos] = useState<RegistoSemanal[]>([]);
  const [historico, setHistorico] = useState<Historico>({});
  const [demo, setDemo] = useState(false);
  const [estado, setEstado] = useState("");
  const [periodo, setPeriodo] = useState<Period>("semana");
  const [funcao, setFuncao] = useState<AggFn>("media");
  const [tipo, setTipo] = useState<TipoGrafico>("linhas");
  const [normalizar, setNormalizar] = useState(false);
  const [escolha, setEscolha] = useState<number[]>([1, 2]);
  const [ia, setIa] = useState<IA>({ estado: "vazio" });
  const [estudos, setEstudos] = useState<Estudo[]>([]);
  const [nomeEstudo, setNomeEstudo] = useState("");

  useEffect(() => {
    const l = lerStore();
    setRegistos(l.ok ? Object.values(l.dados) : []);
    setEstudos(lerEstudos());
    setHistorico(lerHistorico().metricas);
  }, []);

  // Ordem fixa: semanas, indicadores diários, séries públicas e histórico importado no Boletim. Os estudos guardam as variáveis pelo nome.
  const table = useMemo(
    () =>
      juntarTabelas([
        { prefixo: "Semana", table: tabelaSemanal(registos) },
        { prefixo: "Diário", table: tabelaDiaria(registos) },
        ...publicos.filter((p) => p.pts?.length).map((p) => ({ prefixo: "Público", table: tabelaDePontos(p.nome, p.pts ?? []) })),
        { prefixo: "Histórico", table: tabelaHistorico(historico) },
      ]),
    [registos, publicos, historico],
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

  function guardarEstudo() {
    const nome = nomeEstudo.trim();
    if (!nome) { setEstado("Dê um nome ao estudo."); return; }
    const novo: Estudo = { nome, variaveis: escolha.map((i) => nomes[i]).filter(Boolean), periodo, funcao, tipo, normalizar };
    const lista = [...estudos.filter((e) => e.nome !== nome), novo];
    if (!gravarEstudos(lista)) { setEstado("Não foi possível guardar neste browser."); return; }
    setEstudos(lista);
    setNomeEstudo("");
    setEstado(`Estudo «${nome}» guardado.`);
  }

  function abrirEstudo(e: Estudo) {
    const idx = e.variaveis.map((v) => nomes.indexOf(v)).filter((i) => i > 0);
    setEscolha(idx);
    setPeriodo(e.periodo);
    setFuncao(e.funcao);
    setTipo(e.tipo);
    setNormalizar(e.normalizar);
    setIa({ estado: "vazio" });
    const faltam = e.variaveis.length - idx.length;
    setEstado(`Estudo «${e.nome}» aberto.${faltam ? ` ${faltam} variável(is) sem dados neste momento.` : ""}`);
  }

  function apagarEstudo(nome: string) {
    const lista = estudos.filter((e) => e.nome !== nome);
    if (gravarEstudos(lista)) setEstudos(lista);
  }

  async function analisar(series: Serie[]) {
    setIa({ estado: "a-gerar" });
    setIa(await pedirPadroes(NOME, series, periodo, funcao));
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
        <p className="hint">Escolha até 6 variáveis: veja-as no mesmo gráfico, a matriz de correlação e peça à IA um comentário sobre os padrões. Correlação não implica causalidade.</p>
        {table.columns.length < 2 ? (
          <p className="hint">Sem variáveis com data para estudar.</p>
        ) : (
          <SeriesTabela
            t={{ nome: NOME, table }}
            periodo={periodo}
            onPeriodo={setPeriodo}
            funcao={funcao}
            onFuncao={setFuncao}
            tipo={tipo}
            onTipo={setTipo}
            normalizar={normalizar}
            onNormalizar={setNormalizar}
            escolha={escolha}
            onEscolha={setEscolha}
            ia={ia}
            onAnalisar={(series) => void analisar(series)}
            notaCorrelacao={false}
          />
        )}
      </details>

      <details className="card dobra" open={estudos.length > 0}>
        <summary><h2 id="h-estudos">Estudos guardados</h2></summary>
        <p className="hint">Guarda as variáveis e as opções do gráfico, para repetir o estudo com as semanas seguintes. Fica só neste browser.</p>
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
                <span><strong>{e.nome}</strong> · {e.variaveis.join(", ")}</span>
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
