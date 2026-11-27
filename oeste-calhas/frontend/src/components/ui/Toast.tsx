"use client";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { IconAlert, IconCheck, IconInfo, IconX } from "./Icons";

type Kind = "success" | "error" | "info";
type T = { id: number; kind: Kind; title: string; text?: string };
type Api = { success: (title: string, text?: string) => void; error: (title: string, text?: string) => void; info: (title: string, text?: string) => void };
const Ctx = createContext<Api | null>(null);
const DURATION = 4800;

export const useToast = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("ToastProvider ausente");
  return c;
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<T[]>([]);
  const seq = useRef(0);
  const remove = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const push = useCallback((kind: Kind, title: string, text?: string) => {
    const id = ++seq.current;
    setItems((l) => [...l.slice(-3), { id, kind, title, text }]);
    setTimeout(() => remove(id), DURATION);
  }, [remove]);
  const api = useMemo<Api>(() => ({ success: (a, b) => push("success", a, b), error: (a, b) => push("error", a, b), info: (a, b) => push("info", a, b) }), [push]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toasts" aria-live="polite" aria-atomic="false">
        <AnimatePresence initial={false} mode="popLayout">
          {items.map((t) => (
            <motion.div
              key={t.id} layout role={t.kind === "error" ? "alert" : "status"} className={`toast ${t.kind}`}
              initial={{ opacity: 0, y: -16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 60, transition: { duration: 0.18 } }}
              drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.6} onDragEnd={(_, info) => { if (Math.abs(info.offset.x) > 80) remove(t.id); }}
            >
              <span className="toast-ic">{t.kind === "success" ? <IconCheck width={16} height={16} /> : t.kind === "error" ? <IconAlert width={16} height={16} /> : <IconInfo width={16} height={16} />}</span>
              <div><b>{t.title}</b>{t.text ? <p>{t.text}</p> : null}</div>
              <button className="toast-x" onClick={() => remove(t.id)} aria-label="Fechar aviso"><IconX width={16} height={16} /></button>
              <motion.i className="toast-bar" initial={{ scaleX: 1 }} animate={{ scaleX: 0 }} transition={{ duration: DURATION / 1000, ease: "linear" }} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}
