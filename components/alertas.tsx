"use client";

import { useId, useRef, useState } from "react";
import type { Aviso, Point } from "@/lib/sources";
import { gerarAlerta, nivelDeAviso, perigoDeAviso, type Alerta, type AlertaInput, type Fonte, type Nivel, type Perigo } from "@/lib/alertas";
import { fmtDate } from "@/components/ui";
import s from "@/app/alertas/alertas.module.css";

const PERIGOS: [Perigo, string][] = [
  ["calor", "Calor"],
  ["frio", "Frio"],
  ["tempestade", "Chuva, vento ou tempestade"],
  ["incendio", "Incêndio rural"],
  ["ar", "Qualidade do ar"],
  ["geral", "Outro aviso meteorológico"],
];
const NIVEIS: [Nivel, string][] = [
  ["amarelo", "Amarelo"],
  ["laranja", "Laranja"],
  ["vermelho", "Vermelho"],
  ["significativo", "Impacto significativo (ÍCARO)"],
  ["maximo", "Máximo perigo"],
];
const capitaliza = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

interface Gatilho {
  id: string;
  rotulo: string;
  input: AlertaInput | null;
  nota?: string;
}

/** Campo somente de leitura com botão "Copiar" (com alternativa para browsers sem clipboard). */
function Campo({ rotulo, valor, linhas }: { rotulo: string; valor: string; linhas: number }) {
  const id = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [estado, setEstado] = useState("");

  async function copiar() {
    try {
      await navigator.clipboard.writeText(valor);
      setEstado("Copiado.");
    } catch {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.select();
      setEstado(document.execCommand("copy") ? "Copiado." : "Selecione o texto e copie manualmente.");
    }
  }

  return (
    <div className={s.campo}>
      <div className={s.acoes} style={{ justifyContent: "space-between", alignItems: "center" }}>
        <label htmlFor={id}>{rotulo}</label>
        <button type="button" className={s.btn} onClick={copiar} aria-label={`Copiar ${rotulo.toLowerCase()}`}>Copiar</button>
      </div>
      <textarea ref={ref} id={id} className={s.textarea} readOnly rows={linhas} value={valor} />
      <p className={s.estado} role="status" aria-live="polite">{estado}</p>
    </div>
  );
}

export function AlertasGerador({ avisos, icaro }: { avisos: Aviso[]; icaro: Point | null }) {
  const uid = useId();
  const [selId, setSelId] = useState<string | null>(null);
  const [icaroOk, setIcaroOk] = useState(false);
  const [manual, setManual] = useState<{ perigo: Perigo; nivel: Nivel; fonte: Fonte; inicio: string; fim: string }>({
    perigo: "calor",
    nivel: "amarelo",
    fonte: "aviso",
    inicio: "",
    fim: "",
  });

  const gatilhos: Gatilho[] = [
    ...avisos.map((a, k): Gatilho => ({
      id: `aviso-${k}`,
      rotulo: `Aviso ${a.nivel === "yellow" ? "amarelo" : a.nivel === "orange" ? "laranja" : "vermelho"} · ${a.tipo} · ${fmtDate(a.inicio)} a ${fmtDate(a.fim)}`,
      input: { perigo: perigoDeAviso(a.tipo), nivel: nivelDeAviso(a.nivel), inicio: a.inicio.slice(0, 10), fim: a.fim.slice(0, 10), fonte: "aviso" },
    })),
    ...(icaro
      ? [{
          id: "icaro",
          rotulo: `Boletim ÍCARO · ${fmtDate(icaro.date)} · índice ${icaro.value.toLocaleString("pt-PT", { maximumFractionDigits: 2 })}`,
          input: icaroOk ? { perigo: "calor" as const, nivel: "significativo" as const, inicio: icaro.date, fim: icaro.date, fonte: "icaro" as const } : null,
          nota: "Marque «Efeito significativo na mortalidade» para gerar os textos.",
        }]
      : []),
    {
      id: "manual",
      rotulo: "Manual (perigo, nível e datas à escolha)",
      input: manual,
    },
  ];

  const atual = gatilhos.find((g) => g.id === (selId ?? gatilhos[0]?.id)) ?? gatilhos.at(-1)!;
  const alerta: Alerta | null = atual.input ? gerarAlerta(atual.input) : null;

  const ids = { gatilho: `${uid}-gatilho`, perigo: `${uid}-perigo`, nivel: `${uid}-nivel`, fonte: `${uid}-fonte`, ini: `${uid}-ini`, fim: `${uid}-fim` };

  return (
    <div className={s.gerador}>
      <div className={s.painelEsq}>
        <div className={s.campo}>
          <label htmlFor={ids.gatilho}>Gatilho</label>
          <select id={ids.gatilho} className={s.select} value={atual.id} onChange={(e) => setSelId(e.target.value)}>
            {gatilhos.map((g) => <option key={g.id} value={g.id}>{g.rotulo}</option>)}
          </select>
        </div>

        {atual.id === "icaro" && (
          <label className={s.check}>
            <input type="checkbox" checked={icaroOk} onChange={(e) => setIcaroOk(e.target.checked)} />
            Efeito significativo na mortalidade
          </label>
        )}

        {atual.id === "manual" && (
          <fieldset className={s.campo} style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className={s.rotulo}>Dados do alerta</legend>
            <div className={s.campo}>
              <label htmlFor={ids.perigo}>Perigo</label>
              <select id={ids.perigo} className={s.select} value={manual.perigo} onChange={(e) => setManual({ ...manual, perigo: e.target.value as Perigo })}>
                {PERIGOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
            </div>
            <div className={s.campo}>
              <label htmlFor={ids.nivel}>Nível</label>
              <select id={ids.nivel} className={s.select} value={manual.nivel} onChange={(e) => setManual({ ...manual, nivel: e.target.value as Nivel })}>
                {NIVEIS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
            </div>
            <div className={s.campo}>
              <label htmlFor={ids.fonte}>Origem</label>
              <select id={ids.fonte} className={s.select} value={manual.fonte} onChange={(e) => setManual({ ...manual, fonte: e.target.value as Fonte })}>
                <option value="aviso">Aviso IPMA (ou qualidade do ar, APA)</option>
                <option value="icaro">Boletim ÍCARO (INSA)</option>
              </select>
            </div>
            <div className={s.linha}>
              <div className={s.campo}>
                <label htmlFor={ids.ini}>Início</label>
                <input id={ids.ini} type="date" className={s.input} value={manual.inicio} onChange={(e) => setManual({ ...manual, inicio: e.target.value })} />
              </div>
              <div className={s.campo}>
                <label htmlFor={ids.fim}>Fim</label>
                <input id={ids.fim} type="date" className={s.input} value={manual.fim} onChange={(e) => setManual({ ...manual, fim: e.target.value })} />
              </div>
            </div>
          </fieldset>
        )}

        {atual.nota && !atual.input && <p className={s.nota}>{atual.nota}</p>}
        <p className={s.nota}>Os destinatários estão na folha de contactos da equipa (Contactos_Saúde Sazonal). Os textos são enviados em BCC às instituições parceiras.</p>
      </div>

      <div className={s.painelDir}>
        {alerta ? (
          <>
            <p className="partial" role="note">Texto gerado automaticamente: confirme datas, nível e recomendações antes de enviar.</p>
            <Campo rotulo="Assunto" valor={alerta.assunto} linhas={1} />
            <Campo rotulo="Email às instituições parceiras" valor={alerta.email} linhas={14} />
            <div className={s.acoes}>
              {/* Sem destinatários: a equipa acrescenta as instituições em BCC no cliente de email. */}
              <a className={`${s.btnLink} ${s.btnPrincipal}`} href={`mailto:?subject=${encodeURIComponent(alerta.assunto)}&body=${encodeURIComponent(alerta.email)}`}>Abrir no email</a>
            </div>
            <Campo rotulo="Legenda para redes sociais" valor={alerta.redes} linhas={4} />
            <Campo rotulo="Reencaminhamento interno" valor={alerta.interno} linhas={10} />
          </>
        ) : (
          <p className={s.vazio}>Escolha um gatilho com dados completos para gerar os textos.</p>
        )}
      </div>
    </div>
  );
}
