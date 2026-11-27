/** Título da hero com quebras controladas: cada frase fica inteira na linha, nunca partida no meio. */
export default function HeroTitle({ className = "" }: { className?: string }) {
  return (
    <h1 className={`hero-title ${className}`.trim()}>
      <span className="ph">Calha nova,</span>{" "}
      <span className="ph">reparo ou limpeza?</span>
      <span className="ph ph-hl">Marque o dia.</span>
    </h1>
  );
}
