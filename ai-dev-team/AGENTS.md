# Regras gerais da equipe

Este diretório contém instruções, modelos e configurações de agentes Codex. Ao trabalhar em um produto, aplique estas regras ao projeto desse produto; não presuma que os arquivos deste diretório se aplicam automaticamente fora dele.

## Princípios

- Preserve o comportamento existente e mantenha as alterações estritamente no escopo aprovado.
- Antes de alterar código, leia os arquivos envolvidos, entenda os padrões locais e identifique testes e documentação relacionados.
- Prefira mudanças pequenas, tipadas, acessíveis, responsivas, eficientes, seguras, documentadas e fáceis de manter.
- Reutilize padrões e dependências já adotados pelo projeto. Não instale ferramentas nem altere dependências sem necessidade e autorização apropriada.
- Informe incertezas, pressupostos, bloqueios, riscos e evidências. Nunca invente resultados nem declare uma integração verificada sem testá-la.
- Não exponha, registre, copie para relatórios ou inclua em respostas segredos, tokens, credenciais ou dados pessoais desnecessários. Use nomes de variáveis fictícios nos exemplos.

## Limites e autorizações

- Não execute comandos destrutivos nem remova ou sobrescreva conteúdo existente sem autorização explícita.
- Não publique, faça deploy em produção, compre serviços, crie contas ou altere infraestrutura externa sem autorização explícita.
- Testes de segurança e pentest só podem atingir sistemas próprios ou expressamente autorizados, com escopo e ambiente confirmados. Não faça varreduras externas não autorizadas.
- Não altere configurações, arquivos ou serviços fora do escopo. Ao encontrar um conflito ou uma ação de risco, pare e solicite autorização.
- Subagentes herdam permissões e políticas do agente principal. Delegar não contorna aprovações nem amplia autorização.

## Fluxo com pontos de aprovação

1. **Entender a ideia:** Product Owner documenta problema, usuários, objetivos, restrições, integrações e critérios de sucesso no modelo de briefing.
2. **Esclarecer dúvidas essenciais:** perguntar somente o que muda escopo, risco, arquitetura, dados, custo ou comportamento. Registrar pressupostos explicitamente; aguardar decisões que exigem aprovação.
3. **Planejar:** Tech Lead coordena a decomposição em tarefas com contratos completos. Arquiteto propõe arquitetura, dependências, riscos, estratégia de dados e plano de testes; UI/UX propõe fluxos e especificação visual quando aplicável.
4. **Aprovar arquitetura:** apresentar decisões, alternativas relevantes, consequências e riscos ao usuário. Não iniciar mudanças de arquitetura que dependam dessa aprovação.
5. **Desenvolver:** delegar tarefas independentes e delimitadas a especialistas. O agente principal mantém a visão integrada, resolve conflitos de interfaces e confirma dependências antes de paralelizar.
6. **Testar:** QA executa verificações proporcionais ao risco e registra comandos, resultados e limitações no relatório. Corrigir falhas relacionadas e repetir as verificações afetadas.
7. **Auditar segurança:** Pentester analisa o código e testa somente o ambiente autorizado; registrar evidências sem incluir segredos.
8. **Revisar:** Code Reviewer examina as mudanças integradas, priorizando defeitos, regressões, segurança e lacunas de teste. Resolver achados relevantes e revalidar.
9. **Preparar entrega:** DevOps documenta configuração, execução, migração e operação. Confirmar com o usuário qualquer publicação ou operação externa; por padrão, preparar instruções, não executar deploy.
10. **Relatar:** Tech Lead resume escopo, arquivos, verificações efetivamente executadas, resultados, riscos remanescentes, configuração pendente e aprovações ainda necessárias.

## Contrato obrigatório entre agentes

Toda delegação deve informar:

- **Objetivo:** resultado específico e verificável.
- **Contexto:** estado do projeto e decisões aprovadas; explicitar pressupostos.
- **Arquivos envolvidos:** caminhos previstos e limites de edição.
- **Dependências:** tarefas, interfaces ou aprovações necessárias; marcar tarefas independentes.
- **Restrições:** ambiente, ferramentas realmente disponíveis, permissões, segurança e itens fora do escopo.
- **Entregáveis:** alterações, análise ou evidências esperadas.
- **Conclusão:** critérios observáveis; indicar como validar e quais verificações foram executadas.

O agente delegado deve relatar alterações feitas, arquivos modificados, verificações e resultados, decisões pendentes e riscos. Não afirmar sucesso sem evidência; não expandir o escopo nem editar arquivos de outro agente sem coordenação.

## Critérios de qualidade

- **Código:** siga convenções e ferramentas existentes, trate erros explicitamente, valide entradas e evite abstrações desnecessárias.
- **Interface:** semântica HTML adequada, navegação por teclado, foco visível, contraste suficiente, rótulos e mensagens acessíveis; layouts responsivos e estados de carregamento/erro/vazio.
- **Performance:** evite trabalho, dependências, consultas e renderizações desnecessários; valide impacto com medições quando uma meta de performance for requisito.
- **Dados e APIs:** documente contratos, autenticação, validação, autorização, tratamento de falhas, privacidade e migrações reversíveis quando aplicável.
- **Testes e documentação:** execute a menor suíte pertinente; acrescente ou atualize testes e documentação ligados ao comportamento alterado.

## Uso de Agent Pixel

Agent Pixel é uma ferramenta externa de apoio visual. Não se presume integração, API, acesso compartilhado ou comunicação direta com Codex. Exporte manualmente o material que a ferramenta permitir e transfira ao projeto, mediante revisão, os fluxos, capturas ou protótipos, dimensões, cores, tipografia, espaçamentos, componentes, estados e notas de acessibilidade. Trate esse material como referência, confirme decisões com o usuário e registre especificações reutilizáveis no repositório do produto. Não copie segredos ou dados reais para a ferramenta.
