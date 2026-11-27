"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import Header from "@/components/Header";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { IconLock } from "@/components/ui/Icons";

export default function AdminLogin() {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const router = useRouter();
  const toast = useToast();
  const pin = digits.join("");

  async function submit(value = pin) {
    if (!/^\d{6}$/.test(value) || busy) return;
    setBusy(true);
    const r = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: value }) }).catch(() => null);
    if (r?.ok) { toast.success("Bem-vindo de volta!"); router.replace("/admin"); return; }
    const d = await r?.json().catch(() => ({}));
    setBusy(false); setShake((n) => n + 1); setDigits(Array(6).fill(""));
    toast.error(r?.status === 429 ? "Muitas tentativas" : "Não foi possível entrar", d?.error ?? "Verifique sua conexão.");
    refs.current[0]?.focus();
  }

  function fill(from: number, raw: string) {
    const nums = raw.replace(/\D/g, "").slice(0, 6 - from).split("");
    if (!nums.length) return;
    const next = [...digits];
    nums.forEach((n, i) => { next[from + i] = n; });
    setDigits(next);
    const at = Math.min(from + nums.length, 5);
    refs.current[at]?.focus();
    if (next.every(Boolean)) void submit(next.join(""));
  }

  return (
    <>
      <Header admin />
      <main className="otp-wrap">
        <motion.form className="card otp-card" onSubmit={(e) => { e.preventDefault(); void submit(); }} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="otp-lock"><IconLock width={26} height={26} /></div>
          <h1 style={{ fontSize: "1.6rem" }}>Painel da equipe</h1>
          <p className="muted" style={{ marginTop: 6 }}>Digite o PIN de 6 dígitos para entrar.</p>
          <motion.div className="otp" key={shake} animate={shake ? { x: [0, -10, 10, -8, 8, 0] } : undefined} transition={{ duration: 0.4 }} role="group" aria-label="PIN de 6 dígitos">
            {digits.map((d, i) => (
              <input
                key={i} ref={(el) => { refs.current[i] = el; }} type="password" inputMode="numeric" autoComplete="off" maxLength={1}
                autoFocus={i === 0} value={d} aria-label={`Dígito ${i + 1}`} disabled={busy}
                onChange={(e) => fill(i, e.target.value)}
                onPaste={(e) => { e.preventDefault(); fill(i, e.clipboardData.getData("text")); }}
                onKeyDown={(e) => {
                  if (e.key === "Backspace") { e.preventDefault(); const n = [...digits]; if (n[i]) n[i] = ""; else if (i > 0) { n[i - 1] = ""; refs.current[i - 1]?.focus(); } setDigits(n); }
                  if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
                  if (e.key === "ArrowRight" && i < 5) refs.current[i + 1]?.focus();
                }}
                onFocus={(e) => e.currentTarget.select()}
              />
            ))}
          </motion.div>
          <Button type="submit" full loading={busy} disabled={pin.length !== 6}>Entrar</Button>
        </motion.form>
      </main>
    </>
  );
}
