import type { Metadata } from "next";
import { fetchIcaro, fetchIpmaAvisos, type Aviso, type Point } from "@/lib/sources";
import { Chip, Fonte, fmtDate } from "@/components/ui";
import { AlertasGerador } from "@/components/alertas";
import { nivelDeAviso } from "@/lib/alertas";
import s from "./alertas.module.css";

export const metadata: Metadata = { title: "Alertas · Saúde Sazonal USP Gondomar" };
// Mesmo ritmo da cache dos avisos IPMA (30 min).
export const revalidate = 1800;

const DIAS_ICARO = 14;
const orNull = <T,>(p: Promise<T>) => p.catch(() => null);
const CHIP: Record<string, { level: "atencao" | "alerta"; label: string }> = {
  yellow: { level: "atencao", label: "Amarelo" },
  orange: { level: "alerta", label: "Laranja" },
  red: { level: "alerta", label: "Vermelho" },
};
const dataHora = (iso: string) => fmtDate(iso, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function AlertasPage() {
  const now = new Date();
  const desde = new Date(now.getTime() - DIAS_ICARO * 864e5).toISOString().slice(0, 10);
  const [avisos, icaro] = await Promise.all([orNull(fetchIpmaAvisos()), orNull(fetchIcaro(desde))]);
  const porto: Aviso[] = (avisos ?? []).filter((a) => a.distrito === "Porto");
  const ultimo: Point | null = icaro?.at(-1) ?? null;

  return (
    <>
      <a className="skip" href="#conteudo">Saltar para o conteúdo</a>
      <header className="masthead">
        <div className="wrap">
          <div>
            <div className="eyebrow">Saúde Pública · ULS Santo António</div>
            <h1>Alertas</h1>
            <p className="sub">Avisos ativos para o distrito do Porto (Gondomar e Porto Ocidental) e textos prontos a enviar às instituições parceiras.</p>
          </div>
          <div className="meta">
            <span>Gerado a <strong>{now.toLocaleString("pt-PT", { timeZone: "Europe/Lisbon", dateStyle: "long", timeStyle: "short" })}</strong></span>
          </div>
        </div>
      </header>

      <nav className="toc" aria-label="Navegação">
        <div className="wrap">
          <ul>
            <li><a href="/">← Boletim</a></li>
            <li><a href="/painel">Painel</a></li>
            <li><a href="/analise">Vigilância</a></li>
          </ul>
        </div>
      </nav>

      <main id="conteudo" className="wrap">
        <section aria-labelledby="h-avisos" className="grid g-2">
          <article className="card">
            <h2 id="h-avisos">Avisos ativos · distrito do Porto</h2>
            {avisos === null ? (
              <p className="hint">Fonte indisponível neste momento.</p>
            ) : porto.length ? (
              <ul className={s.avisos}>
                {porto.map((a) => (
                  <li key={`${a.tipo}-${a.inicio}`} className={s.aviso}>
                    <Chip level={CHIP[a.nivel]?.level ?? "atencao"} label={CHIP[a.nivel]?.label} />
                    <span className={s.avisoTipo}>{a.tipo}</span>
                    <span className={s.avisoDatas}>{dataHora(a.inicio)} a {dataHora(a.fim)}</span>
                    {!nivelDeAviso(a.nivel) && <span className="hint">Nível não reconhecido</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={s.vazio}>Sem avisos amarelo, laranja ou vermelho para o distrito do Porto.</p>
            )}
            <Fonte ids={["ipmaAvisos"]} />
          </article>

          <article className="card">
            <h2>Boletim ÍCARO · último valor</h2>
            {ultimo ? (
              <>
                <p className="hint">Índice ÍCARO de {fmtDate(ultimo.date)}. Só se envia se houver efeito significativo na mortalidade, o que se confirma no gerador abaixo.</p>
                <p><strong className="num">{ultimo.value.toLocaleString("pt-PT", { maximumFractionDigits: 2 })}</strong></p>
              </>
            ) : (
              <p className="hint">Fonte indisponível neste momento.</p>
            )}
            <Fonte ids={["icaro"]} />
          </article>
        </section>

        <section aria-labelledby="h-gerador" className="card" style={{ marginTop: 20 }}>
          <h2 id="h-gerador">Gerar textos do alerta</h2>
          <p className="hint">Escolha um aviso ou o boletim ÍCARO, ou indique os dados manualmente. Os textos seguem as recomendações da DGS; revja-os antes de enviar.</p>
          <AlertasGerador avisos={porto} icaro={ultimo} />
        </section>
      </main>

      <footer>
        <div className="wrap">Ferramenta de apoio ao procedimento de alertas. Não substitui a decisão da Equipa Local de Saúde Sazonal nem da Autoridade de Saúde.</div>
      </footer>
    </>
  );
}
