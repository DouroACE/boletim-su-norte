import type { Metadata } from "next";
import { fetchFriesaPorto, fetchIcaro, fetchIpmaAvisos, type Aviso } from "@/lib/sources";
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

  const [icaro, friesa65, avisos] = await Promise.all([
    orNull(fetchIcaro(desde)),
    orNull(fetchFriesaPorto(desde).then((r) => r.mais65)),
    orNull(fetchIpmaAvisos().then((a): Aviso[] => a.filter((x) => x.distrito === "Porto"))),
  ]);

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
        <RelatoriosSemanais hojeIso={hoje} icaro={icaro} friesa65={friesa65} avisos={avisos} />

        <section className="card" aria-labelledby="h-fontes">
          <h2 id="h-fontes">Fontes da sugestão de USP</h2>
          <p className="hint">A sugestão usa os valores públicos da semana; a classificação e o texto final são da equipa.</p>
          <Fonte ids={["icaro", "friesa", "ipmaAvisos"]} />
        </section>
      </main>

      <footer>
        <div className="wrap">Ferramenta de apoio ao registo semanal. Os textos são revistos pela Equipa Local antes de seguirem para a DE-SNS.</div>
      </footer>
    </>
  );
}
