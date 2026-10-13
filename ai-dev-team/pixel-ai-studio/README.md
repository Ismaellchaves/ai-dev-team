# PIXEL AI STUDIO

Aplicação local para organizar projetos, tarefas, agentes e execuções reais pelo Codex CLI. O painel funciona sem provedor de IA; executar uma tarefa exige Codex CLI autenticado. O processo fica limitado ao diretório `workspaces/` desta instalação e o servidor só escuta em loopback.

## Requisitos e início

- Windows 10/11 ou sistema compatível com Node.js 22.5 ou posterior. A versão verificada nesta máquina foi Node 24.21.0.
- Codex CLI é opcional para abrir o painel e obrigatório para executar agentes. Configure o login do Codex no próprio ambiente e, se necessário, `PIXEL_CODEX_PATH` em `.env`.
- Não há dependências npm externas. SQLite usa `node:sqlite`.

```powershell
cd .\ai-dev-team\pixel-ai-studio
Copy-Item .env.example .env
npm start
```

Abra o endereço informado no terminal (padrão `http://127.0.0.1:8787`). O aplicativo não escolhe outra porta automaticamente: informa erro claro quando a solicitada já está ocupada.

## Publicar a interface no Vercel e manter o Codex no servidor

O Vercel hospeda a interface e encaminha as chamadas para uma instalação persistente deste servidor. **Não configure o Vercel para iniciar `src/server.mjs`**: ele usa SQLite e arquivos locais e executa o Codex CLI. O backend precisa rodar continuamente num computador ou servidor que mantenha Node.js, Codex CLI autenticado, `data/` e `workspaces/`; disponibilize-o por HTTPS usando um endereço público protegido (por exemplo, um túnel privado com controle de acesso ou um servidor com proxy TLS). Não exponha a porta do Node diretamente à internet.

### Vercel

1. Envie esta pasta do PIXEL AI STUDIO ao repositório GitHub e importe o repositório no Vercel.
2. Em **Root Directory**, selecione a pasta que contém este `package.json` (nesta cópia do workspace, `ai-dev-team/pixel-ai-studio`). Use o comando de build `npm run build:vercel` e a pasta de saída `dist`. O arquivo `vercel.json` já configura esses valores e o proxy das prévias.
3. Em **Settings → Environment Variables**, configure todas as variáveis abaixo em Production (e em Preview se usar URLs de prévia):
   - `PIXEL_BACKEND_URL`: endereço HTTPS público do backend, sem caminho final, por exemplo `https://pixel-api.seudominio.com`.
   - `PIXEL_BACKEND_TOKEN`: o mesmo token `PIXEL_API_TOKEN` configurado no servidor persistente.
   - `PIXEL_SITE_USER`: usuário para abrir o painel (opcional; padrão `pixel`).
   - `PIXEL_SITE_PASSWORD`: senha longa e exclusiva para proteger o painel. Sem ela o middleware bloqueia a publicação com HTTP 503. O `.env` local não é enviado à Vercel pelo GitHub.
4. Salve as variáveis e faça um novo Deploy (Deployments → menu do deploy → Redeploy, ou envie um novo commit). O painel solicitará usuário e senha HTTP Basic ao abrir. Se o erro persistir, confira se a variável foi criada no projeto e ambiente corretos e se o redeploy terminou após a alteração.

Gere um token compartilhado com pelo menos 32 caracteres em um terminal seguro, por exemplo:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Copie o resultado para `PIXEL_API_TOKEN` no servidor e para `PIXEL_BACKEND_TOKEN` no Vercel. Não o coloque neste repositório, em `public/` ou no código do navegador. No servidor, defina também `NODE_ENV=production` e use a porta fornecida pelo serviço (`PORT`). O servidor falha ao iniciar em produção se o token não estiver configurado. Se o backend estiver no mesmo computador que o túnel HTTPS, mantenha `PIXEL_HOST=127.0.0.1`; use `0.0.0.0` somente quando o provedor do servidor exigir escuta dentro do container. O túnel deve encaminhar para `http://127.0.0.1:8787` quando a porta local for 8787.

As imagens de referência têm limite de 2,5 MB cada neste fluxo, para caber nos limites de payload do middleware e das funções do Vercel. Os downloads `.zip` usam links HMAC temporários e são servidos pelo backend persistente, sem passar o arquivo pelo limite de resposta do Vercel.

O deploy precisa que o endereço HTTPS do backend seja acessível pelo Vercel. Se hospedar o backend no seu próprio computador, ele precisa permanecer ligado e conectado; o endereço do túnel também deve permanecer estável. O Vercel não armazena os bancos nem as pastas de projeto do backend.

No Windows, inicie o painel na mesma conta que autenticou o Codex. Se o próprio servidor for iniciado dentro de outra sandbox restrita, o CLI pode validar o login e ainda assim falhar ao gravar seus arquivos de estado em `%USERPROFILE%\.codex` (por exemplo, erros `Acesso negado`, `PATH aliases` ou banco de estado). Nesse caso, abra o PowerShell normal do Windows, fora da sandbox, e execute `npm start`. Os comandos que os agentes executam continuam limitados ao workspace do projeto pelo sandbox `workspace-write` do Codex.

## Fluxo

### Painel empresarial

Na visão geral, o formulário **O que você quer realizar?** cria uma missão e abre o plano com a equipe sugerida pelo tipo do pedido. O plano continua aguardando sua aprovação antes de executar qualquer agente. Os indicadores e cartões de departamento usam os projetos, tarefas, agentes e escritórios realmente registrados no SQLite; tarefas com falha e tarefas aguardando execução aparecem na central de atenção. A navegação está agrupada por empresa, equipes e acompanhamento.

O aplicativo inclui departamentos de prospecção e inteligência comercial, além dos demais escritórios empresariais. O mapa usa Leaflet e tiles OpenStreetMap; as pesquisas usam o provedor selecionado no backend, sem exigir chave paga.

1. Crie um projeto: ele ganha uma pasta isolada em `workspaces/`.
2. Envie uma solicitação ao CEO e confira o plano gerado.
3. Confirme o plano para persistir suas tarefas.
4. Ao aprovar, o time executa as tarefas em sequência; para um plano já aprovado, reabra o projeto e aprove de novo para retomar. A aplicação usa `codex exec --json --sandbox workspace-write` e restringe o acesso ao workspace.
5. Consulte saídas e resultados no quadro e no painel.

O painel tem uma página **Escritório** com os 12 perfis em pixel art. Os indicadores e as falas refletem as tarefas e as mensagens recebidas do Codex; a atualização acontece a cada quatro segundos. Ao aprovar um plano, a página Escritório acompanha a execução automaticamente. Quando todas as tarefas do plano terminam com sucesso, o projeto recebe o estado **Finalizado**.

Em **Meus escritórios**, crie equipes especialistas e associe cada projeto a uma equipe. No plano, você pode trocar o agente responsável por qualquer agente cadastrado, permitindo handoffs entre áreas. As mensagens da sala são saídas reais do Codex: as tarefas continuam sequenciais e o próximo agente recebe as mensagens anteriores do projeto como contexto; não há diálogo simultâneo simulado.

Em **Biblioteca**, salve skills, notas, referências e URLs; o texto cadastrado é incluído no contexto das tarefas seguintes. Um link é registrado como fonte, mas não é apresentado como página pesquisada sem acesso real. Em **Estúdio de prompts**, crie e reutilize prompts para projetos, imagens, design e vídeos; um prompt também pode iniciar um projeto. Projetos aceitam até cinco anexos de 2,5 MB cada: PNG, JPEG, WebP, GIF, PDF, TXT, Markdown, CSV e JSON.

### Prospecção OpenStreetMap

No escritório **Prospecção e Inteligência Comercial**, clique no monitor da estação Maps e escreva um pedido, por exemplo “Encontre barbearias em um raio de 30 km de Crateús, Ceará”. O parser entende nichos conhecidos e tags OSM explícitas como `shop=florist`; se uma categoria não tiver mapeamento conhecido, a interface explica como informar uma tag em vez de fabricar uma equivalência. Pesquisa por cidade, estado e país usa a área geográfica retornada pelo Nominatim; raio usa o ponto geocodificado. Limites de região são divididos em segmentos limitados e consultados dentro da área OSM. Países e regiões que ultrapassam o máximo configurado são rejeitados com orientação para refinar o escopo, sem varredura mundial ou tentativa de contornar limites.

Resultados vêm de Overpass, são deduplicados pelo tipo e ID do objeto OSM, apresentados numa lista sincronizada com Leaflet, marcadores, enquadramento, raio/limites da região, detalhes disponíveis, histórico e CSV. Campos ausentes permanecem ausentes. “Site não identificado” não significa que a empresa não tenha site. Os contadores separados mostram registros únicos, analisados e qualificados; qualificados permanece zero enquanto a aplicação não executar uma análise comercial com evidências. A animação e a mensagem do agente Maps acompanham as fases da consulta real; a apresentação gradual dos registros depois da resposta não finge progresso de rede.

O backend salva parâmetros, estado, metadados de fonte e os resultados OSM retornados em SQLite; mantém também a tabela antiga de Place IDs Google para preservar o histórico anterior. O CSV inclui o ID OSM e aviso de atribuição/licença. Dados OpenStreetMap são disponibilizados sob ODbL; se distribuir/publicar a base derivada, observe as obrigações de atribuição e share-alike. A tela mostra atribuição clicável para os tiles e dados. Consulte a [licença e atribuição OSM](https://www.openstreetmap.org/copyright).

Sem chaves ou cobrança de Google, a aplicação usa três serviços configuráveis: Leaflet 1.9.4, Geoapify para localizar regioes quando PIXEL_GEOAPIFY_API_KEY estiver configurada (Nominatim permanece como alternativa) e Overpass para consultar categorias OSM. O servidor le a chave somente do ambiente e nunca a envia ao navegador; configure a mesma variavel no backend persistente remoto. A documentacao do Geoapify informa cota e restricoes por plano.

O provedor é separado da interface: `PIXEL_PROSPECTING_PROVIDER`, `PIXEL_OVERPASS_URL`, `PIXEL_NOMINATIM_URL`, `PIXEL_GEOAPIFY_URL`, `PIXEL_GEOAPIFY_API_KEY` permitem trocar a implantação sem reconstruir o escritório. Defina `PIXEL_OVERPASS_CELL_KM` e `PIXEL_OVERPASS_MAX_SEGMENTS` para ajustar a divisão geográfica dentro dos limites razoáveis do serviço público. Depois de mudar o `.env`, reinicie o backend persistente.

Em **Projetos**, abra uma entrega finalizada para ver a prévia do `index.html`, abrir o site em outra aba, conferir os arquivos criados e baixar o projeto em `.zip`. A prévia embutida roda em um quadro isolado do restante do painel.

O plano inicial é uma decomposição determinística local da solicitação, não uma resposta de modelo. O CEO só pode planejar sem provedor; execução de código exige o adaptador Codex real. O arquivo `.env` local é lido pelo servidor. Logs são limitados e alguns formatos comuns de chave são ocultados.

## Dados e segurança

- Persistência em `data/pixel.sqlite`; arquivos de projetos em `workspaces/<id>/`.
- Backup: pare o servidor e copie `data/pixel.sqlite` e a pasta `workspaces/`. A consistência entre ambos depende da pausa das execuções durante a cópia.
- Exportação JSON disponível pelo endpoint `/api/export`.
- Sem autenticação multiusuário: destinado exclusivamente a uso local no computador confiável. Não exponha a porta na rede.
- O agente pode executar comandos conforme as permissões normais do Codex dentro do projeto. Não execute código desconhecido em pastas com segredos.
- Nenhuma dependência é instalada em projetos criados automaticamente.

## Verificações

`npm test` executa os testes nativos; `npm run check` verifica sintaxe. Registre as saídas reais ao reportar resultados. Estado do Codex é verificado sob demanda e nunca presumido.

## Limitações da primeira versão

O plano do CEO é uma estrutura local simples; o adaptador não gera plano por IA. As execuções são sequenciais, possuem timeout e cancelamento. Tarefas interrompidas pelo reinício são marcadas como falhas recuperáveis para execução manual. Ainda não há autenticação de usuário, transmissão SSE, isolamento de processo em container, integração PostgreSQL, mobile nativo ou publicação. Revisão independente deve ser solicitada como tarefa Codex separada.
