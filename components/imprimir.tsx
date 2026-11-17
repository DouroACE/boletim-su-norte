"use client";
import { useEffect, useState } from "react";

/** Abre os `details` fechados para saírem no PDF, repõe-nos depois de imprimir. */
function imprimirComDetalhes() {
  const fechados = Array.from(document.querySelectorAll<HTMLDetailsElement>("details:not([open])"));
  fechados.forEach((d) => { d.open = true; });
  const repor = () => {
    fechados.forEach((d) => { d.open = false; });
    window.removeEventListener("afterprint", repor);
  };
  window.addEventListener("afterprint", repor);
  window.print();
}

/** Botão para imprimir ou guardar o boletim como PDF (diálogo de impressão do browser). */
export function Imprimir() {
  return (
    <button type="button" className="btn ghost imprimir" onClick={imprimirComDetalhes}>
      Imprimir / guardar PDF
    </button>
  );
}

/** Linha só para impressão, debaixo do cabeçalho: data de impressão e nota sobre as fontes. */
export function RodapeImpressao() {
  const [quando, setQuando] = useState<string | null>(null);
  useEffect(() => {
    setQuando(new Date().toLocaleString("pt-PT", { timeZone: "Europe/Lisbon", dateStyle: "long", timeStyle: "short" }));
  }, []);
  return <p className="so-impressao">{quando && <>Boletim gerado a {quando} · Fontes indicadas em cada gráfico</>}</p>;
}
