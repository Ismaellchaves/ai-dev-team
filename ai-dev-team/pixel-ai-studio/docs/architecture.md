# Arquitetura inicial

## Escolhas

- **Servidor:** módulos ES nativos de Node.js e `node:http`, sem framework ou pacotes de terceiros.
- **Interface:** HTML semântico, CSS responsivo e JavaScript sem etapa de build; a aplicação continua abrindo sem internet.
- **Persistência:** SQLite por `node:sqlite` (Node 22.5+), com chaves estrangeiras, WAL e índice por projeto.
- **Agente:** adaptador Codex CLI chama `codex exec --json --sandbox workspace-write --skip-git-repo-check --cd <workspace> -` e envia a instrução por stdin. No Windows, completa `HOME` e `CODEX_HOME` a partir do perfil existente quando o processo pai os omite. Login é verificado com `codex login status`; nenhuma conexão aparece como ativa sem sucesso nessa verificação.
- **Execução:** aprovação do plano inicia tarefas sequenciais, uma por vez, com 10 minutos de timeout, cancelamento, histórico de saída e recuperação de tarefas interrompidas após reinício. Tentativas antigas iguais ganham estado `superseded` quando há uma entrega sucedida; logs são mantidos.
- **Git:** cada workspace novo recebe `git init` local. A aplicação não cria commits nem faz push.

## Limites de confiança

O servidor escuta apenas em `127.0.0.1`. Escritas e execução de agente ocorrem apenas na pasta de projeto gerada em `workspaces/`; caminho real precisa corresponder ao diretório UUID esperado, o que rejeita redirecionamento por symlink. API valida JSON, tamanho do corpo e origem de requisições mutáveis. O Codex recebe somente `workspace-write`, sem opção de contornar aprovações.

Esta camada não é isolamento de sistema operacional: o sandbox e as permissões do próprio Codex continuam sendo a fronteira de execução. Para trabalho com código hostil, use uma VM ou ambiente de desenvolvimento descartável. Não há contas ou sessões multiusuário; não exponha a porta fora do loopback.

## Dados

`projects`, `tasks` e `events` são armazenados em `data/pixel.sqlite`. `workspaces/<uuid>` contém um repositório Git local e os arquivos criados pelos agentes. Exporte o histórico por `GET /api/export`. Para backup consistente, interrompa o servidor e copie o banco e a pasta `workspaces/` juntos.

## Próxima evolução

Separar adaptador e filas em contratos públicos, acrescentar migrações versionadas, streaming SSE, diretório de autorização configurável, autenticação local, fluxo de aprovação de comandos não interativos e execução em container. Essas capacidades ainda não fazem parte desta versão.
