import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import { openStore } from './store.mjs';
import { providerConfig, checkCodex, runCodex } from './codex.mjs';
import { parseProspectingIntent, prospectingProviders } from './prospecting.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const envFile=path.join(root,'.env');
if(fs.existsSync(envFile))for(const line of fs.readFileSync(envFile,'utf8').split(/\r?\n/)){
  const match=line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
  if(match&&process.env[match[1]]===undefined)process.env[match[1]]=match[2].replace(/^(['"])(.*)\1$/,'$2');
}
const publicDir=path.join(root,'public');
const workspaceRoot=path.join(root,'workspaces');
const dataDir=process.env.PIXEL_DATA_DIR ? path.resolve(process.env.PIXEL_DATA_DIR) : path.join(root,'data');
fs.mkdirSync(workspaceRoot,{recursive:true});
const store=openStore(dataDir);
if(!store.offices().some(o=>o.id==='development'))store.createOffice({id:'development',name:'Desenvolvimento',specialty:'Sites, sistemas, APIs, qualidade e segurança'},[]);
store.recoverInterrupted();
store.reconcileDuplicateAttempts();
const provider=providerConfig();
const prospectingProviderId=process.env.PIXEL_PROSPECTING_PROVIDER||'overpass';
const prospectingProviderFactory=prospectingProviders[prospectingProviderId];
if(!prospectingProviderFactory)throw new Error(`Provedor de prospecção desconhecido: ${prospectingProviderId}`);
const prospectingProvider=prospectingProviderFactory({overpassUrl:process.env.PIXEL_OVERPASS_URL,nominatimUrl:process.env.PIXEL_NOMINATIM_URL,geoapifyUrl:process.env.PIXEL_GEOAPIFY_URL,geoapifyApiKey:process.env.PIXEL_GEOAPIFY_API_KEY,tileUrl:process.env.PIXEL_OSM_TILE_URL,cellKm:process.env.PIXEL_OVERPASS_CELL_KM,maxSegments:process.env.PIXEL_OVERPASS_MAX_SEGMENTS,userAgent:process.env.PIXEL_OSM_USER_AGENT});
const prospectingJobs=new Map();
const prospectingRateLimits=new Map();
const apiToken=process.env.PIXEL_API_TOKEN||'';
if(process.env.NODE_ENV==='production'&&apiToken.length<32)throw new Error('Set PIXEL_API_TOKEN to a random value of at least 32 characters in production.');
const active=new Map();
const projectRuns=new Map();
let codexState={available:false,configured:provider.configured,checking:false,message:provider.configured?'Verificando o estado de autenticação do Codex CLI.':'Codex CLI não encontrado. Configure PIXEL_CODEX_PATH.'};
let lastProviderCheck=0;
let providerCheckPromise=null;
function refreshProvider(force=false){
  if(codexState.checking)return providerCheckPromise||Promise.resolve(codexState);
  if(!provider.configured||(!force&&Date.now()-lastProviderCheck<30000))return Promise.resolve(codexState);
  lastProviderCheck=Date.now();
  codexState={...codexState,checking:true};
  providerCheckPromise=checkCodex(provider,path.resolve(root),8000).then(result=>{codexState={...result,configured:provider.configured,checking:false};return codexState;}).catch(()=>{codexState={available:false,configured:provider.configured,checking:false,message:'Não foi possível verificar o Codex CLI.'};return codexState;}).finally(()=>{providerCheckPromise=null;});
  return providerCheckPromise;
}
const agents=[
  ['pixel_ceo','Pixel CEO','Coordenação e requisitos'],['project_manager','Gerente de projetos','Projetos e tarefas'],
  ['architect','Arquiteto de sistemas','Arquitetura'],['designer','Designer de UI/UX','Design acessível'],
  ['frontend','Desenvolvedor de interface','Interfaces web'],['backend','Desenvolvedor de sistemas','APIs e regras'],
  ['database','Engenheiro de dados','Persistência'],['mobile','Desenvolvedor mobile','React Native e Expo'],
  ['qa','Analista de qualidade','Validação e qualidade'],['security','Analista de segurança','Revisão de segurança'],
  ['devops','Engenheiro DevOps','Execução e compilação'],['docs','Redator técnico','Documentação']
].map(([id,name,specialty])=>({id,name,specialty,provider:'Codex CLI',state:'ready'}));
const instructions={
  pixel_ceo:'Conduza a tarefa com foco no objetivo e critérios de aceite; sinalize decisões em aberto.',
  project_manager:'Organize o escopo em passos claros e atualize os documentos de tarefas e progresso.',
  architect:'Priorize arquitetura simples, interfaces de módulos, dados, riscos e decisões registradas.',
  designer:'Priorize hierarquia visual, estados de interface, responsividade, acessibilidade e consistência.',
  frontend:'Implemente interfaces acessíveis e responsivas; integre APIs reais e trate estados de carga e erro.',
  backend:'Implemente APIs validadas, regras de negócio, persistência e tratamento explícito de falhas.',
  database:'Modele dados, integridade, índices e migrações reversíveis; proteja os dados existentes.',
  mobile:'Implemente telas e navegação mobile compatíveis com as ferramentas existentes; informe limites de build.',
  qa:'Execute verificações locais apropriadas e registre comandos, resultados e falhas reproduzíveis.',
  security:'Revise entradas, permissões, segredos e subprocessos; não execute pentests fora do projeto.',
  devops:'Prepare scripts reprodutíveis e documentação operacional; não publique nem altere produção.',
  docs:'Mantenha instruções e documentação alinhadas ao comportamento implementado.'
};

const companyOfficeDefinitions=[
  {id:'dept_executive',name:'Diretoria Executiva',specialty:'Gestão geral, planejamento estratégico, coordenação de departamentos, distribuição de tarefas, acompanhamento de resultados e consolidação de entregas.',agents:['Pixel CEO','Atlas Diretor de Operações','Íris Gerente de Projetos','Nexus Coordenador de Agentes','Orion Analista Estratégico','Echo Secretário Executivo']},
  {id:'dept_prospecting',name:'Prospecção e Inteligência Comercial',specialty:'Pesquisa de nichos, prospecção de empresas, OpenStreetMap, Overpass, identificação de oportunidades, análise de presença digital e concorrência.',agents:['Hunter Diretor de Prospecção','Maps Especialista em dados OpenStreetMap','Scout Pesquisador de Nichos','Radar Analista de Empresas','Lead Qualificador de Leads','Trace Pesquisador de Presença Digital','Market Analista de Concorrência']},
  {id:'dept_sales',name:'Vendas e CRM',specialty:'Gestão de leads, funil comercial, qualificação de oportunidades, propostas, negociação, acompanhamento de clientes e registro de resultados.',agents:['Vitor Diretor Comercial','Closer Especialista em Vendas','Pitch Consultor de Soluções','Deal Analista de Negociação','Proposal Especialista em Propostas','Pipeline Gestor de CRM','Follow Especialista em Acompanhamento Comercial']},
  {id:'dept_support',name:'Atendimento e Relacionamento',specialty:'Atendimento ao cliente, organização de conversas, identificação de necessidades, suporte inicial, tickets, encaminhamentos e acompanhamento da satisfação.',agents:['Lia Diretora de Atendimento','Atena Recepcionista Virtual','Mila Analista de Necessidades','Help Especialista em Suporte','Care Especialista em Pós-venda','Inbox Gestor de Conversas','Quality Supervisor de Atendimento']},
  {id:'dept_marketing',name:'Marketing e Estratégia Digital',specialty:'Pesquisa de mercado, posicionamento de marca, estratégia digital, campanhas, planejamento editorial, SEO, redação publicitária e análise de desempenho.',agents:['Maya Diretora de Marketing','Trend Pesquisador de Tendências','SEO Especialista em SEO','Copy Redator Publicitário','Social Estrategista de Redes Sociais','Campaign Planejador de Campanhas','Metrics Analista de Desempenho']},
  {id:'dept_quality',name:'Qualidade e Segurança',specialty:'Controle de qualidade, auditoria independente, testes, análise de riscos, verificação de requisitos e segurança das aplicações.',agents:['Shield Diretor de Qualidade','Test Engenheiro de Testes','Audit Auditor de Processos','Secure Analista de Segurança','Review Revisor Independente','Proof Validador de Requisitos','Risk Analista de Riscos']},
  {id:'dept_finance',name:'Administração e Finanças',specialty:'Organização administrativa, controle de custos, planejamento financeiro, orçamentos, documentação, rentabilidade e relatórios gerenciais.',agents:['Finch Diretor Administrativo','Cash Analista Financeiro','Budget Especialista em Orçamentos','Cost Analista de Custos','Ledger Controlador Financeiro','Docs Gestor de Documentação','Planner Planejador Operacional']},
  {id:'dept_automation',name:'Automação e Integrações',specialty:'Mapeamento de processos, automação de tarefas, integração de APIs, workflows, monitoramento de execuções e análise de falhas.',agents:['Flow Diretor de Automação','Webhook Especialista em APIs','Trigger Especialista em Gatilhos','Robo Analista de Processos','Sync Especialista em Integrações','Monitor Monitor de Execuções','Retry Especialista em Recuperação de Falhas']},
  {id:'dept_research',name:'Pesquisa e Inteligência de Mercado',specialty:'Pesquisa de informações, análise de setores, comparação de soluções, tendências, fontes, oportunidades e relatórios fundamentados.',agents:['Sherlock Diretor de Pesquisa','Atlas Research Pesquisador de Mercado','TrendWatch Analista de Tendências','Compare Especialista em Comparações','Source Verificador de Fontes','Insight Analista de Oportunidades','Report Redator de Relatórios']},
  {id:'dept_success',name:'Customer Success e Pós-venda',specialty:'Acompanhamento após a entrega, integração de clientes, pendências, riscos de insatisfação, feedback e melhoria contínua.',agents:['Success Diretor de Customer Success','Onboard Especialista em Integração de Clientes','Feedback Analista de Feedback','Health Monitor de Saúde da Conta','Renew Especialista em Renovações','Retain Analista de Retenção','Improve Especialista em Melhoria Contínua']}
];
function companyAgentDetails(fullName,office){
  const parts=fullName.split(' '),researchName=fullName.startsWith('Atlas Research '),name=researchName?parts.slice(0,2).join(' '):parts[0],role=researchName?parts.slice(2).join(' '):parts.slice(1).join(' '),normalizedRole=normalized(role);
  const director=/diretor|diretora|ceo|coordenador|gerente|gestor/.test(normalizedRole),research=/pesquisador|analista|auditor|verificador|redator|validador|monitor|especialista|qualificador|revisor/.test(normalizedRole);
  let duty=director?'Coordene o departamento, distribua subtarefas aos especialistas adequados, acompanhe dependências e consolide evidências para a Diretoria Executiva.':research?'Investigue a questão atribuída, registre fontes e datas, separe informações confirmadas de inferências e entregue uma análise objetiva ao diretor do departamento.':'Execute a parte especializada da tarefa, documente decisões e limitações e encaminhe o resultado com evidências ao diretor do departamento.';
  if(normalizedRole.includes('openstreetmap'))duty='Use a interface real do provedor OpenStreetMap/Overpass. Informe quantos registros únicos foram retornados e a cobertura delimitada. A base pode estar incompleta; não invente empresas nem trate site ausente como prova de que a empresa não tem site.';
  if(/comercial|venda|proposta|atendimento|cliente/.test(normalizedRole))duty+=' Prepare rascunhos para aprovação humana; não contate clientes nem declare mensagens enviadas.';
  if(/financeiro|custos|orcamento|controlador/.test(normalizedRole))duty+=' Use apenas valores fornecidos ou fontes autorizadas, declare premissas e não execute pagamentos ou assuma compromissos.';
  if(/seguranca|teste|auditor|revisor|validador|risco/.test(normalizedRole))duty+=' Registre método, comandos e evidências reproduzíveis; nunca declare testes não executados.';
  const directorName=office.agents[0].split(' ')[0];
  return {name,role,specialty:`${role} — ${office.name}`,instructions:`Você é ${name}, ${role}, no departamento ${office.name}. ${office.specialty} ${duty} Encaminhe resumo, arquivos, fontes, dúvidas e bloqueios para ${directorName}, diretor responsável. Não invente fatos ou resultados; não envie comunicações externas, não faça pagamentos nem publique sem aprovação humana.`};
}
function seedCompanyOffices(){for(const definition of companyOfficeDefinitions){if(store.hasOffice(definition.id)||store.findOfficeByName(definition.name))continue;const rows=definition.agents.map((fullName,index)=>({id:`${definition.id}_${String(index+1).padStart(2,'0')}`,...companyAgentDetails(fullName,definition)}));store.createOffice({id:definition.id,name:definition.name,specialty:definition.specialty,director_agent_id:rows[0].id},rows)}}
seedCompanyOffices();
store.updateOfficeSpecialty('dept_prospecting',companyOfficeDefinitions.find(office=>office.id==='dept_prospecting').specialty);
const mapsAgent=store.offices().find(office=>office.id==='dept_prospecting')?.agents.find(agent=>agent.id==='dept_prospecting_02');if(mapsAgent&&/google maps/i.test(mapsAgent.role||''))store.updateCustomAgent(mapsAgent.id,{role:'Especialista em dados OpenStreetMap',specialty:'Especialista em dados OpenStreetMap — Prospecção e Inteligência Comercial',instructions:'Você é Maps, especialista em dados do OpenStreetMap. Pesquise estabelecimentos somente por meio do provedor Overpass configurado, use os limites geográficos reais informados pela busca, cite OpenStreetMap/ODbL e não invente dados ausentes. Informe cobertura e limitações; a ausência de site nos dados não prova que a empresa não possui site. Entregue os resultados ao diretor Hunter.'});
function allAgents(){return [...agents.map(a=>({...a,office_id:'development',role:a.specialty,instructions:instructions[a.id]||''})),...store.offices().flatMap(o=>o.agents.map(a=>({...a,office_id:o.id,provider:'Codex CLI',state:'ready'})))];}
const send=(res,status,payload)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(payload));};
async function body(req,maxBytes=100_000){let raw='';for await(const part of req){raw+=part;if(raw.length>maxBytes)throw Object.assign(new Error('Corpo da requisição muito grande.'),{status:413});}try{return JSON.parse(raw||'{}');}catch{throw Object.assign(new Error('JSON inválido.'),{status:400});}}
function text(v,max=10000){return typeof v==='string'?v.trim().slice(0,max):'';}
function normalized(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
function mapsIntegrationStatus(){return{ready:true,provider:prospectingProvider.name,provider_id:prospectingProvider.id,geocoder:prospectingProvider.geocoderName,geoapifyConfigured:prospectingProvider.geocoderReady,tileUrl:prospectingProvider.tileUrl,overpassUrl:prospectingProvider.overpassUrl,geocoderUrl:prospectingProvider.geoapifyApiKey?prospectingProvider.geoapifyUrl:prospectingProvider.nominatimUrl,pending:[],attribution:'\u00a9 OpenStreetMap contributors',license:'Open Database License (ODbL)',limits:{searchesPerMinute:3,maxResults:500,maxSegments:prospectingProvider.maxSegments,segmentSizeKm:prospectingProvider.cellKm}}}
function parseJson(value,fallback={}){try{return JSON.parse(value||'{}')}catch{return fallback}}
async function runProspectingSearch(id,search,controller){const job=prospectingJobs.get(id);if(!job)return;job.controller=controller;job.status='running';job.phase='Iniciando busca';store.updateProspectingSearch(id,{status:'running',started_at:new Date().toISOString()});try{const result=await prospectingProvider.search(search,{signal:controller.signal,onProgress:phase=>{job.phase=phase}});job.results=result.results;job.metadata=result.metadata;job.received=result.results.length;job.status='succeeded';job.phase='Busca real concluída';store.saveProspectingResults(id,result.results);store.updateProspectingSearch(id,{status:'succeeded',finished_at:new Date().toISOString(),source_metadata:result.metadata,stats:{raw:result.metadata.returned_raw,unique:result.metadata.unique_count,analyzed:result.metadata.analyzed_count,qualified:result.metadata.qualified_count,truncated:result.metadata.truncated}});store.event('prospecting',`Busca OSM concluída: ${search.category} — ${search.region} (${result.results.length} resultados únicos)`)}catch(error){const cancelled=error.name==='AbortError';job.status=cancelled?'cancelled':'failed';job.phase=cancelled?'Busca cancelada':'Busca interrompida';job.error=cancelled?'Busca cancelada pelo usuário.':error.message;store.updateProspectingSearch(id,{status:job.status,error:job.error,finished_at:new Date().toISOString()});store.event(cancelled?'prospecting':'error',`Busca OSM ${cancelled?'cancelada':'falhou'}: ${search.category} — ${search.region}`)}}
function detectProjectType(brief){const s=normalized(brief);if(/\b(video|filme|animacao|motion|roteiro|edicao de video)\b/.test(s))return'video';if(/\b(imagem|foto|fotografia|arte|ilustracao|desenho|logo|identidade visual|banner|thumbnail|pixel art|visual)\b/.test(s))return'visual';if(/\b(mobile|android|ios|react native|app nativo|aplicativo mobile)\b/.test(s))return'mobile';return'development';}
function officeForBrief(brief){
  const s=normalized(brief),type=detectProjectType(brief),offices=store.offices(),all=allAgents();let selected=offices.find(o=>o.id==='development')||offices[0],best=0;
  for(const office of offices){const profile=normalized([office.name,office.specialty,...office.agents.map(a=>a.name+' '+a.specialty)].join(' '));let score=0;
    const signals=type==='visual'?[/design|designer|arte|artist|visual|imagem|ilustr|foto|criativ/]:type==='video'?[/video|film|motion|anim|roteir|edicao/]:type==='mobile'?[/mobile|android|ios|aplicativ|react native/]:[/desenvolv|development|software|sistema|web|backend|frontend|program/];
    for(const re of signals)if(re.test(profile))score+=4;
    const tokens=[...new Set(s.match(/[a-z0-9]{4,}/g)||[])];for(const token of tokens)if(profile.includes(token))score+=1;
    const matchingAgents=all.filter(a=>a.office_id===office.id).length;if(matchingAgents)score+=1;
    if(score>best){selected=office;best=score}
  }
  return selected;
}
function agentForRole(role,preferredOfficeId){
  const profiles={
    architect:{name:['architect','arquiteto','arquitetura'],specialty:['arquitetura','analista']},
    implementation:{name:['frontend','backend','desenvolvedor','programador','developer','engenheiro'],specialty:['frontend','backend','desenvolvimento','programacao','engenharia']},
    design:{name:['diretor de arte','direcao de arte','designer','design','visual','arte'],specialty:['direcao de arte','design grafico','identidade visual','ui ux','design de interfaces']},
    creator:{name:['diretor de fotografia','fotografo','fotografia','ilustrador','artista','editora de imagens','editor de imagens','motion','animador','criador'],specialty:['fotografia','ilustracao','edicao de imagem','motion design','criacao visual']},
    quality:{name:['qa','qualidade','teste','testador','revisor','revisora'],specialty:['qualidade','testes','revisao']},
    mobile:{name:['mobile','android','ios','react native'],specialty:['mobile','android','ios','react native']}
  };
  const match=(profile,word)=>profile.includes(normalized(word));
  const candidateProfile=profiles[role]||{name:[],specialty:[]},candidates=allAgents();let best=null,bestScore=-1;
  for(const agent of candidates){const name=normalized(agent.name),specialty=normalized(agent.specialty);let score=agent.office_id===preferredOfficeId?3:0;for(const word of candidateProfile.name)if(match(name,word))score+=word.includes(' ')?12:9;for(const word of candidateProfile.specialty)if(match(specialty,word))score+=2;if(score>bestScore){best=agent;bestScore=score}}
  const fallback={architect:'architect',implementation:'frontend',design:'designer',creator:'designer',quality:'qa',mobile:'mobile'}[role];
  return best&&bestScore>0?best.id:fallback;
}
function planFor(brief,preferredOfficeId='development'){
  const type=detectProjectType(brief);
  if(type==='visual'||type==='video')return[
    {title:'Definir direção criativa e critérios de entrega',agent_id:agentForRole('design',preferredOfficeId),description:`Analise o briefing, escolha linguagem visual, composição, cores e formato. Registre as decisões em docs/direcao-criativa.md e identifique quais arquivos finais devem ser entregues. Briefing: ${brief}`},
    {title:type==='video'?'Criar a primeira entrega audiovisual':'Criar a primeira peça visual',agent_id:agentForRole('creator',preferredOfficeId),description:`Produza arquivos reais de acordo com a direção criativa e o briefing. Use referências em references/ e entregue uma prévia visual que possa ser aberta no navegador quando o formato permitir. Não afirme que criou mídia raster ou vídeo se tiver produzido apenas um mockup ou arquivo vetorial; documente claramente os formatos entregues. Briefing: ${brief}`},
    {title:'Revisar a entrega e preparar os arquivos finais',agent_id:agentForRole('quality',preferredOfficeId),description:`Revise consistência visual, arquivos, dimensões e instruções para visualizar a entrega. Corrija problemas e registre os arquivos e limitações reais em docs/quality-report.md. Briefing: ${brief}`}
  ];
  const kind=type==='mobile'?'Aplicativo mobile':/api|backend|banco|sistema|cadastro|autentica|dados|estoque/i.test(brief)?'Sistema web':'Site ou aplicação web';
  return[
    {title:'Definir arquitetura e critérios de aceite',agent_id:agentForRole('architect',preferredOfficeId),description:`Analise o briefing e documente arquitetura, decisões, critérios de aceite e riscos em docs/architecture.md. Briefing: ${brief}`},
    {title:'Implementar a primeira entrega funcional',agent_id:agentForRole(type==='mobile'?'mobile':'implementation',preferredOfficeId),description:`Implemente uma primeira versão funcional de ${kind} conforme o briefing. Crie arquivos reais, valide entradas, inclua estados acessíveis e documente como executar. Para sites, entregue sempre uma prévia funcional abrindo index.html diretamente no navegador, com HTML/CSS/JavaScript comum. Use caminhos relativos para arquivos locais da prévia. Se usar React, JSX ou outra ferramenta que precise compilar, deixe também uma index.html compilada e pronta para prévia, sem exigir instalação de dependências. Examine os arquivos em references/ como referências. Briefing: ${brief}`},
    {title:'Revisar qualidade e instruções de execução',agent_id:agentForRole('quality',preferredOfficeId),description:`Revise os arquivos produzidos. Execute verificações seguras disponíveis, corrija problemas pequenos e documente evidências e limitações em docs/quality-report.md. Briefing: ${brief}`}
  ];
}
function projectPath(project){
  const resolved=path.resolve(workspaceRoot,project.id);
  if(path.dirname(resolved)!==workspaceRoot)throw new Error('Pasta de projeto fora da raiz permitida.');
  const real=fs.realpathSync(resolved), base=fs.realpathSync(workspaceRoot);
  if(real!==path.join(base,project.id))throw new Error('Pasta de projeto foi redirecionada por link simbólico.');
  return real;
}
function signedDownloadValid(url,projectId){
  if(!apiToken)return false;
  const expires=Number(url.searchParams.get('exp')),signature=url.searchParams.get('sig')||'';
  const now=Math.floor(Date.now()/1000);
  if(!Number.isInteger(expires)||expires<now||expires>now+120||!/^[a-f0-9]{64}$/i.test(signature))return false;
  const expected=createHmac('sha256',apiToken).update(`${projectId}.${expires}`).digest();
  const supplied=Buffer.from(signature,'hex');
  return supplied.length===expected.length&&timingSafeEqual(supplied,expected);
}
function refreshProjectStatus(projectId){
  const tasks=store.listTasks().filter(t=>t.project_id===projectId&&t.status!=='superseded');
  const complete=tasks.length>0&&tasks.every(t=>t.status==='succeeded');
  store.updateProject(projectId,complete?'completed':'active');
  return complete;
}
for(const project of store.listProjects())refreshProjectStatus(project.id);
function executeTask(task){
  if(active.has(task.id)||active.size>=1)return Promise.reject(new Error('Limite de concorrência atingido.'));
  const project=store.getProject(task.project_id);
  if(!project)return Promise.reject(new Error('Projeto não encontrado.'));
  if(!provider.configured||!codexState.available)return Promise.reject(new Error(codexState.message||'Codex CLI não está autenticado.'));
  const cwd=projectPath(project);
  store.updateTask(task.id,{status:'running',output:'',error:'',started_at:new Date().toISOString(),finished_at:null});
  store.event('task',`Execução iniciada: ${task.title}`);
  const agent=allAgents().find(a=>a.id===task.agent_id),office=store.offices().find(o=>o.id===agent?.office_id);
  const handoffs=store.listTasks().filter(t=>t.project_id===task.project_id&&t.id!==task.id&&t.output).sort((a,b)=>a.created_at.localeCompare(b.created_at)).slice(-5).map(t=>{let m='';for(const line of t.output.split(/\r?\n/)){try{const e=JSON.parse(line);if(e.type==='item.completed'&&e.item?.type==='agent_message')m=e.item.text||m;}catch{}}return m?`\n[${allAgents().find(a=>a.id===t.agent_id)?.name||t.agent_id}, ${t.title}]: ${m.slice(0,1600)}`:''}).filter(Boolean).join('\n');
  const library=store.resources().slice(0,8).map(r=>`\n[${r.kind}: ${r.title}]\n${r.content.slice(0,1800)}`).join('\n');
  const prompt=`Você é ${agent?.name||'agente'}${agent?.role?`, no cargo ${agent.role}`:''}${office?` do escritório ${office.name} (${office.specialty})`:''} no PIXEL AI STUDIO. ${instructions[task.agent_id]||agent?.instructions||agent?.specialty||''} Execute a tarefa dentro da pasta atual do projeto. Examine imagens, PDFs e textos em references/. As mensagens abaixo são handoffs reais de agentes deste projeto: responda ao contexto quando relevante; sua saída será registrada para os próximos agentes. Não acesse arquivos fora do projeto, não instale dependências, não publique, não envie mensagens externas, não use credenciais. Ao terminar, liste arquivos alterados e verificações realmente executadas.\n\nBIBLIOTECA:${library||' nenhum material cadastrado.'}\nHANDOFFS REAIS ENTRE AGENTES:${handoffs||' nenhum handoff anterior.'}\n\nTAREFA: ${task.title}\n${task.description}`;
  let output='';
  const execution=runCodex(provider,cwd,prompt,{onOutput:chunk=>{output=(output+chunk).slice(-24000);store.updateTask(task.id,{status:'running',output,error:'',finished_at:null});}});
  active.set(task.id,{cancel:()=>execution.cancel?.()});
  return execution.then(result=>{
    store.updateTask(task.id,{status:'succeeded',output:(output||result.output).slice(-24000),error:'',finished_at:new Date().toISOString()});
    store.reconcileDuplicateAttempts();
    refreshProjectStatus(task.project_id);
    store.event('task',`Tarefa concluída: ${task.title}`);return true;
  }).catch(e=>{
    const rawError=String(e.message||'');
    const stateAccessDenied=/failed to initialize in-process app-server client|unable to open database file|Acesso negado|os error 5|Permission denied/i.test(rawError);
    const userError=stateAccessDenied?'O Codex foi autenticado, mas não conseguiu acessar sua pasta de estado em ~/.codex. Inicie o PIXEL AI STUDIO com a mesma conta do Windows usada no login do Codex; se ele estiver rodando dentro de outra sandbox, inicie o painel em um terminal do Windows fora dela.':rawError;
    store.updateTask(task.id,{status:e.cancelled?'cancelled':'failed',output,error:text(userError,1800),finished_at:new Date().toISOString()});
    refreshProjectStatus(task.project_id);
    store.event(e.cancelled?'task':'error',`${e.cancelled?'Tarefa cancelada':'Falha na tarefa'}: ${task.title}`);throw Object.assign(new Error(userError),{cancelled:e.cancelled});
  }).finally(()=>active.delete(task.id));
}
function orderedProjectTasks(projectId){
  const candidates=store.listTasks().filter(t=>t.project_id===projectId);
  const latest=new Map();
  for(const task of candidates){const key=`${task.title}\0${task.description}`;const old=latest.get(key);if(!old||task.created_at>old.created_at)latest.set(key,task);}
  const rank=t=>/arquitetura|architecture|critérios/i.test(t.title)?0:/revis|qualidade|qa/i.test(t.title)?2:1;
  return [...latest.values()].filter(t=>['pending','queued','failed','cancelled'].includes(t.status)).sort((a,b)=>rank(a)-rank(b)||a.created_at.localeCompare(b.created_at));
}
function runProject(projectId){
  if(projectRuns.has(projectId))return {started:false,message:'Este projeto já está em execução.'};
  if(active.size)return {started:false,message:'Outro agente está terminando uma tarefa.'};
  const todo=orderedProjectTasks(projectId);
  if(!todo.length)return {started:false,message:'Não há tarefas pendentes para executar.'};
  const run={cancelled:false};projectRuns.set(projectId,run);
  for(const task of todo)if(task.status==='pending')store.updateTask(task.id,{status:'queued',output:task.output,error:task.error,finished_at:null});
  run.promise=(async()=>{
    for(let i=0;i<todo.length;i++){
      if(run.cancelled)break;
      const task=todo[i];
      if(task.status==='failed'||task.status==='cancelled')store.updateTask(task.id,{status:'queued',output:task.output,error:'',finished_at:null});
      try{await executeTask(task);}catch{for(const next of todo.slice(i+1))if(store.getTask(next.id)?.status==='queued')store.updateTask(next.id,{status:'pending',output:next.output,error:next.error,finished_at:null});break;}
    }
  })().finally(()=>projectRuns.delete(projectId));
  return {started:true,count:todo.length};
}
async function api(req,res,url){
  if(['POST','PUT','PATCH','DELETE'].includes(req.method)){
    const origin=req.headers.origin;
    if(origin&&origin!==`http://127.0.0.1:${port}`&&origin!==`http://localhost:${port}`)return send(res,403,{error:'Origem não autorizada.'});
    if(!String(req.headers['content-type']||'').toLowerCase().startsWith('application/json'))return send(res,415,{error:'Use Content-Type application/json.'});
  }
  if(req.method==='GET'&&url.pathname==='/api/health'){
    refreshProvider();
    return send(res,200,{ok:true,app:'PIXEL AI STUDIO',version:'0.1.0',database:'SQLite',codex:{...codexState,executable:provider.configured?path.basename(provider.executable):null},...store.summary()});
  }
  if(req.method==='POST'&&url.pathname==='/api/provider/check'){refreshProvider(true);return send(res,202,{checking:codexState.checking});}
  if(req.method==='GET'&&url.pathname==='/api/summary')return send(res,200,{...store.summary(),projects:store.listProjects().map(p=>({...p,office_id:store.officeForProject(p.id)})),tasks:store.listTasks(),events:store.events(),agents:allAgents(),offices:store.offices(),resources:store.resources(),prompts:store.prompts()});
  if(req.method==='GET'&&url.pathname==='/api/offices')return send(res,200,{offices:store.offices(),agents:allAgents()});
  if(req.method==='GET'&&url.pathname==='/api/prospecting/config')return send(res,200,mapsIntegrationStatus());
  if(req.method==='GET'&&url.pathname==='/api/prospecting/searches')return send(res,200,{searches:store.listProspectingSearches().map(s=>({...s,source_metadata:parseJson(s.source_metadata),stats:parseJson(s.stats_json),results_count:store.countProspectingResults(s.id),place_ids:store.prospectingPlaceIds(s.id)}))});
  if(req.method==='POST'&&url.pathname==='/api/prospecting/searches'){
    const b=await body(req),intent=parseProspectingIntent(b);if(intent.missing.length)return send(res,422,{needs:intent.missing,message:intent.missing.includes('category')?'Informe o nicho que deseja pesquisar.':'Informe cidade, estado, país ou região.'});if(intent.unsupported_category)return send(res,422,{needs:['category'],message:'Não encontrei uma categoria OSM segura para esse nicho. Informe uma categoria conhecida ou um filtro explícito, como shop=florist.'});
    const requester=req.socket.remoteAddress||'unknown',now=Date.now(),recent=(prospectingRateLimits.get(requester)||[]).filter(time=>now-time<60_000);if(recent.length>=3)return send(res,429,{error:'Limite local de três pesquisas por minuto atingido. Aguarde um pouco antes de tentar novamente.'});recent.push(now);prospectingRateLimits.set(requester,recent);
    const id=randomUUID(),search=store.createProspectingSearch({id,query:intent.query,category:intent.category,region:intent.region,radius_km:intent.radius_km,max_results:intent.max_results,provider:prospectingProvider.id});
    const normalizedSearch={...intent,id},controller=new AbortController(),job={controller,status:'queued',phase:'Na fila do provedor OSM',received:0,results:[]};prospectingJobs.set(id,job);queueMicrotask(()=>runProspectingSearch(id,normalizedSearch,controller));
    return send(res,202,{search,progress:{status:'queued',phase:job.phase,received:0}});
  }
  const prospectingSearchMatch=url.pathname.match(/^\/api\/prospecting\/searches\/([\w-]+)$/);
  if(req.method==='GET'&&prospectingSearchMatch){const id=prospectingSearchMatch[1],search=store.getProspectingSearch(id);if(!search)return send(res,404,{error:'Pesquisa não encontrada.'});const job=prospectingJobs.get(id),results=job?.results||store.prospectingResults(id);return send(res,200,{search,provider:search.provider,metadata:job?.metadata||parseJson(search.source_metadata),stats:parseJson(search.stats_json),progress:job?{status:job.status,phase:job.phase,received:job.received,error:job.error||''}:{status:search.status,phase:search.status==='succeeded'?'Busca carregada do histórico':'histórico',received:results.length,error:search.error},results})}
  const prospectingResultsMatch=url.pathname.match(/^\/api\/prospecting\/searches\/([\w-]+)\/results$/);
  if(req.method==='GET'&&prospectingResultsMatch){const id=prospectingResultsMatch[1],search=store.getProspectingSearch(id);if(!search)return send(res,404,{error:'Pesquisa não encontrada.'});return send(res,200,{results:store.prospectingResults(id),source_metadata:parseJson(search.source_metadata),source:search.provider})}
  const prospectingCancelMatch=url.pathname.match(/^\/api\/prospecting\/searches\/([\w-]+)\/cancel$/);
  if(req.method==='POST'&&prospectingCancelMatch){const id=prospectingCancelMatch[1],job=prospectingJobs.get(id);if(!job||!['queued','running'].includes(job.status)||!job.controller)return send(res,409,{error:'Esta pesquisa não está em execução ou não pode ser cancelada agora.'});job.controller.abort();return send(res,202,{accepted:true})}
  if(req.method==='POST'&&url.pathname==='/api/offices'){
    const b=await body(req),name=text(b.name,70),specialty=text(b.specialty,500),names=Array.isArray(b.agents)?b.agents.slice(0,12).map(a=>text(a,70)).filter(Boolean):[];
    if(name.length<2||specialty.length<5||!names.length)return send(res,400,{error:'Informe nome, especialidade e ao menos um agente.'});
    const id=`office_${randomUUID()}`,rows=names.map(n=>({id:`${id}_${randomUUID().slice(0,8)}`,name:n,specialty}));store.createOffice({id,name,specialty},rows);return send(res,201,{...store.offices().find(o=>o.id===id)});
  }
  const officeDelete=url.pathname.match(/^\/api\/offices\/([\w-]+)$/);if(req.method==='DELETE'&&officeDelete){if(officeDelete[1]==='development')return send(res,400,{error:'O escritório base não pode ser removido.'});store.deleteOffice(officeDelete[1]);return send(res,200,{deleted:true});}
  if(req.method==='POST'&&url.pathname==='/api/resources'){
    const b=await body(req),title=text(b.title,120),kind=text(b.kind,32)||'nota',content=text(b.content,16000);if(title.length<2||content.length<3)return send(res,400,{error:'Informe o título e o conteúdo da referência.'});const item={id:randomUUID(),title,kind,content};store.addResource(item);return send(res,201,item);
  }
  const resourceDelete=url.pathname.match(/^\/api\/resources\/([\w-]+)$/);if(req.method==='DELETE'&&resourceDelete){store.deleteResource(resourceDelete[1]);return send(res,200,{deleted:true});}
  if(req.method==='POST'&&url.pathname==='/api/prompts'){
    const b=await body(req),title=text(b.title,120),kind=text(b.kind,32)||'projeto',content=text(b.content,12000);if(title.length<2||content.length<8)return send(res,400,{error:'Informe um título e um prompt com pelo menos 8 caracteres.'});const item={id:randomUUID(),title,kind,content};store.addPrompt(item);return send(res,201,item);
  }
  const promptDelete=url.pathname.match(/^\/api\/prompts\/([\w-]+)$/);if(req.method==='DELETE'&&promptDelete){store.deletePrompt(promptDelete[1]);return send(res,200,{deleted:true});}
  if(req.method==='GET'&&url.pathname==='/api/export')return send(res,200,store.export());
  if(req.method==='POST'&&url.pathname==='/api/projects'){
    const b=await body(req),name=text(b.name,100),brief=text(b.brief,12000),officeId=text(b.office_id,100);
    if(name.length<2||brief.length<8)return send(res,400,{error:'Informe um nome e um briefing com pelo menos 8 caracteres.'});
    const id=randomUUID(); const dir=path.join(workspaceRoot,id);fs.mkdirSync(dir,{recursive:false});
    const gitInit=spawnSync('git',['init','--quiet'],{cwd:dir,encoding:'utf8',windowsHide:true,timeout:5000});
    if(gitInit.status!==0)store.event('warning',`Git não foi inicializado para ${name}; o projeto ainda pode ser executado no modo isolado.`);
    const p=store.createProject({id,name,brief,workspace:path.relative(root,dir).replaceAll('\\','/')});const office=officeId&&officeId!=='auto'?store.offices().find(o=>o.id===officeId):officeForBrief(brief);if(office)store.assignProjectOffice(id,office.id);
    fs.mkdirSync(path.join(dir,'docs'),{recursive:true});
    return send(res,201,{...p,office_id:office?.id||'development',office_name:office?.name||'Desenvolvimento'});
  }
  const referenceMatch=url.pathname.match(/^\/api\/projects\/([\w-]+)\/references$/);
  if(req.method==='POST'&&referenceMatch){
    const project=store.getProject(referenceMatch[1]);if(!project)return send(res,404,{error:'Projeto não encontrado.'});
    const b=await body(req,4_000_000),name=text(b.name,180),mime=text(b.mime,40),data=typeof b.data==='string'?b.data:'';
    const allowed={'image/png':['.png',bytes=>bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))],'image/jpeg':['.jpg',bytes=>bytes[0]===255&&bytes[1]===216&&bytes[2]===255],'image/webp':['.webp',bytes=>bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'],'image/gif':['.gif',bytes=>['GIF87a','GIF89a'].includes(bytes.toString('ascii',0,6))],'application/pdf':['.pdf',bytes=>bytes.toString('ascii',0,5)==='%PDF-'],'text/plain':['.txt',bytes=>!bytes.includes(0)],'text/markdown':['.md',bytes=>!bytes.includes(0)],'text/csv':['.csv',bytes=>!bytes.includes(0)],'application/json':['.json',bytes=>{try{JSON.parse(bytes.toString('utf8'));return true}catch{return false}}]};
    if(!name||!allowed[mime]||data.length>3_600_000)return send(res,400,{error:'Envie uma imagem, PDF, TXT, Markdown, CSV ou JSON com até 2,5 MB.'});
    const bytes=Buffer.from(data,'base64'),[extension,verify]=allowed[mime];
    if(bytes.length<8||bytes.length>2_621_440||!verify(bytes))return send(res,400,{error:'O anexo está inválido ou ultrapassa 2,5 MB.'});
    const projectRoot=projectPath(project),dir=path.join(projectRoot,'references');fs.mkdirSync(dir,{recursive:true});const dirStat=fs.lstatSync(dir),realDir=fs.realpathSync(dir);if(!dirStat.isDirectory()||dirStat.isSymbolicLink()||!realDir.startsWith(projectRoot+path.sep))return send(res,400,{error:'A pasta de referências do projeto não é segura.'});const filename=`${randomUUID()}${extension}`;fs.writeFileSync(path.join(dir,filename),bytes,{flag:'wx'});
    store.event('project',`Referência anexada a ${project.name}: ${name}`);
    return send(res,201,{path:`references/${filename}`,name,size:bytes.length});
  }
  const filesMatch=url.pathname.match(/^\/api\/projects\/([\w-]+)\/files$/);
  if(req.method==='GET'&&filesMatch){
    const project=store.getProject(filesMatch[1]);if(!project)return send(res,404,{error:'Projeto não encontrado.'});
    const base=projectPath(project),files=[];
    function walk(dir,prefix=''){
      if(files.length>=500)return;
      for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
        if(entry.name==='.git'||entry.name==='node_modules'||entry.name.startsWith('.'))continue;
        const abs=path.join(dir,entry.name),relative=prefix?`${prefix}/${entry.name}`:entry.name;
        if(entry.isSymbolicLink())continue;
        if(entry.isDirectory())walk(abs,relative);else if(entry.isFile()){const stat=fs.statSync(abs);files.push({path:relative,size:stat.size,modified:stat.mtimeMs});}
        if(files.length>=500)break;
      }
    }
    walk(base);files.sort((a,b)=>a.path.localeCompare(b.path));
    const previewPath=files.some(f=>f.path.toLowerCase()==='dist/index.html')?'dist/index.html':files.some(f=>f.path.toLowerCase()==='index.html')?'index.html':null;
    return send(res,200,{files,hasPreview:Boolean(previewPath),previewPath});
  }
  if(req.method==='POST'&&url.pathname==='/api/plan'){
    const b=await body(req),project=store.getProject(text(b.project_id,80));
    if(!project)return send(res,404,{error:'Projeto não encontrado.'});
    let office=store.offices().find(o=>o.id===store.officeForProject(project.id));
    if((!office||office.id==='development')&&detectProjectType(project.brief)!=='development')office=officeForBrief(project.brief);
    if(office)store.assignProjectOffice(project.id,office.id);
    const plan=planFor(project.brief,office?.id||'development');return send(res,200,{project_id:project.id,office_id:office?.id,summary:`Identificamos ${detectProjectType(project.brief)==='visual'?'um projeto visual':detectProjectType(project.brief)==='video'?'um projeto de vídeo':detectProjectType(project.brief)==='mobile'?'um aplicativo mobile':'um projeto de desenvolvimento'} e sugerimos a equipe ${office?.name||'Desenvolvimento'}. Revise os agentes antes de aprovar.`,tasks:plan});
  }
  if(req.method==='POST'&&url.pathname==='/api/plan/approve'){
    const b=await body(req),project=store.getProject(text(b.project_id,80));
    if(!project)return send(res,404,{error:'Projeto não encontrado.'});
    const proposed=Array.isArray(b.tasks)?b.tasks.slice(0,12):[];
    if(!proposed.length)return send(res,400,{error:'Plano vazio.'});
    const ids=new Set(allAgents().map(a=>a.id));
    const existing=store.listTasks().filter(t=>t.project_id===project.id);
    const existingKeys=new Set(existing.map(t=>`${t.title}\0${t.description}`));
    const prepared=proposed.map(t=>{
      const title=text(t.title,160),description=text(t.description,6000),agent=ids.has(t.agent_id)?t.agent_id:'pixel_ceo';
      if(!title||!description)throw Object.assign(new Error('Cada tarefa precisa de título e descrição.'),{status:400});
      return {id:randomUUID(),project_id:project.id,title,description,agent_id:agent,key:`${title}\0${description}`};
    });
    const missing=prepared.filter(t=>!existingKeys.has(t.key));
    const tasks=[...existing.filter(t=>prepared.some(p=>p.key===`${t.title}\0${t.description}`)),...missing.map(({key,...t})=>store.createTask(t))];
    if(missing.length)store.event('plan',`Plano aprovado: ${project.name} (${missing.length} tarefas novas)`);
    return send(res,missing.length?201:200,{tasks,alreadyApproved:missing.length===0});
  }
  const projectRunMatch=url.pathname.match(/^\/api\/projects\/([\w-]+)\/run$/);
  if(req.method==='POST'&&projectRunMatch){
    const project=store.getProject(projectRunMatch[1]);if(!project)return send(res,404,{error:'Projeto não encontrado.'});
    if(!provider.configured)return send(res,503,{error:'Codex CLI não encontrado. Configure PIXEL_CODEX_PATH.'});
    if(!codexState.available)await refreshProvider(true);
    if(!codexState.available)return send(res,503,{error:codexState.message});
    const result=runProject(project.id);return send(res,result.started?202:409,result);
  }
  const downloadMatch=url.pathname.match(/^\/api\/projects\/([\w-]+)\/download$/);
  if(req.method==='GET'&&downloadMatch){
    const project=store.getProject(downloadMatch[1]);if(!project)return send(res,404,{error:'Projeto não encontrado.'});
    const cwd=projectPath(project),archive=path.join(os.tmpdir(),`pixel-${project.id}-${randomUUID()}.zip`);
    const zipped=spawnSync('tar.exe',['-a','-c','-f',archive,'-C',cwd,'--exclude=.git','.'],{encoding:'utf8',windowsHide:true,timeout:30000});
    if(zipped.error||zipped.status!==0||!fs.existsSync(archive))return send(res,500,{error:'Não foi possível compactar o projeto neste computador.'});
    res.writeHead(200,{'content-type':'application/zip','content-disposition':`attachment; filename="${project.id}.zip"`,'cache-control':'no-store','x-content-type-options':'nosniff'});
    const stream=fs.createReadStream(archive);stream.on('close',()=>fs.rmSync(archive,{force:true}));stream.on('error',()=>fs.rmSync(archive,{force:true}));stream.pipe(res);return;
  }
  const runMatch=url.pathname.match(/^\/api\/tasks\/([\w-]+)\/run$/);
  if(req.method==='POST'&&runMatch){
    const id=runMatch[1],task=store.getTask(id);
    if(!task)return send(res,404,{error:'Tarefa não encontrada.'});
    if(active.has(id)||task.status==='running')return send(res,409,{error:'Esta tarefa já está em execução.'});
    if(!['pending','failed','cancelled','queued'].includes(task.status))return send(res,409,{error:`Tarefas com estado ${task.status} não podem ser iniciadas novamente.`});
    if(!codexState.available)await refreshProvider(true);if(!codexState.available)return send(res,503,{error:codexState.message});
    executeTask(task).catch(()=>{});
    return send(res,202,{accepted:true,id,status:'running'});
  }
  const cancelMatch=url.pathname.match(/^\/api\/tasks\/([\w-]+)\/cancel$/);
  if(req.method==='POST'&&cancelMatch){
    const id=cancelMatch[1],entry=active.get(id);if(!entry)return send(res,409,{error:'A tarefa não está em execução ou ainda não pôde ser cancelada.'});
    for(const run of projectRuns.values())run.cancelled=true;
    entry.cancel?.();return send(res,202,{accepted:true,message:'Pedido de cancelamento enviado.'});
  }
  if(req.method==='GET'&&url.pathname==='/api/agents')return send(res,200,{agents:allAgents(),provider:{provider:provider.provider,configured:provider.configured}});
  return send(res,404,{error:'Rota não encontrada.'});
}
function previewFile(url,res){
  const match=url.pathname.match(/^\/preview\/([\w-]+)(?:\/(.*))?$/);if(!match)return false;
  const project=store.getProject(match[1]);if(!project){res.writeHead(404);res.end('Projeto não encontrado.');return true;}
  let relative='';try{relative=decodeURIComponent(match[2]||'');}catch{res.writeHead(400);res.end('Caminho inválido.');return true;}
  if(!relative||relative.endsWith('/'))relative+='index.html';
  const base=projectPath(project),target=path.resolve(base,relative);
  if(target!==base&&!target.startsWith(base+path.sep)){res.writeHead(403);res.end('Acesso negado.');return true;}
  let real,stat;try{real=fs.realpathSync(target);stat=fs.statSync(real);}catch{res.writeHead(404);res.end('Arquivo não encontrado.');return true;}
  if((real!==base&&!real.startsWith(base+path.sep))||!stat.isFile()){res.writeHead(404);res.end('Arquivo não encontrado.');return true;}
  const types={'.html':'text/html; charset=utf-8','.htm':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.ico':'image/x-icon','.txt':'text/plain; charset=utf-8','.md':'text/markdown; charset=utf-8','.csv':'text/csv; charset=utf-8','.pdf':'application/pdf'};
  const extension=path.extname(real).toLowerCase(),headers={'content-type':types[extension]||'application/octet-stream','x-content-type-options':'nosniff','cache-control':'no-store'};
  if(extension==='.html'||extension==='.htm')headers['content-security-policy']="sandbox allow-scripts allow-forms; default-src 'self' data: blob: https: http:; img-src 'self' data: blob: https: http:; style-src 'self' 'unsafe-inline' https: http:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https: http:; connect-src 'self' https: http: ws: wss:";
  res.writeHead(200,headers);fs.createReadStream(real).pipe(res);return true;
}
function staticFile(url,res){
  const pathname=url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname);
  const target=path.resolve(publicDir,'.'+pathname);
  if(target!==publicDir&&!target.startsWith(publicDir+path.sep)){res.writeHead(403);return res.end('Forbidden');}
  let stat;try{stat=fs.statSync(target);}catch{res.writeHead(404);return res.end('Not found');}
  if(!stat.isFile()){res.writeHead(404);return res.end('Not found');}
  const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};
  res.writeHead(200,{'content-type':types[path.extname(target)]||'application/octet-stream','x-content-type-options':'nosniff','cache-control':'no-store'});fs.createReadStream(target).pipe(res);
}
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://127.0.0.1');
    if(apiToken&&(url.pathname.startsWith('/api/')||url.pathname.startsWith('/preview/'))){
      const bearer=String(req.headers.authorization||'').match(/^Bearer\s+(.+)$/i)?.[1]||'';
      const supplied=Buffer.from(bearer),expected=Buffer.from(apiToken),download=url.pathname.match(/^\/api\/projects\/([\w-]+)\/download$/),signed=download&&req.method==='GET'&&signedDownloadValid(url,download[1]);
      if(!signed&&(supplied.length!==expected.length||!timingSafeEqual(supplied,expected)))return send(res,401,{error:'Acesso ao servidor do PIXEL não autorizado.'});
    }
    if(url.pathname.startsWith('/api/'))await api(req,res,url);else if(!previewFile(url,res))staticFile(url,res);
  }catch(e){if(!res.headersSent)send(res,e.status||500,{error:e.status?e.message:'Erro interno ao processar a solicitação.'});else res.destroy();if(!e.status)console.error('request failed:',e.message);}
});
const port=Number(process.env.PORT||8787);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT deve ser um inteiro entre 1 e 65535.');
server.on('error',e=>{if(e.code==='EADDRINUSE')console.error(`A porta ${port} já está ocupada. Defina PORT para outra porta livre.`);else console.error(e.message);process.exitCode=1;});
const host=process.env.PIXEL_HOST||(process.env.NODE_ENV==='production'?'0.0.0.0':'127.0.0.1');
server.listen(port,host,()=>console.log(`PIXEL AI STUDIO: http://${host}:${port}`));
function shutdown(){for(const [,child] of active)child.cancel?.();server.close(()=>{store.close();process.exit(0);});setTimeout(()=>process.exit(1),3000).unref();}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
