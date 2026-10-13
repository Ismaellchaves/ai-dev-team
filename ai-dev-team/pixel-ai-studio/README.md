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

No Windows, inicie o painel na mesma conta que autenticou o Codex. Se o próprio servidor for iniciado dentro de outra sandbox restrita, o CLI pode validar o login e ainda assim falhar ao gravar seus arquivos de estado em `%USERPROFILE%\.codex` (por exemplo, erros `Acesso negado`, `PATH aliases` ou banco de estado). Nesse caso, abra o PowerShell normal do Windows, fora da sandbox, e execute `npm start`. Os comandos que os agentes executam continuam limitados ao workspace do projeto pelo sandbox `workspace-write` do Codex.

## Fluxo

1. Crie um projeto: ele ganha uma pasta isolada em `workspaces/`.
2. Envie uma solicitação ao CEO e confira o plano gerado.
3. Confirme o plano para persistir suas tarefas.
4. Ao aprovar, o time executa as tarefas em sequência; para um plano já aprovado, reabra o projeto e aprove de novo para retomar. A aplicação usa `codex exec --json --sandbox workspace-write` e restringe o acesso ao workspace.
5. Consulte saídas e resultados no quadro e no painel.

O painel tem uma página **Escritório** com os 12 perfis em pixel art. Os indicadores e as falas refletem as tarefas e as mensagens recebidas do Codex; a atualização acontece a cada quatro segundos. Ao aprovar um plano, a página Escritório acompanha a execução automaticamente. Quando todas as tarefas do plano terminam com sucesso, o projeto recebe o estado **Finalizado**.

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
