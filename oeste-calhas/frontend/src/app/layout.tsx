import type { Metadata } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import Providers from "@/components/Providers";
import CookieBanner from "@/components/CookieBanner";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display", weight: ["600", "800"] });
const body = Figtree({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "Oeste Calhas · Agende seu serviço",
  description: "Agende instalação, manutenção e reparo de calhas em poucos cliques.",
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${body.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: "try{if(location.pathname.indexOf('/admin')===0&&localStorage.getItem('oc-admin-theme')==='dark')document.documentElement.dataset.theme='dark'}catch(e){}" }} /></head>
      <body><Providers>{children}<CookieBanner /></Providers></body>
    </html>
  );
}
