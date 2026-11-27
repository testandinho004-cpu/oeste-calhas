"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import Button from "@/components/ui/Button";

const CONSENT_KEY = "oeste-calhas-cookie-notice";

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);
  useEffect(() => { setVisible(window.localStorage.getItem(CONSENT_KEY) !== "acknowledged"); }, []);
  function acknowledge() { window.localStorage.setItem(CONSENT_KEY, "acknowledged"); setVisible(false); }

  return (
    <AnimatePresence>
      {visible ? (
        <motion.aside className="cookie-banner" aria-label="Aviso sobre cookies" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 30 }} transition={{ delay: 0.6, type: "spring", damping: 26 }}>
          <p>
            Usamos cookies essenciais para manter sua sessão e permitir o login. O rascunho do agendamento pode ser guardado
            temporariamente no navegador durante a autenticação. Não usamos cookies de publicidade. Leia os <a href="/termos">termos e serviços</a>.
          </p>
          <Button variant="green" size="sm" onClick={acknowledge}>Entendi</Button>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
