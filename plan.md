# Plano AGROLINK

## Direção de implementação

O AGROLINK é uma aplicação Web React + Express + tRPC + Drizzle sobre PostgreSQL (Supabase), com autenticação local por e-mail e senha e cookie de sessão assinado no servidor. A entrega atual prioriza o núcleo que torna o produto útil desde o primeiro acesso: landing page pública, painel autenticado, **Base AGROLINK central incluída conforme assinatura/permissão**, contatos particulares persistentes, importador compatível com o modelo `name/phone/whatsapp/email/address/tags/notes`, telefones com WhatsApp pretendido, pesquisa/filtros, revisão de pendências, modelos de mensagem, dashboard, CRM leve, configurações e limites de plano claramente identificados.

A autenticação é local (e-mail e senha com hash `scrypt`), com sessão em cookie JWT HS256, validação no servidor e permissões por organização. Cada consulta e mutação tem `organizationId` derivado da sessão/membro, nunca confiado no navegador. O banco tem tabelas de organizações, membros, contatos, telefones, categorias, etiquetas, modelos, importações, linhas de importação, atividades, tarefas, oportunidades, assinaturas e auditoria. Arquivos originais ficam privados e serão indexados no banco quando a rota de upload estiver habilitada; a importação local também aceita o arquivo no navegador para gerar prévia sem enviar dados a terceiros.

O parsing do modelo conhecido será determinístico e seguro. Os cabeçalhos serão normalizados por caixa, espaços e aliases em português. `phone` será sempre aproveitado como telefone e WhatsApp quando a opção padrão estiver ativa; `whatsapp` vazio não bloqueará o cadastro. Valores `sim/true/1` no campo WhatsApp serão tratados como intenção, nunca como número. Telefones serão armazenados como texto com valor original, normalização, país, DDD, estado e preferência. Números sem DDD serão preservados, classificados como incompletos e encaminhados à revisão; nunca serão corrigidos por inferência. A mesma separação é aplicada ao catálogo: registros centrais, telefones centrais, lote administrativo e vínculo privado por organização são tabelas distintas.

O processamento de importação será idempotente por lote e por linha, com validação de extensão/tamanho, detecção de duplicados como sinal (sem mescla automática por telefone compartilhado), contagens separadas e status de revisão. A experiência de lote grande usará processamento assíncrono no servidor quando o arquivo for enviado; a UI exibirá estados reais do job e manterá o relatório após atualização. O primeiro fluxo no navegador terá prévia, mapeamento automático e importação em lotes pequenos para permitir validar a compatibilidade do arquivo antes de confirmar. A importação administrativa do catálogo entra como pendente, passa por conferência e só depois é publicada para organizações autorizadas.

## Design

### Alternativas consideradas

- **Editorial rural contemporâneo** — 0,07: camadas claras, tipografia serifada e imagens de campo; expressivo, mas menos eficiente para operação diária.
- **Industrial utilitário** — 0,06: alto contraste e densidade de tabela; eficiente, porém frio demais para relacionamento comercial.
- **Campo conectado** — 0,87: dashboard de operação com verde profundo, superfícies marfim, dourado de precisão e sinais de rede/território; escolhido.

### Movimento de design

**Campo conectado**, uma mistura de editorial de negócios rurais e painel operacional B2B. A interface deve parecer confiável para uma equipe comercial que lida com milhares de registros, sem perder o vínculo com o território e a proximidade humana.

### Princípios

1. **Clareza operacional:** cada tela responde o que aconteceu, o que exige revisão e qual é a próxima ação.
2. **Densidade confortável:** tabelas e cards informativos, mas com respiro, hierarquia e agrupamento visual.
3. **Confiança no dado:** origem, pendência e limites aparecem próximos do dado; nada de porcentagem ou promessa simulada.
4. **Ação contextual:** WhatsApp, revisão e acompanhamento ficam junto do contato, sem atalhos destrutivos escondidos.

### Cor e layout

- Verde principal próprio: `#0F3D2E`, evocando mata, estabilidade e confiança.
- Verde vivo de ação: `#1F7A57`; dourado `#D3A64A` apenas para destaque e status, não para texto longo.
- Superfícies: marfim `#F7F8F4`, branco quente e grafite esverdeado no modo escuro.
- Desktop com rail lateral escuro, barra superior fina e conteúdo em colunas assimétricas; evitar o dashboard genérico totalmente centralizado.
- Cards têm cantos moderados, borda fina e sombra mínima. Indicadores principais usam uma linha de acento dourado ou verde, nunca gradientes chamativos.

### Elementos de assinatura e interação

- Marca: elo formado por duas folhas/elos arredondados, sugerindo conexão, cadeia e agro.
- Etiquetas em formato de cápsula com cores semânticas; pendências de telefone têm ícone e texto explícito.
- Botão WhatsApp usa verde apenas quando há destino válido; números incompletos exibem **Completar número**.
- Animação curta de entrada e progresso indeterminado apenas durante espera real; evitar movimento decorativo.
- Foco visível, atalhos de teclado e estados vazios com ação próxima.

### Tipografia e voz

- `DM Sans` para interface, `Fraunces` em títulos de landing page e destaques de marca; fallback local sem dependência de rede.
- Títulos curtos e firmes; CTAs concretos: “Importar contatos”, “Revisar pendências”, “Abrir no WhatsApp”.
- Voz: profissional, próxima e direta. Exemplos: “Seus contatos do agro, no ritmo da operação.” / “Nenhum número incompleto se perde — ele vai para revisão.”

### Essência e marca

Posicionamento: **o CRM de relacionamento para equipes que transformam contatos do agro em próximas conversas.** Personalidade: confiável, prática, conectada. O wordmark usa o símbolo de dois elos-folhas à esquerda do nome AGROLINK, com o detalhe dourado reservado ao ponto de conexão.

## Estrutura do projeto

- `client/src/pages/` — landing, autenticação/painel, contatos, importação, CRM, modelos e configurações.
- `client/src/components/` — shell responsivo, cards, tabelas, modais e estados de carregamento/vazio/erro.
- `client/src/lib/` — cliente tRPC, normalização de telefones, interpolação de mensagens e parsing da prévia.
- `server/routers.ts` — procedimentos protegidos por domínio e regras de permissão.
- `server/db.ts` — queries com escopo de organização, paginação e transações de importação particular.
- `server/catalog.ts` — catálogo central, acesso por assinatura, favoritos/anotações privados e importação/publicação administrativa.
- `server/actions.ts` — mutações de contatos particulares, modelos de mensagem e configurações da organização.
- `server/import/` — aliases, parser XLSX/CSV, normalização de telefone/endereço e detecção de duplicados.
- `drizzle/schema.ts` e `drizzle/migrations/` — modelo persistente e migrações aditivas.
- `client/public/routes.json`, `client/public/robots.txt` e metadata — rotas públicas e proteção de páginas autenticadas.
- `app.config.ts` — metadata do logotipo e identidade do projeto.

## Build e entrega

1. Registrar diagnósticos TypeScript e completar o plano/TODO.
2. Implementar schema, queries e routers com autorização por organização.
3. Implementar shell e landing, depois contatos/importação e os módulos complementares.
4. Rodar migrações, `pnpm check`, testes de parser/normalização e build.
5. Iniciar o servidor de Preview na porta configurada, validar `/api/health` e `/routes.json`, revisar telas em desktop/mobile.
6. Salvar checkpoint no repositório canônico; publicar apenas quando o fluxo de publicação estiver configurado e confirmado pelo projeto.

## Pendências explícitas

- Credenciais/conta Stripe e preços reais são configuração externa: a aplicação exibirá planos com valores configuráveis e estado pendente até a integração ser habilitada.
- Verificação de e-mail, recuperação de senha e convites dependem de um serviço de e-mail transacional ainda não configurado; não serão simulados como concluídos. O acesso por convite já funciona: o administrador cria o usuário e o primeiro cadastro com o mesmo e-mail assume a conta.
- O arquivo pessoal `produtores_formatado(1).xlsx` não foi incluído nesta sessão; o parser é compatível por contrato e a importação real acontecerá quando a organização enviar o arquivo.
- A carga real da Base AGROLINK não foi incluída nesta sessão; o catálogo central tem fluxo administrativo de importação, conferência e publicação, e a demonstração usa apenas registros fictícios.
- Textos de termos e privacidade serão rascunhos informativos, aguardando revisão jurídica.
