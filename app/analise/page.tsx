import type { Metadata } from "next";
import { Analise } from "@/components/analise";

export const metadata: Metadata = { title: "Análise de dados · Boletim de Vigilância Sazonal" };

export default function AnalisePage() {
  return (
    <>
      <a className="skip" href="#conteudo">Saltar para o conteúdo</a>
      <header className="masthead">
        <div className="wrap">
          <div>
            <div className="eyebrow">Saúde Pública · Região Norte</div>
            <h1>Análise de dados</h1>
            <p className="sub">Carregue ficheiros Excel ou CSV e explore séries, categorias e correlações. Os dados são processados no seu browser.</p>
          </div>
        </div>
      </header>

      <nav className="toc" aria-label="Navegação">
        <div className="wrap">
          <ul>
            <li><a href="/">← Boletim</a></li>
            <li><a href="/painel">Painel de risco</a></li>
          </ul>
        </div>
      </nav>

      <main id="conteudo" className="wrap">
        <Analise />
      </main>

      <footer>
        <div className="wrap">Ferramenta de exploração. Os resultados estatísticos não substituem a análise de quem conhece os dados; uma correlação não prova causa.</div>
      </footer>
    </>
  );
}
