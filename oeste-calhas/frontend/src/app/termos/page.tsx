import type { Metadata } from "next";
import Header from "@/components/Header";

export const metadata: Metadata = {
  title: "Termos e serviços · Oeste Calhas",
  description: "Termos para solicitar e utilizar os serviços da Oeste Calhas.",
};

const whatsapp = process.env.NEXT_PUBLIC_WHATSAPP?.replace(/\D/g, "");

export default function TermsPage() {
  return (
    <>
      <Header />
      <main className="terms">
        <h1>Termos e serviços</h1>
        <p>Ao solicitar um agendamento pelo site, você concorda com as condições abaixo.</p>

        <h2>Solicitação e confirmação</h2>
        <p>O envio do formulário é uma solicitação, não uma confirmação automática do serviço. A equipe da Oeste Calhas entrará em contato para confirmar a disponibilidade e combinar os detalhes.</p>
        <p>Os horários disponíveis são de segunda-feira a sábado, das 8h às 17h. As solicitações devem ser feitas com pelo menos 12 horas de antecedência e para datas dentro dos próximos 30 dias.</p>

        <h2>Informações fornecidas</h2>
        <p>Informe dados corretos e mantenha seu telefone acessível para que a equipe possa responder. Você é responsável pelas informações de contato, endereço e descrição do serviço enviados no formulário.</p>

        <h2>Alterações e cancelamentos</h2>
        <p>Para alterar ou cancelar uma solicitação, entre em contato diretamente com a equipe. O horário só é liberado após o cancelamento ser processado.</p>

        <h2>Dados e autenticação</h2>
        <p>O login com Google é utilizado para identificar sua conta e permitir que consulte seus próprios agendamentos. Os dados enviados são usados para administrar a solicitação e entrar em contato sobre o serviço. Não envie informações que não sejam necessárias para o atendimento.</p>

        <h2>Cookies e armazenamento local</h2>
        <p>O site utiliza cookies essenciais de sessão e autenticação. Durante o login, o navegador pode armazenar temporariamente o rascunho do formulário para que você não precise preenchê-lo novamente. O aviso de cookies guarda sua confirmação neste navegador. Não utilizamos cookies de publicidade ou análise de navegação.</p>

        <h2>Contato</h2>
        <p>
          E-mail: <a href="mailto:oestecalhastestdedev@gmail.com">oestecalhastestdedev@gmail.com</a>
          {whatsapp ? <> · WhatsApp: <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer">fale com a equipe</a></> : null}
        </p>
        <p className="terms-note">A equipe poderá atualizar estes termos quando necessário. Consulte esta página para verificar a versão vigente.</p>
      </main>
      <footer className="site-foot">© {new Date().getFullYear()} Oeste Calhas · <a href="/">Início</a></footer>
    </>
  );
}
