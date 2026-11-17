import type { Metadata } from "next";
import { fetchFriesaPorto, fetchIcaro, fetchIpmaAvisos, fetchNorte, fetchObitosDiarios, type Aviso } from "@/lib/sources";
import { Fonte } from "@/components/ui";
import { RelatoriosSemanais } from "@/components/relatorios";

export const metadata: Metadata = { title: "Relatórios · Saúde Sazonal ULSSA" };
// Mesmo ritmo da cache dos avisos IPMA (30 min).
export const revalidate = 1800;

const DIAS_HISTORICO = 400;
const orNull = <T,>(p: Promise<T>) => p.catch(() => null);

export default async function RelatoriosPage() {
  const now = new Date();
  // en-CA dá AAAA-MM-DD, no fuso de Lisboa.
  const hoje = now.toLocaleDateString("en-CA", { timeZone: "Europe/Lisbon" });
  const desde = new Date(now.getTime() - DIAS_HISTORICO * 864e5).toISOString().slice(0, 10);

  const [icaro, friesa, avisos, norte, obitos] = await Promise.all([
    orNull(fetchIcaro(desde)),
    orNull(fetchFriesaPorto(desde)),
    orNull(fetchIpmaAvisos().then((a): Aviso[] => a.filter((x) => x.distrito === "Porto"))),
    orNull(fetchNorte(desde)),
    orNull(fetchObitosDiarios(desde)),
  ]);
  const friesa65 = friesa?.mais65 ?? null;
  // Séries públicas diárias que o bloco «Relacionar variáveis» oferece ao lado dos registos semanais.
  const publicos = [
    { nome: "Índice ÍCARO", pts: icaro },
    { nome: "Índice FRIESA Porto (65+)", pts: friesa65 },
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
            <h1>Relatórios</h1>
            <p className="sub">Registo semanal para a DE-SNS (segunda a domingo), com texto para e-mail e tabela, e histórico para os relatórios intercalar e final.</p>
          </div>
        </div>
      </header>

      <nav className="toc" aria-label="Navegação">
        <div className="wrap">
          <ul>
            <li><a href="/">← Boletim</a></li>
            <li><a href="/painel">Painel</a></li>
            <li><a href="/analise">Vigilância</a></li>
            <li><a href="/alertas">Alertas</a></li>
          </ul>
        </div>
      </nav>

      <main id="conteudo" className="wrap">
        <RelatoriosSemanais hojeIso={hoje} icaro={icaro} friesa65={friesa65} avisos={avisos} publicos={publicos} />

        <details className="card dobra">
          <summary><h2 id="h-fontes">Fontes</h2></summary>
          <p className="hint">A sugestão usa os valores públicos da semana; a classificação e o texto final são da equipa.</p>
          <Fonte ids={["icaro", "friesa", "ipmaAvisos", "gripal", obitos?.norte === false ? "obitos" : "evm"]} />
        </details>
      </main>

      <footer>
        <div className="wrap">Ferramenta de apoio ao registo semanal. Os textos são revistos pela Equipa Local antes de seguirem para a DE-SNS.</div>
      </footer>
    </>
  );
}
