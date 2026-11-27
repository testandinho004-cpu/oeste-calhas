"use client";
import { useEffect, useState } from "react";
import { motion, useReducedMotion, useScroll, useSpring } from "motion/react";

export const ADMIN_THEME_KEY = "oc-admin-theme";

/**
 * Cabeçalho compartilhado.
 * - `admin`: aplica o tema (claro/escuro) escolhido em Configurações. Só o painel usa o tema.
 * - público (padrão): sempre claro, independente do que o admin escolheu.
 * - `scrollFx`: encolhe o cabeçalho ao rolar e mostra a barra de progresso (versão mobile).
 */
export default function Header({ children, admin = false, scrollFx = false }: { children?: React.ReactNode; admin?: boolean; scrollFx?: boolean }) {
  const [brand, setBrand] = useState({ name: "Oeste Calhas", logoUrl: "/logo.png" });
  const [scrolled, setScrolled] = useState(false);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 28, mass: 0.4 });

  useEffect(() => {
    const root = document.documentElement;
    if (admin) {
      const saved = localStorage.getItem(ADMIN_THEME_KEY);
      root.dataset.theme = saved === "dark" ? "dark" : "light";
    } else {
      // área pública nunca herda o tema do painel
      root.dataset.theme = "light";
      try { localStorage.removeItem("oc-theme"); } catch {}
    }
    let alive = true;
    fetch("/api/company-settings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive || !data?.settings) return;
        setBrand({ name: data.settings.name, logoUrl: data.settings.logoUrl || "/logo.png" });
        if (admin) {
          const theme = data.settings.theme === "dark" ? "dark" : "light";
          localStorage.setItem(ADMIN_THEME_KEY, theme);
          root.dataset.theme = theme;
        }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [admin]);

  useEffect(() => {
    if (!scrollFx) return;
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [scrollFx]);

  return (
    <header className={`hdr${scrollFx ? " hdr-fx" : ""}${scrolled ? " is-scrolled" : ""}`}>
      <div className="hdr-in">
        <a className="brand" href="/" aria-label={`${brand.name}, página inicial`}>
          <span className="logo"><img src={brand.logoUrl} alt="" width={90} height={28} /></span>
          <b>{brand.name}</b>
        </a>
        <div className="hdr-right">{children}</div>
      </div>
      {scrollFx && !reduce && <motion.i className="hdr-progress" aria-hidden="true" style={{ scaleX: progress }} />}
    </header>
  );
}
