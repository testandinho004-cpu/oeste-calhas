# Oeste Calhas · Agendamento

Aplicação separada em dois projetos independentes:

- `frontend/`: Next.js 14, interface pública e painel administrativo.
- `backend/`: Next.js 14, API, autenticação Google, Prisma e banco de dados.

## Instalação

1. `npm run install:all`
2. Copie `backend/.env.example` para `backend/.env` e preencha as variáveis.
3. Copie `frontend/.env.example` para `frontend/.env.local`.
4. `npm run hash-pin -- 123456`
5. Para banco novo: `npm run db:push`
6. Para banco existente: faça backup e execute `npm run db:ensure-settings --prefix backend`

## Executar

`npm run dev`

- Frontend: http://localhost:3000
- Painel: http://localhost:3000/admin
- Backend: http://localhost:3001

O frontend encaminha todas as rotas `/api/*` para o backend. Em produção, configure `BACKEND_URL` e `FRONTEND_URL` nas respectivas aplicações.

## Painel administrativo — implementação atual

O painel existente foi expandido sem substituir a autenticação administrativa por PIN. As áreas atualmente funcionais são:

- Visão geral com contagens reais, próximos atendimentos, pendências, cancelamentos recentes e filtro por período.
- Agendamentos com pesquisa, filtros, paginação, visualização em lista/calendário, criação manual, detalhes, edição, observações internas, reagendamento e transições de status.
- Clientes com pesquisa, paginação, perfil, histórico de agendamentos, edição de dados e observações internas.
- Logs de atividade com filtros por usuário, ação, entidade e intervalo de datas.

Rotas administrativas implementadas:

- `GET /api/admin/overview`
- `GET, POST /api/admin/bookings`
- `GET, PATCH /api/admin/bookings/:id`
- `GET, POST /api/admin/customers`
- `GET, PATCH /api/admin/customers/:id`
- `GET, PUT /api/admin/availability`
- `GET, POST, DELETE /api/admin/availability/exceptions`
- `POST /api/admin/availability/calendar` (abre as vagas de um mês e permite marcar dias fechados)
- `GET /api/admin/audit`
- `GET /api/admin/reports`
- `GET /api/admin/reports?format=csv&preset=...`
- `GET, PUT /api/admin/settings`
- `GET /api/company-settings`
- `GET /api/slots?date=AAAA-MM-DD` (horários calculados para um dia)
- `GET /api/slots?month=AAAA-MM` (horários livres agrupados por data no mês)
- `PATCH /api/bookings/:id` (cancelamento ou reagendamento pelo próprio cliente autenticado)

O fluxo de status preserva `PENDING`, `CONFIRMED`, `DONE` e `CANCELLED`; também suporta `IN_PROGRESS` e `NO_SHOW`. Cancelar exige motivo, transições são validadas no backend e o índice único de horário continua impedindo duas reservas concorrentes no mesmo slot.

Disponibilidade é configurada por mês, sem repetição semanal. No primeiro acesso, nenhuma data fica aberta por padrão; ao abrir um mês, os dias futuros recebem horários das 08:00 às 16:00, exceto os dias marcados como fechados. Cada data permite remover horários individualmente. Somente datas explicitamente abertas aparecem para reserva, inclusive em meses futuros; alterações que afetariam agendamentos existentes exigem confirmação e não os cancelam silenciosamente.

Após o primeiro agendamento, o nome do perfil do cliente é preservado e não pode ser alterado pelo próprio cliente; a equipe pode corrigi-lo no dashboard. O telefone fica pré-preenchido nos próximos agendamentos, pode ser atualizado pelo cliente e é validado e formatado conforme o país. A seleção pública prioriza países das Américas, mantendo disponível o país de números legados já cadastrados.

O catálogo de serviços, o cadastro de profissionais/equipe e o sistema de notificações foram descontinuados e removidos das interfaces, APIs e planejamento ativo. Os agendamentos continuam descrevendo o atendimento por texto no campo de descrição.

As configurações gerais da empresa têm uma única fonte no banco SQLite, por meio da tabela `CompanySettings`. A página de configurações permite escolher tema claro ou escuro. Dados públicos básicos continuam disponíveis por uma rota somente-leitura.

### Aplicação do schema e associação de clientes existentes

Antes de atualizar um banco já utilizado, faça uma cópia de segurança do arquivo SQLite. Em seguida, aplique o schema e execute o backfill idempotente:

```powershell
npm run db:push
npm run db:backfill-customers --prefix backend
npm run db:ensure-settings --prefix backend
npm test
```

O backfill associa os registros existentes a perfis de cliente sem apagar agendamentos. Verifique a saída do comando e a integridade do banco antes de publicar a atualização.

### Fases e limitações conhecidas

- **Fase 1 — implementada:** visão geral, agendamentos, clientes, calendário e operações individuais estão disponíveis.
- **Fase 2 — implementada:** abertura mensal de vagas, bloqueios por data, ajustes de horários, antecedência mínima, cutoff de cancelamento e prevenção de conflitos estão conectados ao backend.
- **Fase 3 — implementada:** auditoria administrativa e configurações gerais da empresa estão disponíveis. Permissões por usuário ainda não existem; o acesso continua baseado em PIN administrativo compartilhado. Notificações internas, equipe/profissionais e catálogo de serviços foram descontinuados.
- **Fase 4 — implementada:** relatórios por período, indicadores reais, distribuição por status, demanda por dia e horário e exportação CSV estão disponíveis.
- Equipe/profissionais não foi modelada: o negócio atual ainda não confirmou necessidade de múltiplas agendas.
