import type { Metadata } from "next";
import { fetchIcaro, fetchIpmaAvisos, type Aviso } from "@/lib/sources";
import { Navegacao } from "@/components/nav";
import { Comunicacao } from "@/components/comunicacao";
import { AlertasGerador } from "@/components/alertas";

export const metadata: Metadata = { title: "Comunicação · Saúde Sazonal ULSSA" };
export const revalidate = 1800;

const orNull = <T,>(p: Promise<T>) => p.catch(() => null);

export default async function ComunicacaoPage() {
  const desde = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);
  const [avisos, icaro] = await Promise.all([orNull(fetchIpmaAvisos()), orNull(fetchIcaro(desde))]);
  const porto: Aviso[] = (avisos ?? []).filter((a) => a.distrito === "Porto");
  // Contexto público que acompanha o boletim ou o estudo no pedido à IA.
  const avisosTexto = `Avisos IPMA em vigor no distrito do Porto: ${porto.length ? porto.map((a) => `${a.tipo} (${a.nivel})`).join("; ") : "nenhum amarelo, laranja ou vermelho"}.`;

  return (
    <>
      <a className="skip" href="#conteudo">Saltar para o conteúdo</a>
      <header className="masthead">
        <div className="wrap">
          <div>
            <div className="eyebrow">Saúde Pública · ULS Santo António</div>
            <h1>Comunicação</h1>
            <p className="sub">A partir do boletim da semana ou de um estudo guardado, gere rascunhos de comunicados à população, comunicados internos e estratégias de controlo.</p>
          </div>
        </div>
      </header>

      <Navegacao atual="/comunicacao" />

      <main id="conteudo" className="wrap">
        <Comunicacao avisos={avisosTexto} />

        <details className="card dobra">
          <summary><h2 id="h-alertas">Textos de alerta (procedimento da USP)</h2></summary>
          <p className="hint">Escolha um aviso do IPMA ou o boletim ÍCARO, ou indique os dados à mão. Os textos seguem as recomendações da DGS; reveja-os antes de enviar.</p>
          <AlertasGerador avisos={porto} icaro={icaro?.at(-1) ?? null} />
        </details>
      </main>

      <footer>
        <div className="wrap">Os rascunhos são gerados por IA a partir de dados agregados e ficam por validar pela Equipa Local de Saúde Sazonal e pela Autoridade de Saúde.</div>
      </footer>
    </>
  );
}
