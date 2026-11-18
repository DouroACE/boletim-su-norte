// Navegação do site: boletim → estudos → comunicação, e o relatório semanal para a DE-SNS.
import { Sessao } from "@/components/sessao";

const PAGINAS = [
  ["/", "Boletim"],
  ["/workspace", "Workspace"],
  ["/comunicacao", "Comunicação"],
  ["/relatorios", "Relatórios DE-SNS"],
] as const;

export function Navegacao({ atual, query = "" }: { atual: (typeof PAGINAS)[number][0]; query?: string }) {
  return (
    <nav className="toc" aria-label="Páginas do site">
      <div className="wrap">
        <ul>
          {PAGINAS.map(([href, nome]) => (
            <li key={href}>
              <a href={href === "/" ? `/${query}` : href} aria-current={href === atual ? "page" : undefined}>{nome}</a>
            </li>
          ))}
        </ul>
        <Sessao />
      </div>
    </nav>
  );
}
