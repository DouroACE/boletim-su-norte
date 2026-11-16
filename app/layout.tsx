import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible } from "next/font/google";
import "./globals.css";

const font = Atkinson_Hyperlegible({ subsets: ["latin"], weight: ["400", "700"], display: "swap", variable: "--font-atk" });

export const metadata: Metadata = {
  title: "Boletim de Vigilância Sazonal · Urgência · Região Norte",
  description:
    "Boletim vivo de vigilância sazonal: afluência às urgências, infeções respiratórias, temperatura e avisos do IPMA na Região Norte, com recolha automática de dados públicos.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0b5cad" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-PT" className={font.variable}>
      <body style={{ fontFamily: "var(--font-atk), var(--font)" }}>{children}</body>
    </html>
  );
}
