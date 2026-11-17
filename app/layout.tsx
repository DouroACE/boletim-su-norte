import type { Metadata, Viewport } from "next";
import { Roboto } from "next/font/google";
import "./globals.css";

const font = Roboto({ subsets: ["latin"], weight: ["300", "400", "500", "700"], display: "swap", variable: "--font-roboto" });

export const metadata: Metadata = {
  title: "Boletim de Vigilância Sazonal · ULS Santo António",
  description:
    "Boletim vivo de vigilância sazonal da ULS Santo António (Gondomar e Porto Ocidental): urgências, ocupação hospitalar, consultas, temperatura, qualidade do ar e avisos do IPMA, com recolha automática de dados públicos.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#007D5A" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-PT" className={font.variable}>
      <body style={{ fontFamily: "var(--font-roboto), var(--font)" }}>{children}</body>
    </html>
  );
}
