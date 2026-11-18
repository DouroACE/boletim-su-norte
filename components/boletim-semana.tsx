"use client";
// Boletim da semana: a equipa carrega o Excel de afluência ao SU (os únicos dados a que não temos acesso público).
// Tudo é lido e guardado neste browser; à IA só chegam os indicadores da semana (agregados).
import { useEffect, useMemo, useState } from "react";
import { Chip, Fonte, fmt, fmtDate } from "@/components/ui";
import { LocalDailyChart, WeeklyDiagChart, HBarChart, DowChart } from "@/components/charts";
import { analyseLocal, type LocalRec } from "@/lib/local";
import { indicadoresDaSemana, type Indicator } from "@/lib/su-semana";
import { juntarSU, lerFicheiroSU } from "@/lib/su-ficheiro";
import { parseCSV } from "@/lib/analise";
import type { AiFlag } from "@/lib/ai";

export const CHAVE_SU = "su-semanal-v1";
export const CHAVE_BOLETIM = "boletim-semana-v1";

type Ficheiro = { nome: string; dias: number; de: string; ate: string; carregado: string };
type Guardado = { v: 1; registos: LocalRec[]; ficheiros: Ficheiro[] };
type FlagsSU = { flags: AiFlag[]; sintese: string[]; model: string; generated: string };
/** O boletim da semana guardado para a página Comunicação. */
export type BoletimGuardado = FlagsSU & { semana: string; assinatura: string; indicadores: Indicator[]; gerado: string };

const VAZIO: Guardado = { v: 1, registos: [], ficheiros: [] };
const isoOk = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Registos do SU guardados neste browser (vazio se não houver ou se estiverem corrompidos). */
export function lerSU(): Guardado {
  try {
    const j = JSON.parse(localStorage.getItem(CHAVE_SU) ?? "null") as Guardado | null;
    if (j?.v === 1 && Array.isArray(j.registos) && j.registos.every((r) => isoOk(r?.date) && typeof r.total === "number") && Array.isArray(j.ficheiros)) return j;
  } catch {
    /* sem armazenamento */
  }
  return VAZIO;
}

/** Boletim da semana guardado (síntese e flags), ou null. */
export function lerBoletim(): BoletimGuardado | null {
  try {
    const j = JSON.parse(localStorage.getItem(CHAVE_BOLETIM) ?? "null") as BoletimGuardado | null;
    return j && isoOk(j.semana) && Array.isArray(j.flags) && Array.isArray(j.sintese) ? j : null;
  } catch {
    return null;
  }
}

const gravar = (k: string, v: unknown) => {
  try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; }
};

/** Sem IA: uma flag por indicador em Atenção ou Alerta (o mesmo que as regras do servidor). */
function flagsRegras(ind: Indicator[]): FlagsSU {
  const sinais = ind.filter((i) => i.level === "alerta" || i.level === "atencao").sort((a, b) => (a.level === "alerta" ? -1 : 0) - (b.level === "alerta" ? -1 : 0));
  return {
    flags: sinais.map((i) => ({ indicadores: [i.id], level: i.level, titulo: i.label, evidencia: i.detail, investigar: "" })),
    sintese: [sinais.length ? `${sinais.length} indicador(es) do SU acima do esperado face às 8 semanas anteriores: ${sinais.map((i) => i.label.toLowerCase()).join("; ")}.` : "Nenhum indicador do SU acima do esperado face às semanas anteriores."],
    model: "regras estatísticas",
    generated: "regras",
  };
}

type Folha = { sheet: string; data: (string | number | Date | null)[][] };

export function BoletimSemana() {
  const [g, setG] = useState<Guardado>(VAZIO);
  const [flagsSU, setFlagsSU] = useState<FlagsSU | null>(null);
  const [aGerar, setAGerar] = useState(false);
  const [estado, setEstado] = useState("");

  useEffect(() => setG(lerSU()), []);
  const L = useMemo(() => (g.registos.length ? analyseLocal(g.registos) : null), [g]);
  const semanaSU = useMemo(() => indicadoresDaSemana(g.registos), [g]);
  const assinatura = semanaSU ? `${semanaSU.semana}|${g.registos.length}|${g.registos.at(-1)?.date}|${semanaSU.indicadores.map((i) => i.detail).join("|")}` : "";

  async function gerar(forcar = false) {
    if (!semanaSU) return;
    const guardado = lerBoletim();
    if (!forcar && guardado?.assinatura === assinatura) { setFlagsSU(guardado); return; }
    const regras = flagsRegras(semanaSU.indicadores);
    setFlagsSU(regras);
    setAGerar(true);
    let r: FlagsSU = regras;
    try {
      const res = await fetch("/api/analise-ia", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo: "flags-su", semana: semanaSU.semana, indicadores: semanaSU.indicadores }) });
      const j = (await res.json()) as { ok: boolean; flags?: AiFlag[]; text?: string[]; model?: string; generated?: string };
      if (j.ok && j.flags && j.text) r = { flags: j.flags, sintese: j.text, model: j.model ?? "", generated: j.generated ?? "ia" };
    } catch {
      /* sem servidor: ficam as regras */
    }
    setAGerar(false);
    setFlagsSU(r);
    gravar(CHAVE_BOLETIM, { ...r, semana: semanaSU.semana, assinatura, indicadores: semanaSU.indicadores, gerado: new Date().toISOString() } satisfies BoletimGuardado);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (semanaSU) void gerar(); else setFlagsSU(null); }, [assinatura]);

  async function carregar(lista: FileList | null, input: HTMLInputElement) {
    if (!lista?.length) return;
    setEstado("A ler…");
    let registos = g.registos;
    const ficheiros = [...g.ficheiros];
    const notas: string[] = [];
    for (const f of Array.from(lista)) {
      try {
        const ext = f.name.split(".").pop()?.toLowerCase();
        const folhas: Folha[] = ext === "csv" ? [{ sheet: "CSV", data: parseCSV(await f.text()) }]
          : ext === "xlsx" ? ((await (await import("read-excel-file/browser")).default(f)) as unknown as Folha[]) : [];
        if (!folhas.length) { notas.push(`${f.name}: use .xlsx ou .csv.`); continue; }
        const lido = lerFicheiroSU(folhas);
        if ("erro" in lido) {
          const modelo = folhas.some((x) => /^(hospital|csp|usp)$/i.test(x.sheet));
          notas.push(`${f.name}: ${modelo ? "é o modelo semanal da DE-SNS; carregue-o em Relatórios." : lido.erro}`);
          continue;
        }
        const novos = lido.registos.filter((r) => !registos.some((x) => x.date === r.date)).length;
        registos = juntarSU(registos, lido.registos);
        ficheiros.push({ nome: f.name, dias: lido.registos.length, de: lido.registos[0].date, ate: lido.registos.at(-1)!.date, carregado: new Date().toISOString().slice(0, 10) });
        notas.push(`${f.name}: ${lido.registos.length} dias lidos, ${novos} novos.${lido.ignoradas.length ? ` Colunas ignoradas: ${lido.ignoradas.join(", ")}.` : ""}`);
      } catch (e) {
        notas.push(`${f.name}: não foi possível ler (${(e as Error).message}).`);
      }
    }
    input.value = "";
    const novo: Guardado = { v: 1, registos, ficheiros };
    if (registos !== g.registos && !gravar(CHAVE_SU, novo)) notas.push("Não foi possível guardar neste browser (armazenamento bloqueado ou cheio).");
    setG(novo);
    setEstado(notas.join(" "));
  }

  function apagar() {
    if (!window.confirm("Apagar os dados do SU e o boletim da semana deste browser? Os ficheiros originais não são afetados.")) return;
    try { localStorage.removeItem(CHAVE_SU); localStorage.removeItem(CHAVE_BOLETIM); } catch { /* nada */ }
    setG(VAZIO);
    setEstado("Dados do SU apagados deste browser.");
  }

  const acoes = (
    <div className="row-actions">
      <label className="btn">
        Carregar ficheiro do SU da semana
        <input type="file" accept=".xlsx,.csv" multiple className="sr-only" onChange={(e) => void carregar(e.target.files, e.target)} />
      </label>
      {semanaSU && <button type="button" className="btn ghost" onClick={() => void gerar(true)} disabled={aGerar}>{aGerar ? "A gerar…" : "Gerar de novo com IA"}</button>}
      {g.registos.length > 0 && <button type="button" className="btn danger" onClick={apagar}>Apagar dados do SU deste browser</button>}
    </div>
  );

  if (!L) {
    return (
      <section id="local" aria-labelledby="h-local" className="card">
        <h2 id="h-local">Boletim da semana · dados do SU (equipa)</h2>
        <p className="hint">
          Os dados públicos deste boletim atualizam-se sozinhos. Os do serviço de urgência não são públicos: a equipa carrega aqui, todas as
          semanas, o Excel de afluência ao SU (uma linha por dia). O ficheiro é lido só neste browser; os dias novos juntam-se aos anteriores e
          o boletim da semana é montado com síntese e flags de IA, que só recebe os indicadores agregados.
        </p>
        {acoes}
        <p className="hint" role="status" aria-live="polite">{estado}</p>
      </section>
    );
  }

  return (
    <section id="local" aria-labelledby="h-local">
      <div className="section-head">
        <h2 id="h-local">Boletim da semana · dados do SU · {fmtDate(L.first, { month: "short", year: "numeric" })} – {fmtDate(L.last, { month: "short", year: "numeric" })}</h2>
        <p>Carregados neste browser a partir de {g.ficheiros.map((f) => f.nome).join(", ")} ({L.kpis.dias} dias). Os padrões abaixo são detetados automaticamente.</p>
      </div>
      {acoes}
      <p className="hint" role="status" aria-live="polite">{estado}</p>
      <div className="grid g-kpi" style={{ marginBottom: 16 }}>
        {[
          ["Média diária", fmt(L.kpis.mediaDiaria), "episódios"],
          ["Total de episódios", fmt(L.kpis.totalEpisodios), ""],
          ["Taxa de internamento", fmt(L.kpis.pctInternamento, 1), "%"],
          ["Triagem → 1.ª observação", fmt(L.kpis.tempoTriagem), "min"],
          ["Utentes com 80+ anos", fmt(L.kpis.pct80, 1), "%"],
          ["Infeções respiratórias agudas", fmt(L.kpis.respiratorias), "diagnósticos"],
        ].map(([k, v, u]) => (
          <div key={k} className="card kpi">
            <span className="kpi-label">{k}</span>
            <div className="kpi-value">{v}<small>{u}</small></div>
          </div>
        ))}
      </div>

      {semanaSU && flagsSU && (
        <article className="card ai flags-su" style={{ marginBottom: 16 }} aria-labelledby="h-flags-su">
          <div className="ai-meta">
            <h3 id="h-flags-su">Flags da semana de {fmtDate(semanaSU.semana, { day: "numeric", month: "long", year: "numeric" })}</h3>
            <span className="tag">{aGerar ? "A gerar com IA…" : flagsSU.generated === "ia" ? `Gerado por IA · ${flagsSU.model}` : "Regras estatísticas"}</span>
            <span className="tag warn">Por validar pela equipa de Saúde Pública</span>
          </div>
          <p className="hint">Última semana do ficheiro do SU ({semanaSU.dias} dias) comparada com as {semanaSU.base} semanas anteriores. O nível de cada flag vem das regras (z ≥ 1 Atenção, z ≥ 2 Alerta); a IA só junta e explica os indicadores.</p>
          {flagsSU.sintese.length > 0 && <ul className="sintese-su">{flagsSU.sintese.map((l, i) => <li key={i}>{l}</li>)}</ul>}
          {flagsSU.flags.length ? (
            <div className="patterns">
              {flagsSU.flags.map((f, i) => (
                <article key={i} className={`pattern lv-${f.level}`}>
                  <Chip level={f.level} />
                  <h3>{f.titulo}</h3>
                  {f.evidencia && <p>{f.evidencia}</p>}
                  {f.investigar && <p><b>A verificar:</b> {f.investigar}</p>}
                  <p className="hint">Indicadores: {f.indicadores.map((id) => semanaSU.indicadores.find((x) => x.id === id)?.label ?? id).join("; ")}</p>
                </article>
              ))}
            </div>
          ) : (
            <p>Nenhum indicador acima do esperado face às semanas anteriores.</p>
          )}
          <details className="method">
            <summary>Indicadores da semana</summary>
            <ul>
              {semanaSU.indicadores.map((x) => (
                <li key={x.id}><Chip level={x.level} /> <b>{x.label}.</b> {x.detail}</li>
              ))}
            </ul>
          </details>
        </article>
      )}

      <div className="patterns" style={{ marginBottom: 16 }}>
        {L.patterns.map((p) => (
          <article key={p.id} className={`pattern lv-${p.level}`}>
            <Chip level={p.level} />
            <h3>{p.title}</h3>
            <p>{p.detail}</p>
          </article>
        ))}
      </div>

      <div className="grid">
        <article className="card">
          <h3>Afluência diária e temperatura média</h3>
          <LocalDailyChart data={L.daily} />
          <Fonte ids={["local"]} extra={`Ficheiro ${g.ficheiros.at(-1)?.nome ?? ""} (carregado neste browser)`} />
        </article>
        <div className="grid g-2">
          <article className="card">
            <h3>Diagnósticos infecciosos por semana</h3>
            <WeeklyDiagChart data={L.weekly} />
            <Fonte ids={["local"]} extra={`Ficheiro ${g.ficheiros.at(-1)?.nome ?? ""} (carregado neste browser)`} />
          </article>
          <article className="card">
            <h3>Média de episódios por dia da semana</h3>
            <DowChart data={L.byDow} />
            <Fonte ids={["local"]} extra={`Ficheiro ${g.ficheiros.at(-1)?.nome ?? ""} (carregado neste browser)`} />
          </article>
          <article className="card">
            <h3>Distribuição por grupo etário</h3>
            <HBarChart data={L.idades} x="pct" y="grupo" label="Percentagem de episódios por grupo etário" />
            <Fonte ids={["local"]} extra={`Ficheiro ${g.ficheiros.at(-1)?.nome ?? ""} (carregado neste browser)`} />
          </article>
          <article className="card">
            <h3>Área de residência</h3>
            <HBarChart data={L.origens} x="pct" y="origem" label="Percentagem de episódios por área de residência" />
            <Fonte ids={["local"]} extra={`Ficheiro ${g.ficheiros.at(-1)?.nome ?? ""} (carregado neste browser)`} />
          </article>
        </div>
      </div>
    </section>
  );
}
