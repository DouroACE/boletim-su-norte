import type { Metadata } from "next";
import { fetchFriesaPorto, fetchIcaro, fetchNorte, fetchObitosDiarios } from "@/lib/sources";
import { Fonte } from "@/components/ui";
import { Navegacao } from "@/components/nav";
import { Workspace } from "@/components/workspace";

export const metadata: Metadata = { title: "Workspace · Saúde Sazonal ULSSA" };
export const revalidate = 10800;

const DIAS_HISTORICO = 400;
const orNull = <T,>(p: Promise<T>) => p.catch(() => null);

export default async function WorkspacePage() {
  const desde = new Date(Date.now() - DIAS_HISTORICO * 864e5).toISOString().slice(0, 10);
  const [icaro, friesa, norte, obitos] = await Promise.all([
    orNull(fetchIcaro(desde)),
    orNull(fetchFriesaPorto(desde)),
    orNull(fetchNorte(desde)),
    orNull(fetchObitosDiarios(desde)),
  ]);
  // Séries públicas diárias, ao lado das semanas carregadas em Relatórios.
  const publicos = [
    { nome: "Índice ÍCARO", pts: icaro },
    { nome: "Índice FRIESA Porto (65+)", pts: friesa?.mais65 ?? null },
    { nome: "Índice FRIESA Porto (geral)", pts: friesa?.geral ?? null },
    { nome: obitos?.norte === false ? "Óbitos certificados por dia (Portugal, SICO)" : "Óbitos por dia, Região Norte (eVM)", pts: obitos?.pontos ?? null },
    { nome: "Episódios de urgência, Região Norte", pts: norte?.episodios ?? null },
    { nome: "% urgências respiratórias, Região Norte", pts: norte?.pctRespiratoria ?? null },
  ];

  return (
    <>
      <a className="skip" href="#conteudo">Saltar para o conteúdo</a>
      <header className="masthead">
        <div className="wrap">
          <div>
            <div className="eyebrow">Saúde Pública · ULS Santo António</div>
            <h1>Workspace</h1>
            <p className="sub">Estudos com os dados de cada semana: escolha variáveis, compare-as no mesmo gráfico, veja as correlações e peça um comentário à IA.</p>
          </div>
        </div>
      </header>

      <Navegacao atual="/workspace" />

      <main id="conteudo" className="wrap">
        <Workspace publicos={publicos} />

        <details className="card dobra">
          <summary><h2 id="h-fontes">Fontes das séries públicas</h2></summary>
          <Fonte ids={["icaro", "friesa", "gripal", obitos?.norte === false ? "obitos" : "evm"]} />
        </details>
      </main>

      <footer>
        <div className="wrap">Os ficheiros da equipa são lidos só neste browser. A IA recebe apenas resumos agregados e o texto dela fica marcado «por validar».</div>
      </footer>
    </>
  );
}
