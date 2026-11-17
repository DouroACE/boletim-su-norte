"use client";
// Importar dados de boletins passados: cada coluna é mapeada para uma métrica padrão e as séries ficam neste browser.
// Nada é enviado ao servidor.
import { useEffect, useState } from "react";
import { parseCSV } from "@/lib/analise";
import {
  METRICAS, csvHistorico, juntarHistorico, lerFolha, padronizar, resumoHistorico, validarHistorico,
  type FolhaLida, type Historico,
} from "@/lib/historico";

export const CHAVE_HISTORICO = "historico-padronizado-v1";

type Fonte = { ficheiro: string; folha: string; dias: number; de: string; ate: string; metricas: number; importado: string };
type Guardado = { v: 1; metricas: Historico; fontes: Fonte[] };
type Pendente = { f: FolhaLida; mapa: Record<number, string>; incluir: boolean };

/** Lê o histórico padronizado deste browser (vazio se não houver ou se estiver corrompido). */
export function lerHistorico(): Guardado {
  try {
    const j = JSON.parse(localStorage.getItem(CHAVE_HISTORICO) ?? "null") as Partial<Guardado> | null;
    const metricas = j ? validarHistorico(j.metricas) : null;
    if (j && j.v === 1 && metricas && Array.isArray(j.fontes)) return { v: 1, metricas, fontes: j.fontes };
  } catch {
    /* sem armazenamento: começa vazio */
  }
  return { v: 1, metricas: {}, fontes: [] };
}

const GRUPOS = [...new Set(METRICAS.map((m) => m.grupo))];
const dataPt = (iso: string) => iso.split("-").reverse().join("/");
const num = (n: number) => n.toLocaleString("pt-PT", { maximumFractionDigits: 1 });

export function ImportarHistorico() {
  const [guardado, setGuardado] = useState<Guardado>({ v: 1, metricas: {}, fontes: [] });
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [estado, setEstado] = useState("");

  useEffect(() => setGuardado(lerHistorico()), []);

  async function ler(lista: FileList | null, input: HTMLInputElement) {
    if (!lista?.length) return;
    setEstado("A ler…");
    const novas: Pendente[] = [];
    const notas: string[] = [];
    for (const file of Array.from(lista)) {
      try {
        const ext = file.name.split(".").pop()?.toLowerCase();
        const folhas: { sheet: string; data: (string | number | Date | null)[][] }[] =
          ext === "csv"
            ? [{ sheet: "CSV", data: parseCSV(await file.text()) }]
            : ext === "xlsx"
              ? ((await (await import("read-excel-file/browser")).default(file)) as unknown as { sheet: string; data: (string | number | Date | null)[][] }[])
              : [];
        if (!folhas.length) { notas.push(`${file.name}: use .xlsx ou .csv.`); continue; }
        let comDatas = 0;
        for (const { sheet, data } of folhas) {
          const f = lerFolha(file.name, sheet, data);
          if (!f) continue;
          comDatas++;
          novas.push({ f, incluir: true, mapa: Object.fromEntries(f.colunas.filter((c) => c.sugestao).map((c) => [c.indice, c.sugestao as string])) });
        }
        if (!comDatas) notas.push(`${file.name}: nenhuma folha com datas (dia a dia).`);
      } catch (e) {
        notas.push(`${file.name}: não foi possível ler (${(e as Error).message}).`);
      }
    }
    input.value = "";
    setPendentes(novas);
    setEstado([novas.length ? `${novas.length} folha(s) com datas. Confirme as métricas e guarde.` : "", ...notas].filter(Boolean).join(" "));
  }

  const mudar = (i: number, alteracao: Partial<Pendente>) => setPendentes((p) => p.map((x, j) => (j === i ? { ...x, ...alteracao } : x)));

  function guardar() {
    let metricas = guardado.metricas;
    const fontes = [...guardado.fontes];
    for (const p of pendentes.filter((x) => x.incluir)) {
      metricas = juntarHistorico(metricas, padronizar(p.f, p.mapa));
      fontes.push({ ficheiro: p.f.ficheiro, folha: p.f.folha, dias: p.f.dias, de: p.f.de, ate: p.f.ate, metricas: Object.keys(p.mapa).length, importado: new Date().toISOString().slice(0, 10) });
    }
    const novo: Guardado = { v: 1, metricas, fontes };
    try {
      localStorage.setItem(CHAVE_HISTORICO, JSON.stringify(novo));
    } catch {
      setEstado("Não foi possível guardar neste browser (armazenamento bloqueado ou cheio).");
      return;
    }
    setGuardado(novo);
    setPendentes([]);
    setEstado("Histórico padronizado guardado neste browser. Também aparece no Workspace, no grupo «Histórico».");
  }

  function descarregarCsv() {
    const url = URL.createObjectURL(new Blob(["﻿" + csvHistorico(guardado.metricas)], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "historico-padronizado.csv" });
    a.click();
    URL.revokeObjectURL(url);
  }

  function apagar() {
    if (!window.confirm("Apagar o histórico padronizado deste browser? Os ficheiros originais não são afetados.")) return;
    try { localStorage.removeItem(CHAVE_HISTORICO); } catch { /* nada a apagar */ }
    setGuardado({ v: 1, metricas: {}, fontes: [] });
    setEstado("Histórico apagado.");
  }

  const resumo = resumoHistorico(guardado.metricas);
  const anos = [...new Set(resumo.flatMap((r) => Object.keys(r.porAno)))].sort().slice(-4);

  return (
    <>
      <p className="hint">
        Largue os Excel de épocas anteriores (ex.: «Vigilância Sazonal 2023-2024»). Cada coluna é associada a uma métrica padrão, com o mesmo
        nome em todos os anos: «MortDiaria no ACES» e «MortDiaria no ACES Gondomar» passam a «Óbitos diários · ACES Gondomar». Escalas em texto
        (qualidade do ar, alertas) passam a números. Os ficheiros são lidos só neste browser.
      </p>
      <div className="row-actions">
        <label className="btn">
          Escolher ficheiros (.xlsx ou .csv)
          <input type="file" accept=".xlsx,.csv" multiple onChange={(e) => void ler(e.target.files, e.target)} className="sr-only" />
        </label>
      </div>
      <p className="hint" role="status" aria-live="polite">{estado}</p>

      {pendentes.map((p, i) => (
        <div key={`${p.f.ficheiro}-${p.f.folha}`} className="historico-folha">
          <label className="historico-titulo">
            <input type="checkbox" checked={p.incluir} onChange={(e) => mudar(i, { incluir: e.target.checked })} />
            <strong>{p.f.ficheiro} · {p.f.folha}</strong>
            <span className="hint">{p.f.dias} dias, {dataPt(p.f.de)} a {dataPt(p.f.ate)} · {Object.keys(p.mapa).length} métricas</span>
          </label>
          {p.incluir && (
            <details>
              <summary>Rever as métricas de cada coluna</summary>
              <div className="table-wrap">
                <table className="uls-table">
                  <thead><tr><th scope="col">Coluna no ficheiro</th><th scope="col">Exemplo</th><th scope="col">Métrica padrão</th></tr></thead>
                  <tbody>
                    {p.f.colunas.map((c) => (
                      <tr key={c.indice}>
                        <th scope="row">{c.nome}</th>
                        <td data-label="Exemplo"><small>{c.amostra}</small></td>
                        <td data-label="Métrica padrão">
                          <select
                            aria-label={`Métrica padrão para ${c.nome}`}
                            value={p.mapa[c.indice] ?? ""}
                            onChange={(e) => {
                              const { [c.indice]: _antigo, ...resto } = p.mapa;
                              mudar(i, { mapa: e.target.value ? { ...resto, [c.indice]: e.target.value } : resto });
                            }}
                          >
                            <option value="">Ignorar</option>
                            {GRUPOS.map((g) => (
                              <optgroup key={g} label={g}>
                                {METRICAS.filter((m) => m.grupo === g).map((m) => <option key={m.id} value={m.id}>{m.rotulo}</option>)}
                              </optgroup>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>
      ))}
      {pendentes.length > 0 && (
        <div className="row-actions">
          <button type="button" className="btn" onClick={guardar} disabled={!pendentes.some((p) => p.incluir)}>Padronizar e guardar</button>
          <button type="button" className="btn ghost" onClick={() => { setPendentes([]); setEstado(""); }}>Cancelar</button>
        </div>
      )}

      {resumo.length > 0 && (
        <>
          <h3 className="sub-h">Histórico padronizado neste browser</h3>
          <div className="table-wrap">
            <table className="uls-table">
              <caption className="sr-only">Métricas padronizadas: dias com valor, período e média e máximo por ano</caption>
              <thead>
                <tr><th scope="col">Métrica</th><th scope="col">Dias</th><th scope="col">Período</th>{anos.map((a) => <th key={a} scope="col">{a}<br /><small>média · máx.</small></th>)}</tr>
              </thead>
              <tbody>
                {resumo.map((r) => (
                  <tr key={r.id}>
                    <th scope="row">{r.rotulo}</th>
                    <td className="num" data-label="Dias">{r.dias}</td>
                    <td data-label="Período"><small>{dataPt(r.de)} a {dataPt(r.ate)}</small></td>
                    {anos.map((a) => <td key={a} data-label={`${a} (média · máx.)`}>{r.porAno[a] ? `${num(r.porAno[a].media)} · ${num(r.porAno[a].max)}` : "—"}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint">Fontes: {guardado.fontes.map((f) => `${f.ficheiro} · ${f.folha}`).join("; ")}. Em datas repetidas fica o ficheiro importado por último.</p>
          <div className="row-actions">
            <button type="button" className="btn ghost" onClick={descarregarCsv}>Descarregar CSV padronizado</button>
            <a className="btn ghost" href="/workspace">Estudar no Workspace</a>
            <button type="button" className="btn danger" onClick={apagar}>Apagar histórico</button>
          </div>
        </>
      )}
    </>
  );
}
