// Navegação das 3 páginas do site.
const PAGINAS = [
  ["/", "Boletim"],
  ["/relatorios", "Relatórios"],
  ["/workspace", "Workspace"],
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
      </div>
    </nav>
  );
}
