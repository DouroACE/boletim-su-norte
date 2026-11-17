// Painéis automáticos para os ficheiros da equipa (Vigilância Sazonal, Afluência ao SU) e controlo de qualidade.
// Tudo no browser; nenhum valor sai do dispositivo.
import { useMemo } from "react";
import { RiskGauge } from "@/components/risk-viz";
import { fmt, fmtDate } from "@/components/ui";
import { DGS_TEXT } from "@/lib/risk";
import type { Table } from "@/lib/analise";
import {
  detectarModelo, predefinicoes, qualidade, resumoSU, resumoVigilancia,
  LIMIAR_TMAX_EXTREMO, LIMIAR_TMIN_EXTREMO,
  type Modelo, type Nivel, type PredefCorr, type ProcuraSU,
} from "@/lib/modelos";
import s from "@/app/analise/analise.module.css";

const LISTA_MAX = 50;
const dd = (iso: string) => fmtDate(iso, { day: "2-digit", month: "2-digit", year: "numeric" });
const sinal = (v: number) => `${v >= 0 ? "+" : "−"}${fmt(Math.abs(v), 1)}`;
const nivelTexto = (n: Nivel) => `nível ${n} (${DGS_TEXT[n]})`;

/** Frase da procura: "Procura do SU +X % vs <base> → nível N (Cor)". */
function frasePROCURA(p: ProcuraSU): string {
  if (p.nivel == null || p.variacaoPct == null) return "Procura do SU: dados insuficientes para comparar com a referência.";
  return `Procura do SU ${sinal(p.variacaoPct)} % vs ${p.base} → ${nivelTexto(p.nivel)}`;
}

function Kpi({ rotulo, valor, unidade, nota }: { rotulo: string; valor: string; unidade: string; nota?: string }) {
  return (
    <div className="card kpi">
      <div className="kpi-top"><span className="kpi-label">{rotulo}</span></div>
      <span className="kpi-value">{valor}<small>{unidade}</small></span>
      {nota && <p className="kpi-note">{nota}</p>}
    </div>
  );
}

function PainelSU({ table }: { table: Table }) {
  const r = useMemo(() => resumoSU(table), [table]);
  if (!r) return <p className="hint">Sem datas válidas na coluna Total: não é possível calcular o painel.</p>;
  const p = r.procura;
  return (
    <div className={s.painel}>
      <h3 className="sub-h">Painel do SU (ficheiro da equipa)</h3>
      <div className={s.topo}>
        <div>
          <RiskGauge level={p.nivel} label="Procura do SU" />
        </div>
        <div className={s.bloco}>
          <p className={s.leitura}>{frasePROCURA(p)}</p>
          <p className="hint">
            Média dos 7 dias até {dd(p.refDate)} ({p.diasAtual} dias com dados) face a {p.base}
            {" "}({p.diasReferencia} dias com dados).
            {p.base === "28 dias anteriores" && " Sem a mesma semana do ano anterior no ficheiro, a referência são os 28 dias anteriores."}
          </p>
        </div>
      </div>

      <ol className={s.faixa} aria-label="Nível diário de procura nos últimos 30 dias">
        {r.faixa.map((d) => {
          const txt = d.nivel == null ? "sem dados" : nivelTexto(d.nivel);
          const cor = d.nivel == null ? s.semDados : `dgs-${d.nivel}`;
          return (
            <li
              key={d.data}
              className={`${s.cel} ${cor}`}
              title={`${dd(d.data)}: ${txt}${d.variacaoPct == null ? "" : `, ${sinal(d.variacaoPct)} %`}`}
              aria-label={`${dd(d.data)}: ${txt}`}
            >
              <span>{d.data.slice(8)}/{d.data.slice(5, 7)}</span>
              <strong>{d.nivel == null ? "–" : `N${d.nivel}`}</strong>
            </li>
          );
        })}
      </ol>
      <ul className={s.legenda} aria-label="Legenda dos níveis">
        {([0, 1, 2, 3] as Nivel[]).map((n) => (
          <li key={n} className={`dgs-badge dgs-${n}`}>N{n} · {DGS_TEXT[n]}</li>
        ))}
      </ul>

      <div className={s.kpis}>
        <Kpi rotulo="Média dos últimos 7 dias" valor={fmt(p.atual, 0)} unidade=" episódios/dia" nota={`Até ${dd(p.refDate)}`} />
        <Kpi rotulo="Total do período" valor={fmt(r.total, 0)} unidade=" episódios" nota={`${dd(r.inicio)} a ${dd(r.fim)} · ${r.dias} dias`} />
        {r.pct80 != null && <Kpi rotulo="80 anos ou mais" valor={fmt(r.pct80, 1)} unidade=" %" nota="Do total do período" />}
        {r.pctInternamento != null && <Kpi rotulo="Internamento" valor={fmt(r.pctInternamento, 1)} unidade=" %" nota="Destino internamento / total do período" />}
      </div>
    </div>
  );
}

function PainelVigilancia({
  tabelas, ti, aplicar,
}: {
  tabelas: { nome: string; table: Table }[];
  ti: number;
  aplicar: (p: PredefCorr) => void;
}) {
  const table = tabelas[ti].table;
  const historico = tabelas.filter((x, j) => j !== ti && detectarModelo(x.table) === "vigilancia").map((x) => x.table);
  const r = resumoVigilancia(table, historico);
  const preds = predefinicoes(tabelas.map((x) => x.table), ti);
  if (!r) return <p className="hint">Sem datas com temperaturas ou óbitos: não é possível calcular o painel.</p>;
  const sem7 = r.semana;
  const ant = sem7.anterior;
  return (
    <div className={s.painel}>
      <h3 className="sub-h">Painel de vigilância (ficheiro da equipa)</h3>
      <p className="hint">Última data com dados: {dd(r.refDate)}. Semana de {dd(sem7.inicio)} a {dd(r.refDate)}.</p>

      <div className={s.kpis}>
        <Kpi rotulo="Tmáx média, 7 dias" valor={fmt(sem7.tmaxMedia, 1)} unidade=" °C" nota={`${sem7.diasTemp} dias com dados`} />
        <Kpi rotulo="Tmín média, 7 dias" valor={fmt(sem7.tminMedia, 1)} unidade=" °C" nota={`${sem7.diasTemp} dias com dados`} />
        <Kpi
          rotulo="Óbitos ACES, 7 dias"
          valor={fmt(sem7.obitos, 0)}
          unidade=" óbitos"
          nota={
            ant && sem7.variacaoPct != null
              ? `Ano anterior: ${fmt(ant.obitos, 0)} · ${sinal(sem7.variacaoPct)} % na média diária`
              : "Sem dados do ano anterior neste projeto para comparar"
          }
        />
      </div>

      <div className={s.bloco}>
        <h4>Dias extremos nos últimos 30 dias</h4>
        <p className="hint">Tmáx ≥ {LIMIAR_TMAX_EXTREMO} °C ou Tmín ≤ {LIMIAR_TMIN_EXTREMO} °C.</p>
        {r.extremos.length ? (
          <ul>
            {r.extremos.slice(0, LISTA_MAX).map((e) => (
              <li key={e.data}>
                {dd(e.data)} · {e.calor && `calor (Tmáx ${fmt(e.tmax, 1)} °C)`}
                {e.calor && e.frio && " · "}
                {e.frio && `frio (Tmín ${fmt(e.tmin, 1)} °C)`}
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">Nenhum dia extremo nos últimos 30 dias com dados.</p>
        )}
      </div>

      <div className={s.bloco}>
        <h4>Correlações predefinidas</h4>
        {preds.length ? (
          <>
            <div className={s.predef}>
              {preds.map((p) => (
                <button key={p.id} type="button" className="btn ghost" title={p.descricao} onClick={() => aplicar(p)}>
                  {p.titulo}
                </button>
              ))}
            </div>
            <p className="hint">Preenche a secção Correlação com a variável X, a Y, o período, a função e o desfasamento.</p>
          </>
        ) : (
          <p className="hint">Sem colunas de temperatura e de óbitos ACES para correlacionar.</p>
        )}
      </div>
    </div>
  );
}

/** Painel do modelo detetado para a tabela ti. */
export function PainelModelo({
  modelo, tabelas, ti, aplicar,
}: {
  modelo: Modelo;
  tabelas: { nome: string; table: Table }[];
  ti: number;
  aplicar: (p: PredefCorr) => void;
}) {
  return modelo === "afluencia_su" ? <PainelSU table={tabelas[ti].table} /> : <PainelVigilancia tabelas={tabelas} ti={ti} aplicar={aplicar} />;
}

/** Qualidade dos dados de uma tabela: só contagens e a lista de datas/colunas afetadas. */
export function QualidadeDados({ table }: { table: Table }) {
  const q = useMemo(() => qualidade(table), [table]);
  const datas = q.datasRepetidas.slice(0, LISTA_MAX);
  const fora = q.foraDeIntervalo.slice(0, LISTA_MAX);
  return (
    <div className={s.qualidade}>
      <h4>Qualidade dos dados</h4>
      <ul>
        {q.semDataValida != null && <li>Linhas sem data válida: <strong>{q.semDataValida}</strong> de {q.linhas}</li>}
        <li>
          Datas repetidas: <strong>{q.datasRepetidas.length}</strong>
          {datas.length > 0 && <> · {datas.map(dd).join(", ")}{q.datasRepetidas.length > LISTA_MAX && " …"}</>}
        </li>
        {q.temperaturas && (
          <li>
            Temperaturas fora de −10 a 50 °C: <strong>{q.foraDeIntervalo.length}</strong>
            {fora.length > 0 && (
              <ul>
                {fora.map((f, i) => (
                  <li key={i}>{f.data ? dd(f.data) : "sem data"} · {f.coluna}</li>
                ))}
              </ul>
            )}
          </li>
        )}
      </ul>
    </div>
  );
}
