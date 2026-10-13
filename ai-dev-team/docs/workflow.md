# Operação e delegação

## Ciclo de trabalho

1. Preencher `../templates/briefing.md` e confirmar objetivo, usuários e restrições com o solicitante.
2. Product Owner identifica ambiguidades essenciais, registra pressupostos e formula critérios no modelo de aceitação. Solicitar decisões do usuário quando escopo, dados, riscos, custo ou comportamento puderem mudar.
3. Tech Lead e Arquiteto analisam o projeto e produzem plano, interfaces, dependências e riscos. UI/UX especifica fluxos e estados quando há interface.
4. Apresentar arquitetura e plano ao usuário. Aguardar aprovação antes de implementar escolhas de arquitetura que mudem o escopo ou tenham consequências importantes.
5. Dividir o trabalho pelo modelo de tarefa. Delegar em paralelo somente tarefas independentes com limites de arquivos e contratos compatíveis. Manter um agente responsável por integrar.
6. Implementar com testes relacionados e documentação. Não modificar partes alheias ao escopo.
7. QA executa cenários e preenche relatório com evidência verdadeira. Corrigir defeitos pertinentes e repetir as verificações impactadas.
8. Pentester realiza revisão estática local; teste ativo requer confirmação de autorização, alvo e limites. Corrigir achados acordados.
9. Code Reviewer faz revisão independente das alterações integradas; resolver achados relevantes e repetir validações afetadas.
10. DevOps prepara instruções de operação e entrega. Deploy, publicação e alterações externas permanecem bloqueados até autorização explícita. Tech Lead apresenta resumo final com verificações, limitações e riscos restantes.

## Contrato de delegação

Copie e preencha `../templates/task.md` para cada tarefa. Não delegue apenas um rótulo de função ou uma instrução vaga. Identifique responsável, dependências reais e arquivos permitidos. Ao compartilhar trabalho concorrente, evite atribuir edição simultânea dos mesmos arquivos.

**Resposta esperada do agente:** resultado; caminhos alterados ou analisados; decisões e pressupostos; verificações executadas com comando e resultado; achados ou bloqueios; riscos restantes. Se não foi possível validar, declarar explicitamente.

## Ativar agentes personalizados no Codex

Os arquivos nesta pasta seguem o formato TOML de agentes personalizados descrito na documentação oficial do Codex: [Subagents e agentes personalizados](https://developers.openai.com/codex/multi-agent/). O pacote não pode detectar a versão, extensão, conta ou políticas da instalação do usuário; portanto, confirme suporte no Codex local antes de depender de um agente específico.

1. Abra `ai-dev-team` como projeto no Codex. O arquivo `.codex/config.toml` define `[agents] enabled = true`, e os dez arquivos de `.codex/agents/` são configurações de agentes deste projeto.
2. Se o agente for usar outro projeto, instale os TOML no caminho `.codex/agents/` desse projeto ou copie-os para `~/.codex/agents/` para disponibilizá-los globalmente. Copie `AGENTS.md` para a raiz do projeto de trabalho se desejar aplicar as regras gerais ali; não misture os arquivos de configuração da equipe com o conteúdo do produto sem decidir isso.
3. Reabra ou atualize a sessão conforme necessário. Peça explicitamente ao Codex, por exemplo: “Use `product_owner_requirements_analyst` para estruturar os requisitos e `senior_architect` para propor opções; não implemente antes de eu aprovar.”
4. Verifique no cliente que a configuração foi carregada e que o nome do agente é reconhecido. Em CLI, a documentação descreve `/agent` para inspecionar/trocar de thread; a disponibilidade de controles de interface varia por cliente/versão.
5. Caso o Codex rejeite um campo, caminho ou agente, confirme a documentação correspondente à versão instalada. Não contorne sandbox nem aprovação. Agentes herdam a política de permissões da sessão principal; os modos read-only declarados nos especialistas limitam a configuração do agente, mas não substituem a política efetiva do usuário.

Codex dispõe também de agentes internos, como `default`, `worker` e `explorer`, segundo a documentação consultada. Os TOML aqui definem papéis próprios e não dependem de nomes de ferramentas, MCPs ou modelos específicos. Não há seleção de modelo fixa: a disponibilidade e o modelo seguem a configuração do usuário.

## Agent Pixel

Não existe neste pacote integração Codex–Agent Pixel. O processo de transferência manual está em `agent-pixel-handoff.md`.
