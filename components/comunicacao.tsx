"use client";
// Comunicação: a partir do boletim da semana ou de um estudo guardado, a IA redige um rascunho de comunicado à população,
// de comunicado interno ou de estratégias de controlo. Só um texto de contexto agregado sai do browser.
import { useEffect, useState } from "react";
import { lerBoletim, type BoletimGuardado } from "@/components/boletim-semana";
import { lerEstudos, type Estudo } from "@/components/workspace";

type Publico = "populacao" | "interno" | "estrategias";
type Origem = "boletim" | "estudo" | "livre";

const PUBLICOS: [Publico, string, string][] = [
  ["populacao", "Comunicado à população", "Linguagem simples: o que se passa, quem está em risco, o que fazer, quando ligar para a Linha SNS 24 ou o 112."],
  ["interno", "Comunicado interno", "Para profissionais e parceiros (hospital, CSP, USP, autarquias): situação, nível de risco e o que se pede a cada equipa."],
  ["estrategias", "Estratégias de controlo e execução", "Ações para reduzir danos: objetivo, quem executa, prazo e o indicador que as justifica."],
];
const NIVEL: Record<string, string> = { alerta: "Alerta", atencao: "Atenção", info: "Informação", normal: "Normal", "sem-dados": "Sem dados" };
const MAX_CONTEXTO = 8000;
const dataPt = (iso: string) => iso.split("-").reverse().join("/");

/** Contexto do boletim da semana: síntese, flags e indicadores (texto agregado). */
function contextoBoletim(b: BoletimGuardado): string {
  return [
    `Boletim da semana de ${dataPt(b.semana)} — serviço de urgência da ULS Santo António (Gondomar e Porto Ocidental).`,
    "Síntese:", ...b.sintese.map((l) => `- ${l}`),
    "Flags:", ...(b.flags.length ? b.flags.map((f) => `- [${NIVEL[f.level] ?? f.level}] ${f.titulo}. ${f.evidencia}${f.investigar ? ` A verificar: ${f.investigar}` : ""}`) : ["- Sem flags acima do esperado."]),
    "Indicadores (semana face às 8 anteriores):", ...b.indicadores.map((i) => `- [${NIVEL[i.level] ?? i.level}] ${i.label}: ${i.detail}`),
  ].join("\n");
}

/** Contexto de um estudo guardado: para cada gráfico, variáveis, agregação e notas da IA. */
function contextoEstudo(e: Estudo): string {
  return [
    `Estudo da equipa «${e.nome}»${e.guardado ? ` (guardado a ${dataPt(e.guardado)})` : ""}, com ${e.graficos.length} gráfico(s).`,
    ...e.graficos.flatMap((g, i) => [
      `Gráfico ${i + 1}: ${g.variaveis.join("; ")} (agregação: ${g.funcao} por ${g.periodo}).`,
      ...(g.notas?.length ? g.notas.map((l) => `- ${l}`) : ["- Sem notas da IA para este gráfico."]),
    ]),
  ].join("\n");
}

export function Comunicacao({ avisos }: { avisos: string }) {
  const [boletim, setBoletim] = useState<BoletimGuardado | null>(null);
  const [estudos, setEstudos] = useState<Estudo[]>([]);
  const [origem, setOrigem] = useState<Origem>("boletim");
  const [estudoNome, setEstudoNome] = useState("");
  const [publico, setPublico] = useState<Publico>("populacao");
  const [contexto, setContexto] = useState("");
  const [rascunho, setRascunho] = useState("");
  const [estado, setEstado] = useState("");
  const [aGerar, setAGerar] = useState(false);

  useEffect(() => {
    const b = lerBoletim();
    const es = lerEstudos();
    setBoletim(b);
    setEstudos(es);
    setEstudoNome(es[0]?.nome ?? "");
    if (!b) setOrigem(es.length ? "estudo" : "livre");
  }, []);

  // O contexto é refeito quando muda a origem; depois a equipa pode editá-lo à vontade antes de gerar.
  useEffect(() => {
    const estudo = estudos.find((e) => e.nome === estudoNome);
    const base = origem === "boletim" && boletim ? contextoBoletim(boletim) : origem === "estudo" && estudo ? contextoEstudo(estudo) : "";
    setContexto(base ? `${base}\n\n${avisos}` : "");
  }, [origem, boletim, estudos, estudoNome, avisos]);

  async function gerar() {
    if (contexto.trim().length < 20) { setEstado("Escreva ou escolha um contexto com a situação."); return; }
    setAGerar(true);
    setEstado("A gerar o rascunho…");
    try {
      const res = await fetch("/api/analise-ia", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo: "comunicado", publico, contexto: contexto.slice(0, MAX_CONTEXTO) }) });
      const j = (await res.json()) as { ok: boolean; text?: string[]; model?: string; error?: string };
      if (j.ok && j.text) {
        setRascunho(j.text.join("\n\n"));
        setEstado(`Rascunho gerado por IA (${j.model}). Reveja e valide antes de enviar ou publicar.`);
      } else setEstado(j.error ?? "Não foi possível gerar o rascunho.");
    } catch {
      setEstado("Não foi possível contactar o servidor.");
    }
    setAGerar(false);
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(rascunho);
      setEstado("Texto copiado.");
    } catch {
      setEstado("Não foi possível copiar: selecione o texto e copie à mão.");
    }
  }

  return (
    <>
      <details className="card dobra" open>
        <summary><h2 id="h-origem">1. De onde parte o comunicado</h2></summary>
        <fieldset className="opcoes-comunicacao">
          <legend className="sr-only">Origem</legend>
          <label><input type="radio" name="origem" checked={origem === "boletim"} disabled={!boletim} onChange={() => setOrigem("boletim")} />
            Boletim da semana {boletim ? `(${dataPt(boletim.semana)}, ${boletim.flags.length} flags)` : "— carregue primeiro os dados do SU no Boletim"}</label>
          <label><input type="radio" name="origem" checked={origem === "estudo"} disabled={!estudos.length} onChange={() => setOrigem("estudo")} />
            Estudo guardado no Workspace {estudos.length ? "" : "— ainda não há estudos guardados neste browser"}</label>
          <label><input type="radio" name="origem" checked={origem === "livre"} onChange={() => setOrigem("livre")} /> Escrever o contexto à mão</label>
        </fieldset>
        {origem === "estudo" && estudos.length > 0 && (
          <label className="field">
            Estudo
            <select value={estudoNome} onChange={(e) => setEstudoNome(e.target.value)}>
              {estudos.map((e) => <option key={e.nome} value={e.nome}>{e.nome} · {e.graficos.length} gráfico(s){e.graficos.some((g) => g.notas?.length) ? " · com notas" : ""}</option>)}
            </select>
          </label>
        )}
        <label className="field">
          Contexto enviado à IA (pode editar; só texto agregado, sem dados de doentes)
          <textarea value={contexto} onChange={(e) => setContexto(e.target.value)} rows={10} maxLength={MAX_CONTEXTO} />
        </label>
      </details>

      <details className="card dobra" open>
        <summary><h2 id="h-tipo">2. Que texto quer</h2></summary>
        <div className="cards-comunicacao">
          {PUBLICOS.map(([k, titulo, ajuda]) => (
            <label key={k} className={`card opcao-comunicacao${publico === k ? " ativa" : ""}`}>
              <input type="radio" name="publico" checked={publico === k} onChange={() => setPublico(k)} />
              <strong>{titulo}</strong>
              <span className="hint">{ajuda}</span>
            </label>
          ))}
        </div>
        <div className="row-actions">
          <button type="button" className="btn" onClick={() => void gerar()} disabled={aGerar}>{aGerar ? "A gerar…" : "Gerar rascunho com IA"}</button>
        </div>
        <p className="hint" role="status" aria-live="polite">{estado}</p>
      </details>

      {rascunho && (
        <details className="card dobra" open>
          <summary><h2 id="h-rascunho">3. Rascunho (por validar)</h2></summary>
          <p className="hint">Texto gerado por IA a partir do contexto acima. Confirme números, datas e recomendações antes de enviar ou publicar.</p>
          <textarea className="rascunho" value={rascunho} onChange={(e) => setRascunho(e.target.value)} rows={16} aria-label="Rascunho do comunicado" />
          <div className="row-actions">
            <button type="button" className="btn" onClick={() => void copiar()}>Copiar texto</button>
          </div>
        </details>
      )}
    </>
  );
}
