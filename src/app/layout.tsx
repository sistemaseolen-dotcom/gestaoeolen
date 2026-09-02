import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Controle Eolen",
  description: "Pessoas, Equipes e Treinamentos de Segurança",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
