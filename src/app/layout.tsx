import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/layout/AuthProvider";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
});

export const metadata: Metadata = {
  title: "Caída — El Juego de Cartas Venezolano",
  description:
    "Juega a la Caída online con amigos. Un juego de cartas tradicional venezolano con fichas virtuales.",
  keywords: ["caída", "juego de cartas", "venezolano", "online", "multijugador"],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={geist.variable}>
      <body className="min-h-screen bg-[#0d0d0d] text-white antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
