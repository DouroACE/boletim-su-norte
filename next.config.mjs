/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  poweredByHeader: false,
  // Páginas que saíram na simplificação para 3 páginas: os links antigos continuam a funcionar.
  async redirects() {
    return [
      { source: "/painel", destination: "/", permanent: true },
      { source: "/alertas", destination: "/comunicacao", permanent: true },
      { source: "/flags-ia", destination: "/", permanent: true },
      { source: "/exportar", destination: "/", permanent: true },
      { source: "/analise", destination: "/workspace", permanent: true },
    ];
  },
};
