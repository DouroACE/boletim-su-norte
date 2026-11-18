"use client";

import { useEffect, useId, useState } from "react";
import type { Aviso, Point } from "@/lib/sources";
import { DGS_TEXT } from "@/lib/risk";
import {
  LIGUE_ANTES, EQUIPAMENTO, NIVEIS_TEXTO, exportarCopia, isoValido, normalizarRegisto, periodosRelatorio,
  quintaDe, registoVazio, resumoNiveis, rotuloSemana, segundaDe, semanaAnterior, semanaSeguinte,
  sobrepoeEpocaCritica, sugestaoUSP, tabelaHtml, textoCSP, textoEmail, ultimaSemanaCompleta, validarCopia,
  type Nivel, type RegistoSemanal,
} from "@/lib/relatorios";
import { lerSemana, type Folhas } from "@/lib/semanal";
import { guardar } from "@/lib/partilha";
import s from "@/app/relatorios/relatorios.module.css";

/** Chave do localStorage. Só este browser; cada leitura e escrita está em try/catch. */
const CHAVE = "relatorios-semanais-v1" as const;
const TAMANHO_RESUMO = 60;

type Store = Record<string, RegistoSemanal>;
type Leitura = { ok: true; dados: Store } | { ok: false };

export function lerStore(): Leitura {
  try {
    const raw = localStorage.getItem(CHAVE);
    if (!raw) return { ok: true, dados: {} };
    const j: unknown = JSON.parse(raw);
    if (!j || typeof j !== "object" || Array.isArray(j)) return { ok: false };
    const dados: Store = {};
    for (const [chave, valor] of Object.entries(j)) {
      const r = normalizarRegisto(valor);
      if (!r || r.semana !== chave) return { ok: false };
      dados[chave] = r;
    }
    return { ok: true, dados };
  } catch {
    return { ok: false };
  }
}

// Grava no browser e, com login da equipa, também na base partilhada.
const gravarStore = (dados: Store): boolean => guardar(CHAVE, dados);

const curto = (t: string) => (t.trim().length > TAMANHO_RESUMO ? `${t.trim().slice(0, TAMANHO_RESUMO - 1)}…` : t.trim() || "—");
const numPt = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");

async function copiarTexto(texto: string): Promise<string> {
  try {
    await navigator.clipboard.writeText(texto);
    return "Copiado.";
  } catch {
    return "Não foi possível copiar. Selecione o texto e copie manualmente.";
  }
}

async function copiarTabela(html: string, texto: string): Promise<string> {
  try {
    if (typeof ClipboardItem === "undefined") throw new Error("sem ClipboardItem");
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([texto], { type: "text/plain" }),
      }),
    ]);
    return "Copiado.";
  } catch {
    const feito = await copiarTexto(texto);
    return feito === "Copiado." ? "Copiado como texto simples (este browser não copia tabelas)." : feito;
  }
}

function descarregar(nome: string, conteudo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

interface Props {
  hojeIso: string;
  icaro: Point[] | null;
  friesa65: Point[] | null;
  avisos: Aviso[] | null;
}

export function RelatoriosSemanais({ hojeIso, icaro, friesa65, avisos }: Props) {
  const uid = useId();
  const id = (nome: string) => `${uid}-${nome}`;

  const [segunda, setSegunda] = useState(() => ultimaSemanaCompleta(hojeIso));
  const [store, setStore] = useState<Store>({});
  const [storeOk, setStoreOk] = useState(true);
  const [form, setForm] = useState<RegistoSemanal>(() => registoVazio(ultimaSemanaCompleta(hojeIso)));
  const [msgRegisto, setMsgRegisto] = useState("");
  const [msgEnvio, setMsgEnvio] = useState("");
  const [msgHistorico, setMsgHistorico] = useState("");
  const [periodoIdx, setPeriodoIdx] = useState(0);
  const [msgExcel, setMsgExcel] = useState<string[]>([]);

  // Lê o browser só depois da montagem (evita diferenças entre servidor e cliente).
  useEffect(() => {
    const leitura = lerStore();
    const inicial = ultimaSemanaCompleta(hojeIso);
    if (!leitura.ok) {
      setStoreOk(false);
      setMsgRegisto("Não foi possível ler os registos guardados neste browser. Para não os substituir, guardar, apagar e importar estão desativados; recarregue a página ou exporte o que for possível.");
      return;
    }
    setStore(leitura.dados);
    setForm(leitura.dados[inicial] ?? registoVazio(inicial));
  }, [hojeIso]);

  const guardado = store[segunda];
  const alterado = JSON.stringify(form) !== JSON.stringify(guardado ?? registoVazio(segunda));
  const podeSair = () => !alterado || window.confirm("Há alterações por guardar nesta semana. Mudar de semana sem guardar?");

  function irPara(seg: string) {
    if (seg === segunda) return;
    if (!podeSair()) return;
    setSegunda(seg);
    setForm(store[seg] ?? registoVazio(seg));
    setMsgRegisto("");
  }

  const sugestao = sugestaoUSP(icaro ?? [], friesa65 ?? [], avisos ?? [], segunda, hojeIso);
  const epocaCritica = sobrepoeEpocaCritica(segunda);
  const textoEnvio = textoEmail(form);
  const periodos = periodosRelatorio(hojeIso);
  const periodo = periodos[periodoIdx];
  const todos = Object.values(store).sort((a, b) => b.semana.localeCompare(a.semana));
  const resumo = resumoNiveis(todos, periodo.de, periodo.ate);
  const doPeriodo = todos.filter((r) => r.semana >= periodo.de && r.semana <= periodo.ate).sort((a, b) => a.semana.localeCompare(b.semana));

  function guardar() {
    if (!storeOk) return;
    const registo = { ...form, semana: segunda };
    const novo = { ...store, [segunda]: registo };
    if (!gravarStore(novo)) {
      setMsgRegisto("Não foi possível guardar neste browser (armazenamento bloqueado ou cheio). Exporte uma cópia de segurança.");
      return;
    }
    setStore(novo);
    setForm(registo);
    setMsgRegisto(`Registo de ${rotuloSemana(segunda)} guardado neste browser.`);
  }

  function copiarDaAnterior() {
    const anterior = store[semanaAnterior(segunda)];
    if (!anterior) {
      setMsgRegisto("Não há registo guardado para a semana anterior.");
      return;
    }
    setForm({ ...anterior, semana: segunda, casosSociais: quintaDe(segunda) });
    setMsgRegisto("Campos copiados da semana anterior. Confirme os valores e guarde.");
  }

  function apagar(semana: string) {
    if (!storeOk) return;
    if (!window.confirm(`Apagar o registo de ${rotuloSemana(semana)}? Só uma cópia exportada o recupera.`)) return;
    const { [semana]: _apagado, ...resto } = store;
    if (!gravarStore(resto)) {
      setMsgHistorico("Não foi possível apagar neste browser.");
      return;
    }
    setStore(resto);
    setMsgHistorico(`Registo de ${rotuloSemana(semana)} apagado.`);
  }

  function exportar() {
    const hoje = hojeIso;
    descarregar(`relatorios-semanais-${hoje}.json`, exportarCopia(todos, new Date().toISOString()));
    setMsgHistorico("Cópia exportada.");
  }

  async function importar(ficheiro: File | undefined, input: HTMLInputElement) {
    if (!ficheiro || !storeOk) return;
    let registos: RegistoSemanal[] | null = null;
    try {
      registos = validarCopia(JSON.parse(await ficheiro.text()));
    } catch {
      registos = null;
    }
    input.value = "";
    if (!registos) {
      setMsgHistorico("Ficheiro inválido: não é uma cópia exportada desta página.");
      return;
    }
    const diferentes = registos.filter((r) => store[r.semana] && JSON.stringify(store[r.semana]) !== JSON.stringify(r));
    const substituir = diferentes.length === 0 || window.confirm(
      `${diferentes.length} semana(s) já existem neste browser com valores diferentes. Substituí-las pela cópia? Cancelar mantém as existentes e importa só as novas.`
    );
    const novo: Store = { ...store };
    let importadas = 0;
    for (const r of registos) {
      if (store[r.semana] && JSON.stringify(store[r.semana]) === JSON.stringify(r)) continue;
      if (store[r.semana] && !substituir) continue;
      novo[r.semana] = r;
      importadas++;
    }
    if (!gravarStore(novo)) {
      setMsgHistorico("Não foi possível guardar a importação neste browser.");
      return;
    }
    setStore(novo);
    const atual = novo[segunda];
    if (atual && !alterado) setForm(atual);
    setMsgHistorico(`${importadas} semana(s) importada(s).`);
  }

  /** Lê um ou mais ficheiros semanais (.xlsx) e guarda cada semana. O ficheiro nunca sai do browser. */
  async function carregarExcel(lista: FileList | null, input: HTMLInputElement) {
    if (!lista?.length || !storeOk) return;
    const { default: lerXlsx } = await import("read-excel-file/browser");
    const novo: Store = { ...store };
    const linhas: string[] = [];
    let ultima = "";
    for (const f of Array.from(lista)) {
      try {
        if (!f.name.toLowerCase().endsWith(".xlsx")) throw new Error("use o modelo .xlsx");
        const folhas: Folhas = {};
        for (const { sheet, data } of await lerXlsx(f)) folhas[sheet] = data as Folhas[string];
        const lido = lerSemana(folhas);
        if ("erro" in lido) { linhas.push(`${f.name}: ${lido.erro}`); continue; }
        const r = lido.registo;
        if (!r.uspTexto) r.uspTexto = sugestaoUSP(icaro ?? [], friesa65 ?? [], avisos ?? [], r.semana, hojeIso);
        if (novo[r.semana] && !window.confirm(`Já existe registo de ${rotuloSemana(r.semana)}. Substituir pelo ficheiro ${f.name}?`)) {
          linhas.push(`${f.name}: ${rotuloSemana(r.semana)} mantida como estava.`);
          continue;
        }
        novo[r.semana] = r;
        ultima = r.semana;
        linhas.push(`${f.name}: ${rotuloSemana(r.semana)} carregada.${lido.avisos.length ? ` Verifique: ${lido.avisos.join(" ")}` : ""}`);
      } catch (e) {
        linhas.push(`${f.name}: não foi possível ler (${(e as Error).message}).`);
      }
    }
    input.value = "";
    if (ultima && !gravarStore(novo)) {
      setMsgExcel([...linhas, "Não foi possível guardar neste browser (armazenamento bloqueado ou cheio)."]);
      return;
    }
    setStore(novo);
    if (ultima) { setSegunda(ultima); setForm(novo[ultima]); }
    setMsgExcel(linhas);
  }

  async function copiarPeriodo() {
    if (!doPeriodo.length) {
      setMsgHistorico("Não há semanas com registo neste período.");
      return;
    }
    setMsgHistorico(await copiarTabela(tabelaHtml(doPeriodo), doPeriodo.map(textoEmail).join("\n\n")));
  }

  return (
    <div className={s.pagina}>
      {/* 1. Carregar o Excel da semana */}
      <details className="card dobra" open>
        <summary><h2 id={id("h-excel")}>1. Carregar a semana (Excel)</h2></summary>
        <p className="hint">
          Cada equipa preenche a sua folha do modelo (Hospital, CSP, USP, Laboratório e Indicadores diários) e a USP larga aqui o ficheiro.
          Pode largar várias semanas de uma vez. Os ficheiros são lidos só neste browser.
        </p>
        <div className={s.acoes}>
          <a className="btn ghost" href="/api/modelo-semanal" download>Descarregar modelo semanal (.xlsx)</a>
          <label className={`btn ${s.ficheiro}`} aria-disabled={!storeOk}>
            Escolher ficheiro(s) da semana
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              multiple
              disabled={!storeOk}
              onChange={(e) => void carregarExcel(e.target.files, e.target)}
              className={s.ocultoInput}
            />
          </label>
        </div>
        <ul className={s.estado} role="status" aria-live="polite">{msgExcel.map((l, i) => <li key={i}>{l}</li>)}</ul>
      </details>

      {/* 2. Relatório da DE-SNS */}
      <details className="card dobra" open>
        <summary><h2 id={id("h-hist")}>2. Monitorização semanal · relatório para a DE-SNS</h2></summary>
        <p className="hint">A tabela «Monitorização Semanal do PCRSS» com uma linha por semana carregada. Copie o período e cole no Word ou no Outlook.</p>
        {todos.length === 0 ? (
          <p className="hint">Ainda não há semanas guardadas neste browser.</p>
        ) : (
          <div className="table-wrap">
            <table className="uls-table">
              <thead>
                <tr><th scope="col">Semana</th><th scope="col">Nível hospitalar</th><th scope="col">Camas livres / macas</th><th scope="col">CSP</th><th scope="col">USP</th><th scope="col"><span className="sr-only">Ações</span></th></tr>
              </thead>
              <tbody>
                {todos.map((r) => (
                  <tr key={r.semana}>
                    <th scope="row">{rotuloSemana(r.semana)}</th>
                    <td data-label="Nível hospitalar"><span className={`dgs-badge dgs-${r.cuidadosNivel}`}>{DGS_TEXT[r.cuidadosNivel]}</span></td>
                    <td data-label="Camas / macas">{r.camasLivres ?? "—"}/{r.macasLivres ?? "—"}</td>
                    <td data-label="CSP">{r.cspDoentesMedicoHora != null ? `${numPt(r.cspDoentesMedicoHora)} doentes/médico/h` : curto(r.cspAfluencia)}</td>
                    <td data-label="USP">{curto(r.uspTexto)}</td>
                    <td>
                      <div className={s.acoesLinha}>
                        <button type="button" className="btn ghost" onClick={() => { if (podeSair()) { setSegunda(r.semana); setForm(r); setMsgRegisto(""); document.getElementById(id("h-envio"))?.scrollIntoView({ behavior: "smooth" }); } }} aria-label={`Abrir ${rotuloSemana(r.semana)}`}>Abrir</button>
                        <button type="button" className="btn danger" onClick={() => apagar(r.semana)} disabled={!storeOk} aria-label={`Apagar ${rotuloSemana(r.semana)}`}>Apagar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className={s.periodo}>
          <div className={s.campo}>
            <label htmlFor={id("periodo")}>Período do relatório</label>
            <select id={id("periodo")} value={periodoIdx} onChange={(e) => setPeriodoIdx(Number(e.target.value))}>
              {periodos.map((p, i) => <option key={p.nome} value={i}>{p.nome} · {p.de.split("-").reverse().join("/")} a {p.ate.split("-").reverse().join("/")} (envio até {p.prazo})</option>)}
            </select>
          </div>
          <ul className={s.resumo} aria-label="Resumo do período">
            <li>Semanas com registo: <strong>{resumo.semanas}</strong></li>
            {NIVEIS_TEXTO.map((t, n) => <li key={t}>{t} (nível {n}): <strong>{resumo.porNivel[n]}</strong></li>)}
            <li>Semanas em nível 2 ou 3: {resumo.semanasAlto.length ? resumo.semanasAlto.map((x) => rotuloSemana(x)).join("; ") : "nenhuma"}</li>
          </ul>
        </div>

        <div className={s.acoes}>
          <button type="button" className="btn" onClick={copiarPeriodo}>Copiar tabela do período</button>
        </div>
        <p className={s.estado} role="status" aria-live="polite">{msgHistorico}</p>
      </details>

      {/* 3. Texto da semana */}
      <details className="card dobra" open>
        <summary><h2 id={id("h-envio")}>3. E-mail da semana · {rotuloSemana(segunda)}</h2></summary>
        <p className="hint">Os 11 campos da matriz semanal da DE-SNS, para colar no e-mail de segunda-feira. Escolha a semana em «Abrir» na tabela acima.</p>
        <textarea id={id("previa")} className={s.previa} readOnly rows={12} value={textoEnvio} aria-label="Pré-visualização do e-mail" />
        <div className={s.acoes}>
          <button
            type="button"
            className="btn"
            onClick={async () => setMsgEnvio(await copiarTexto(textoEnvio))}
          >
            Copiar texto
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={async () => setMsgEnvio(await copiarTabela(tabelaHtml([{ ...form, semana: segunda }]), textoEnvio))}
          >
            Copiar tabela
          </button>
        </div>
        <p className={s.estado} role="status" aria-live="polite">{msgEnvio}</p>
      </details>

      {/* 4. Rever ou editar */}
      <details className="card dobra">
        <summary><h2 id={id("h-semana")}>4. Rever ou corrigir uma semana</h2></summary>
        <p className="hint">Semana de segunda a domingo. Por omissão, a última semana completa.</p>
        <div className={s.semana}>
          <button type="button" className="btn ghost" onClick={() => irPara(semanaAnterior(segunda))}>‹ Semana anterior</button>
          <div className={s.campo}>
            <label htmlFor={id("data")}>Segunda-feira da semana</label>
            <input
              id={id("data")}
              type="date"
              value={segunda}
              onChange={(e) => isoValido(e.target.value) && irPara(segundaDe(e.target.value))}
            />
          </div>
          <button type="button" className="btn ghost" onClick={() => irPara(semanaSeguinte(segunda))}>Semana seguinte ›</button>
        </div>
        <p className={s.rotulo}><strong>{rotuloSemana(segunda)}</strong></p>
        <p className="hint">Os valores vêm do Excel; corrija aqui o que for preciso e guarde.</p>
        {epocaCritica && (
          <p className={s.nota} role="note">Esta semana está na época crítica dos CSP (15/11 a 31/01).</p>
        )}
        <div className={s.form}>
          <div className={s.campo}>
            <label htmlFor={id("cuid-nivel")}>2. Cuidados hospitalares: nível de ativação por procura do SU</label>
            <select id={id("cuid-nivel")} value={form.cuidadosNivel} onChange={(e) => setForm({ ...form, cuidadosNivel: Number(e.target.value) as Nivel })}>
              {NIVEIS_TEXTO.map((t, n) => <option key={n} value={n}>{n} · {t}</option>)}
            </select>
          </div>
          <div className={s.campo}>
            <label htmlFor={id("cuid-estr")}>Estratégias de resposta</label>
            <textarea id={id("cuid-estr")} className={s.area} rows={3} value={form.cuidadosEstrategias} onChange={(e) => setForm({ ...form, cuidadosEstrategias: e.target.value })} />
          </div>

          <div className={s.campo}>
            <label htmlFor={id("camas-nivel")}>3. Camas suplementares para internamento: nível de ativação</label>
            <select id={id("camas-nivel")} value={form.camasNivel} onChange={(e) => setForm({ ...form, camasNivel: Number(e.target.value) as Nivel })}>
              {NIVEIS_TEXTO.map((t, n) => <option key={n} value={n}>{n} · {t}</option>)}
            </select>
          </div>
          <div className={s.campo}>
            <label htmlFor={id("camas-texto")}>Camas suplementares (texto)</label>
            <textarea id={id("camas-texto")} className={s.area} rows={2} value={form.camasTexto} onChange={(e) => setForm({ ...form, camasTexto: e.target.value })} />
          </div>

          <div className={s.campo}>
            <label htmlFor={id("csp-doentes")}>4. CSP: doentes por médico por hora</label>
            <input
              id={id("csp-doentes")}
              type="number"
              inputMode="decimal"
              min={0}
              step={0.1}
              value={form.cspDoentesMedicoHora ?? ""}
              onChange={(e) => {
                const n = e.target.value === "" ? null : Number(e.target.value.replace(",", "."));
                const valido = n !== null && Number.isFinite(n) && n >= 0 ? n : null;
                setForm({ ...form, cspDoentesMedicoHora: valido, cspAfluencia: valido === null ? form.cspAfluencia : textoCSP(valido) });
              }}
            />
          </div>
          <div className={s.campo}>
            <label htmlFor={id("csp-afl")}>CSP: afluência (texto, editável)</label>
            <textarea id={id("csp-afl")} className={s.area} rows={2} value={form.cspAfluencia} onChange={(e) => setForm({ ...form, cspAfluencia: e.target.value })} />
          </div>
          <div className={s.campo}>
            <label htmlFor={id("csp-ativ")}>CSP: atividade programada</label>
            <textarea id={id("csp-ativ")} className={s.area} rows={2} value={form.cspAtividade} onChange={(e) => setForm({ ...form, cspAtividade: e.target.value })} />
          </div>
          <div className={s.campo}>
            <label htmlFor={id("csp-sac")}>CSP: consulta em regime aberto (SAC)</label>
            <textarea id={id("csp-sac")} className={s.area} rows={2} value={form.cspSac} onChange={(e) => setForm({ ...form, cspSac: e.target.value })} />
          </div>

          <div className={`${s.campo} ${s.larga}`}>
            <label htmlFor={id("usp")}>5. USP: alertas e avisos em vigor e atividade</label>
            <textarea id={id("usp")} className={s.area} rows={3} value={form.uspTexto} onChange={(e) => setForm({ ...form, uspTexto: e.target.value })} />
            <div className={s.acoes}>
              <button type="button" className="btn ghost" onClick={() => setForm({ ...form, uspTexto: sugestao })}>Usar sugestão</button>
            </div>
            <p className="hint">Sugestão: {sugestao}</p>
            {(icaro === null || friesa65 === null || avisos === null) && (
              <p className={s.nota} role="note">Alguma fonte (ÍCARO, FRIESA ou IPMA) está indisponível neste momento: confirme a USP manualmente.</p>
            )}
          </div>

          <div className={s.campo}>
            <label htmlFor={id("casos")}>6. Atualização de casos sociais (data)</label>
            <input id={id("casos")} type="date" value={form.casosSociais} onChange={(e) => isoValido(e.target.value) && setForm({ ...form, casosSociais: e.target.value })} />
          </div>
          <div className={s.campo}>
            <label htmlFor={id("ligue")}>7. Projeto "Ligue Antes, Salve Vidas"</label>
            <select id={id("ligue")} value={form.ligueAntes} onChange={(e) => setForm({ ...form, ligueAntes: e.target.value as RegistoSemanal["ligueAntes"] })}>
              {LIGUE_ANTES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className={s.campo}>
            <label htmlFor={id("ref")}>8. Referenciações inter-ULS por constrangimentos nos serviços ou escalas</label>
            <select id={id("ref")} value={form.referenciacoes} onChange={(e) => setForm({ ...form, referenciacoes: e.target.value as "Sim" | "Não" })}>
              <option value="Não">Não</option>
              <option value="Sim">Sim</option>
            </select>
          </div>
          <div className={s.campo}>
            <label htmlFor={id("camas-livres")}>9. Camas livres, em média</label>
            <input id={id("camas-livres")} type="number" inputMode="decimal" min={0} step={0.5} value={form.camasLivres ?? ""} onChange={(e) => setForm({ ...form, camasLivres: e.target.value === "" ? null : Number(e.target.value) })} />
          </div>
          <div className={s.campo}>
            <label htmlFor={id("macas-livres")}>9. Macas livres, em média</label>
            <input id={id("macas-livres")} type="number" inputMode="decimal" min={0} step={0.5} value={form.macasLivres ?? ""} onChange={(e) => setForm({ ...form, macasLivres: e.target.value === "" ? null : Number(e.target.value) })} />
          </div>
          <div className={s.campo}>
            <label htmlFor={id("equip")}>10. Equipamento, incluindo cadeiras de rodas</label>
            <select id={id("equip")} value={form.equipamento} onChange={(e) => setForm({ ...form, equipamento: e.target.value as RegistoSemanal["equipamento"] })}>
              {EQUIPAMENTO.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className={s.campo}>
            <label htmlFor={id("equip-texto")}>Equipamento (texto, opcional)</label>
            <input id={id("equip-texto")} type="text" value={form.equipamentoTexto} onChange={(e) => setForm({ ...form, equipamentoTexto: e.target.value })} />
          </div>
          <div className={`${s.campo} ${s.larga}`}>
            <label htmlFor={id("obs")}>11. Observações</label>
            <textarea id={id("obs")} className={s.area} rows={3} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
          </div>
        </div>

        <div className={s.acoes}>
          <button type="button" className="btn ghost" onClick={copiarDaAnterior}>Copiar da semana anterior</button>
          <button type="button" className="btn" onClick={guardar} disabled={!storeOk}>Guardar</button>
        </div>
        <p className={s.estado} role="status" aria-live="polite">{msgRegisto}</p>
      </details>

      {/* 5. Cópia de segurança */}
      <details className="card dobra">
        <summary><h2 id={id("h-copia")}>5. Cópia de segurança</h2></summary>
        <p className="hint">Os registos ficam só neste browser. Exporte uma cópia regularmente e importe-a noutro computador.</p>
        <div className={s.acoes}>
          <button type="button" className="btn ghost" onClick={exportar}>Exportar cópia (.json)</button>
          <label className={`btn ghost ${s.ficheiro}`} aria-disabled={!storeOk}>
            Importar cópia (.json)
            <input
              id={id("import")}
              type="file"
              accept="application/json,.json"
              disabled={!storeOk}
              onChange={(e) => importar(e.target.files?.[0], e.target)}
              className={s.ocultoInput}
            />
          </label>
        </div>
        <p className={s.estado} role="status" aria-live="polite">{msgHistorico}</p>
      </details>
    </div>
  );
}
