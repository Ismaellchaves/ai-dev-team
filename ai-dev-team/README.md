# AI Dev Team

Equipe de agentes especializados para planejar e entregar software com revisão humana e permissões explícitas. Esta pasta é independente: não altera nem reorganiza o projeto que estava na raiz quando foi criada.

## Conteúdo

- `AGENTS.md`: regras compartilhadas, etapas, aprovações e contrato de delegação.
- `.codex/config.toml`: habilita subagentes na configuração deste projeto Codex.
- `.codex/agents/*.toml`: dez agentes personalizados Codex, prontos para uso quando Codex abre esta pasta como projeto, ou quando esses arquivos são instalados na configuração de um projeto.
- `templates/`: modelos reutilizáveis para briefing, tarefa, critérios de aceitação e relatório de testes.
- `docs/workflow.md`: fluxo e pontos de aprovação em forma operacional.
- `docs/agent-pixel-handoff.md`: transferência manual de especificações visuais do Agent Pixel.

## Como utilizar

1. Abra `ai-dev-team` como pasta de projeto no Codex para carregar sua configuração local, ou instale os arquivos `.codex` no projeto em que a equipe trabalhará (consulte `docs/workflow.md`). A configuração do produto deve continuar separada desta documentação se preferir.
2. Inicie com uma ideia e preencha `templates/briefing.md`. Peça ao agente principal para conduzir as etapas do fluxo e delegar tarefas independentes aos agentes personalizados disponíveis.
3. Responda às dúvidas essenciais e aprove arquitetura, escopo e operações externas nos pontos indicados. A equipe não deve tratar silêncio como aprovação.
4. Para cada delegação, use `templates/task.md` e inclua objetivo, contexto, arquivos, dependências, restrições, entregáveis e critério de conclusão.
5. Registre comportamentos verificáveis em `templates/acceptance-criteria.md`; documente resultados reais de validações com `templates/test-report.md`.
6. Integre e revise as alterações antes de entregar. Deploy, publicação, gasto ou mudança de infraestrutura exigem autorização explícita.

## Agentes incluídos

`ceo_tech_lead`, `senior_architect`, `senior_ui_ux_designer`, `frontend_developer`, `backend_developer`, `pentester_security_engineer`, `qa_engineer`, `devops_engineer`, `code_reviewer` e `product_owner_requirements_analyst`.

Os nomes de arquivo e instruções definem papéis; disponibilidade para delegação depende do cliente e versão do Codex. Este pacote não instala extensões, não configura uma conta e não presume que o Agent Pixel se integre ao Codex. Consulte `docs/workflow.md` para ativação, verificação e limites.
