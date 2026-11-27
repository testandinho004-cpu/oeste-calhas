import type { Metadata } from "next";
import MobileHome from "@/components/mobile/MobileHome";

export const metadata: Metadata = { title: "Oeste Calhas · Agende seu serviço" };

export default function MobilePage() {
  return <MobileHome />;
}
