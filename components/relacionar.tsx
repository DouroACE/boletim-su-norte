"use client";
// Relacionar variáveis: registos semanais, índices públicos e projetos guardados na Vigilância, no mesmo gráfico.
// Tudo corre no browser; só o botão de IA envia um resumo agregado.
import { useEffect, useMemo, useState } from "react";
import { SeriesTabela, dbOp, deGuardado, pedirPadroes, type IA, type StoredProjeto, type TipoGrafico } from "@/components/analise";
import { juntarTabelas, tabelaDePontos, type AggFn, type Period, type Serie, type Table } from "@/lib/analise";
import type { RegistoSemanal } from "@/lib/relatorios";
import type { Point } from "@/lib/sources";

export type SeriePublica = { nome: string; pts: Point[] | null };

interface Props {
  registos: RegistoSemanal[];
  publicos: SeriePublica[];
}

const NOME = "Relatórios, índices e projetos";

/** Campos numéricos do registo semanal, com a data da segunda-feira. Sim/Não e Suficientes/Insuficientes passam a 1/0. */
function tabelaRegistos(registos: RegistoSemanal[]): Table {
  const campos: [string, (r: RegistoSemanal) => number | null][] = [
    ["Nível SU (cuidados hospitalares)", (r) => r.cuidadosNivel],
    ["Nível camas suplementares", (r) => r.camasNivel],
    ["Doentes por médico por hora (CSP)", (r) => r.cspDoentesMedicoHora],
    ["Camas livres (média)", (r) => r.camasLivres],
    ["Macas livres (média)", (r) => r.macasLivres],
    ["Referenciações inter-ULS (1 = sim)", (r) => (r.referenciacoes === "Sim" ? 1 : 0)],
    ["Equipamento insuficiente (1 = sim)", (r) => (r.equipamento === "Insuficientes" ? 1 : 0)],
  ];
  return {
    nRows: registos.length,
    columns: [
      { name: "Data", type: "date", values: registos.map((r) => new Date(`${r.semana}T00:00:00Z`)) },
      ...campos.map(([name, f]) => ({ name, type: "number" as const, values: registos.map(f) })),
    ],
  };
}

export function RelacionarVariaveis({ registos, publicos }: Props) {
  const [projetos, setProjetos] = useState<StoredProjeto[]>([]);
  const [projetoId, setProjetoId] = useState<number | "">("");
  const [periodo, setPeriodo] = useState<Period>("semana");
  const [funcao, setFuncao] = useState<AggFn>("media");
  const [tipo, setTipo] = useState<TipoGrafico>("linhas");
  const [normalizar, setNormalizar] = useState(false);
  const [escolha, setEscolha] = useState<number[]>([1, 2]);
  const [ia, setIa] = useState<IA>({ estado: "vazio" });

  useEffect(() => {
    dbOp<StoredProjeto[]>("readonly", (s) => s.getAll())
      .then(setProjetos)
      .catch(() => setProjetos([]));
  }, []);

  // Ordem fixa: registos, índices públicos e, por fim, o projeto; mudar de projeto não troca as variáveis já escolhidas.
  const table = useMemo(() => {
    const projeto = projetos.find((p) => p.id === projetoId);
    return juntarTabelas([
      { prefixo: "Registo semanal", table: tabelaRegistos(registos) },
      ...publicos.filter((p) => p.pts?.length).map((p) => ({ prefixo: "", table: tabelaDePontos(p.nome, p.pts ?? []) })),
      ...(projeto?.tabelas ?? []).map((t) => ({ prefixo: `${projeto?.nome} · ${t.nome}`, table: deGuardado(t).table })),
    ]);
  }, [registos, publicos, projetos, projetoId]);

  async function analisar(series: Serie[]) {
    setIa({ estado: "a-gerar" });
    setIa(await pedirPadroes(NOME, series, periodo, funcao));
  }

  return (
    <>
      <p className="hint">
        Escolha até 6 variáveis para ver no mesmo gráfico e medir a correlação entre elas. Os registos guardados aqui entram com a data da
        segunda-feira; os índices públicos são diários. Para usar os ficheiros da equipa, carregue-os em <a href="/analise">Vigilância</a> e
        guarde-os como projeto.
      </p>
      <label className="field">
        Juntar um projeto guardado na Vigilância
        <select value={projetoId} onChange={(e) => setProjetoId(e.target.value === "" ? "" : Number(e.target.value))}>
          <option value="">Nenhum</option>
          {projetos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      </label>
      {projetos.length === 0 && <p className="hint">Ainda não há projetos guardados neste browser.</p>}
      {table.columns.length < 2 ? (
        <p className="hint">Sem variáveis com data para relacionar.</p>
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
    </>
  );
}
