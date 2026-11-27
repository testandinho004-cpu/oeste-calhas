"use client";
import { useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { motion } from "motion/react";
import Header from "@/components/Header";
import Wizard from "@/components/booking/Wizard";
import MyBookings from "@/components/booking/MyBookings";
import GutterArt from "@/components/booking/GutterArt";
import HeroTitle from "@/components/booking/HeroTitle";
import Button from "@/components/ui/Button";
import Tooltip from "@/components/ui/Tooltip";
import Skeleton from "@/components/ui/Skeleton";
import { IconCalendar, IconChat, IconClock, IconGoogle, IconLogout, IconLock } from "@/components/ui/Icons";

const WHATS = (process.env.NEXT_PUBLIC_WHATSAPP ?? "").replace(/\D/g, "");

export default function Home() {
  const { data: session, status } = useSession();
  const [version, setVersion] = useState(0);
  const first = session?.user?.name?.split(" ")[0] ?? "";

  return (
    <>
      <Header>
        {status === "loading" ? <Skeleton w={96} h={38} r={10} /> : status === "authenticated" ? (
          <div className="who">
            <span className="avatar" aria-hidden="true">{first.charAt(0).toUpperCase() || "?"}</span>
            <span className="nm">{first}</span>
            <Tooltip content="Sair da conta" side="bottom"><Button variant="ghost" size="icon" aria-label="Sair da conta" onClick={() => signOut()}><IconLogout /></Button></Tooltip>
          </div>
        ) : <Button variant="ghost" size="sm" onClick={() => signIn("google")}><IconGoogle width={18} height={18} /> Entrar</Button>}
      </Header>

      <main>
        <div className="hero">
          <div className="hero-left">
            <motion.section className="intro" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: "easeOut" }}>
              <HeroTitle />
              <p>Escolha a data e o horário, diga onde e o que precisa. A equipe da Oeste Calhas confirma com você.</p>
              <ul className="perks">
                <li><span className="perk-ic"><IconCalendar /></span><div><strong>Horários atualizados pela equipe</strong><span>Você só vê o que está realmente livre.</span></div></li>
                <li><span className="perk-ic"><IconClock /></span><div><strong>Até 3 agendamentos em aberto</strong><span>Por conta, para todo mundo ter vez.</span></div></li>
                <li><span className="perk-ic"><IconLock /></span><div><strong>Login seguro com Google</strong><span>Só você vê os seus agendamentos.</span></div></li>
                {WHATS && <li><span className="perk-ic"><IconChat /></span><div><strong>Alterar ou cancelar?</strong><span><a href={`https://wa.me/${WHATS}`} target="_blank" rel="noopener noreferrer" style={{ color: "var(--green-text)", fontWeight: 700 }}>Fale com a gente no WhatsApp</a></span></div></li>}
              </ul>
              <GutterArt />
            </motion.section>
            <MyBookings version={version} />
          </div>
          {/* acompanha a rolagem até o fim de "Meus agendamentos" e espera ali até o usuário subir */}
          <motion.div className="hero-sticky" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.08, ease: "easeOut" }}>
            <Wizard onCreated={() => setVersion((v) => v + 1)} />
          </motion.div>
        </div>
      </main>

      {WHATS && <Tooltip content="Falar no WhatsApp" side="top"><a className="fab" href={`https://wa.me/${WHATS}`} target="_blank" rel="noopener noreferrer" aria-label="Falar com a equipe no WhatsApp"><IconChat width={26} height={26} /></a></Tooltip>}
      <footer className="site-foot">© {new Date().getFullYear()} Oeste Calhas · <a href="/termos">Termos e serviços</a> · <a href="/?view=mobile">Versão para celular</a></footer>
    </>
  );
}
