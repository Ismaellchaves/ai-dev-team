import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { createServer as createHttpServer } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
async function freePort(){const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
async function launch(port,dataDir,token='',extraEnv={}){
  const child=spawn(process.execPath,['src/server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),PIXEL_DATA_DIR:dataDir,PIXEL_API_TOKEN:token,...extraEnv},stdio:['ignore','pipe','pipe']});
  let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
  const base=`http://127.0.0.1:${port}`;let ready=false;
  for(let i=0;i<60;i++){if(child.exitCode!==null)throw new Error(`Server encerrou: ${logs}`);try{const r=await fetch(`${base}/api/summary`,{headers:token?{authorization:`Bearer ${token}`}:{}});if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
  if(!ready){child.kill();throw new Error(`Servidor não iniciou: ${logs}`);}
  return {child,base};
}
async function stop(child){if(child.exitCode!==null)return;child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),new Promise(r=>setTimeout(r,2500))]);if(child.exitCode===null)child.kill('SIGKILL');}
async function post(base,url,value,headers={}){return fetch(base+url,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(value)});}

test('cadastro idempotente dos 10 escritórios e provedor OSM padrão',async t=>{
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'pixel-offices-data-'));
  const port=await freePort();let server;
  t.after(async()=>{if(server)await stop(server.child);fs.rmSync(dataDir,{recursive:true,force:true});});
  server=await launch(port,dataDir);
  const initial=await (await fetch(server.base+'/api/summary')).json();
  const names=['Diretoria Executiva','Prospecção e Inteligência Comercial','Vendas e CRM','Atendimento e Relacionamento','Marketing e Estratégia Digital','Qualidade e Segurança','Administração e Finanças','Automação e Integrações','Pesquisa e Inteligência de Mercado','Customer Success e Pós-venda'];
  for(const name of names){const matching=initial.offices.filter(o=>o.name===name);assert.equal(matching.length,1,name);assert.ok(matching[0].director_agent_id);assert.ok(matching[0].agents.length>=6);assert.ok(matching[0].agents.every(a=>a.role&&a.instructions));}
  assert.ok(initial.offices.some(o=>o.id==='development'));
  assert.ok(initial.offices.filter(o=>o.name==='Desing UI/UIX').length<=1);
  const maps=await (await fetch(server.base+'/api/prospecting/config')).json();assert.equal(maps.ready,true);assert.equal(maps.provider_id,'overpass');assert.ok(maps.tileUrl.includes('tile.openstreetmap.org'));
  const missing=await post(server.base,'/api/prospecting/searches',{query:'pesquise negócios'});assert.equal(missing.status,422);
  const unsupported=await post(server.base,'/api/prospecting/searches',{query:'Encontre nicho sem mapeamento em Crateús'});assert.equal(unsupported.status,422);
  assert.deepEqual((await (await fetch(server.base+'/api/prospecting/searches')).json()).searches,[]);
  await stop(server.child);server=await launch(port,dataDir);
  const restarted=await (await fetch(server.base+'/api/summary')).json();assert.equal(restarted.offices.length,11);assert.equal(restarted.agents.filter(a=>a.office_id.startsWith('dept_')).length,69);
});

test('API pesquisa OSM por provedor configurável, deduplica e persiste o histórico',async t=>{
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'pixel-osm-data-'));
  let overpassQuery='';const fixture=createHttpServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;if(req.url.startsWith('/search')){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify([{lat:'-5.18',lon:'-40.67',boundingbox:['-5.19','-5.17','-40.68','-40.66'],osm_type:'relation',osm_id:501,display_name:'Crateús, Ceará, Brasil',name:'Crateús',type:'administrative'}]));return}if(req.url==='/interpreter'){overpassQuery=new URLSearchParams(raw).get('data');res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({elements:[{type:'node',id:11,lat:-5.18,lon:-40.67,tags:{name:'Barbearia Aurora',shop:'hairdresser',phone:'+55 88 99999-0000'}},{type:'node',id:11,lat:-5.18,lon:-40.67,tags:{name:'Barbearia Aurora duplicada',shop:'hairdresser'}},{type:'way',id:12,center:{lat:-5.181,lon:-40.671},tags:{name:'Barbearia Central',shop:'hairdresser',website:'https://example.test'}}]}));return}res.writeHead(404);res.end()});
  await new Promise(resolve=>fixture.listen(0,'127.0.0.1',resolve));const fixturePort=fixture.address().port,port=await freePort();let server;
  t.after(async()=>{if(server)await stop(server.child);await new Promise(resolve=>fixture.close(resolve));fs.rmSync(dataDir,{recursive:true,force:true});});
  const extra={PIXEL_OVERPASS_URL:`http://127.0.0.1:${fixturePort}/interpreter`,PIXEL_NOMINATIM_URL:`http://127.0.0.1:${fixturePort}/search`,PIXEL_OSM_TILE_URL:'https://tiles.example.test/{z}/{x}/{y}.png'};
  server=await launch(port,dataDir,'',extra);
  const created=await post(server.base,'/api/prospecting/searches',{query:'Encontre barbearias em Crateús'});assert.equal(created.status,202);const search=(await created.json()).search;
  let result;for(let i=0;i<60;i++){result=await(await fetch(`${server.base}/api/prospecting/searches/${search.id}`)).json();if(['succeeded','failed','cancelled'].includes(result.progress.status))break;await new Promise(resolve=>setTimeout(resolve,40))}
  assert.equal(result.progress.status,'succeeded');assert.match(overpassQuery,/shop.*hairdresser/);assert.equal(result.results.length,2);assert.equal(result.results[0].name,'Barbearia Aurora');assert.equal(result.results[0].phone,'+55 88 99999-0000');assert.equal(result.results[1].website,'https://example.test');assert.equal(result.metadata.provider,'overpass');assert.equal(result.metadata.qualified_count,0);
  const history=(await(await fetch(server.base+'/api/prospecting/searches')).json()).searches;assert.equal(history.length,1);assert.equal(history[0].results_count,2);
  await stop(server.child);server=await launch(port,dataDir,'',extra);
  const saved=await(await fetch(`${server.base}/api/prospecting/searches/${search.id}/results`)).json();assert.equal(saved.results.length,2);assert.equal(saved.results[0].id,'osm:node:11');assert.equal(saved.source_metadata.license,'ODbL');
});

test('API cria projeto, aprova plano e recupera tarefas após reiniciar',async t=>{
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'pixel-workflow-data-'));
  const port=await freePort();let server;let workspace;
  t.after(async()=>{if(server)await stop(server.child);if(workspace){const base=path.join(root,'workspaces');const target=path.resolve(base,workspace);if(path.dirname(target)===base&&fs.existsSync(target))fs.rmSync(target,{recursive:true,force:true});}fs.rmSync(dataDir,{recursive:true,force:true});});
  server=await launch(port,dataDir);
  const denied=await post(server.base,'/api/projects',{name:'Teste inválido',brief:'Briefing válido'}, {origin:'https://attacker.example'});
  assert.equal(denied.status,403);
  const created=await post(server.base,'/api/projects',{name:'Loja Aurora',brief:'Sistema de estoque para loja local'});
  assert.equal(created.status,201);
  const project=await created.json();workspace=project.id;
  assert.ok(fs.existsSync(path.join(root,'workspaces',workspace,'.git')));
  const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=';
  const reference=await post(server.base,`/api/projects/${project.id}/references`,{name:'referencia.png',mime:'image/png',data:png});
  assert.equal(reference.status,201);const referenceResult=await reference.json();assert.equal(referenceResult.name,'referencia.png');assert.match(referenceResult.path,/^references\/[-\w]+\.png$/);
  const invalidReference=await post(server.base,`/api/projects/${project.id}/references`,{name:'falsa.png',mime:'image/png',data:Buffer.from('not an image').toString('base64')});
  assert.equal(invalidReference.status,400);
  fs.writeFileSync(path.join(root,'workspaces',workspace,'index.html'),'<h1>Prévia de teste</h1>');
  const files=await (await fetch(`${server.base}/api/projects/${project.id}/files`)).json();
  assert.equal(files.hasPreview,true);assert.equal(files.previewPath,'index.html');assert.ok(files.files.some(file=>file.path==='index.html'));assert.ok(files.files.some(file=>file.path===referenceResult.path));
  const preview=await fetch(`${server.base}/preview/${project.id}/`);
  assert.equal(preview.status,200);assert.match(await preview.text(),/Prévia de teste/);
  const download=await fetch(`${server.base}/api/projects/${project.id}/download`);
  assert.equal(download.status,200);assert.equal(download.headers.get('content-type'),'application/zip');
  assert.deepEqual([...new Uint8Array(await download.arrayBuffer()).slice(0,2)],[0x50,0x4b]);
  const planRes=await post(server.base,'/api/plan',{project_id:project.id});
  assert.equal(planRes.status,200);const plan=await planRes.json();assert.ok(plan.tasks.length>=2);
  const approved=await post(server.base,'/api/plan/approve',{project_id:project.id,tasks:plan.tasks});
  assert.equal(approved.status,201);assert.equal((await approved.json()).tasks.length,plan.tasks.length);
  const duplicate=await post(server.base,'/api/plan/approve',{project_id:project.id,tasks:plan.tasks});
  assert.equal(duplicate.status,200);const duplicateResult=await duplicate.json();assert.equal(duplicateResult.alreadyApproved,true);assert.equal(duplicateResult.tasks.length,plan.tasks.length);
  await stop(server.child);server=await launch(port,dataDir);
  const restored=await (await fetch(server.base+'/api/summary')).json();
  assert.equal(restored.projects.length,1);assert.equal(restored.tasks.length,plan.tasks.length);
  assert.ok(restored.events.some(e=>e.message.includes('Plano aprovado')));
});

test('backend aceita apenas o proxy autenticado e libera ZIP por assinatura temporária',async t=>{
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'pixel-auth-data-'));
  const port=await freePort(),token='c'.repeat(64);let server;let workspace;
  t.after(async()=>{if(server)await stop(server.child);if(workspace){const base=path.join(root,'workspaces');const target=path.resolve(base,workspace);if(path.dirname(target)===base&&fs.existsSync(target))fs.rmSync(target,{recursive:true,force:true});}fs.rmSync(dataDir,{recursive:true,force:true});});
  server=await launch(port,dataDir,token);
  const denied=await fetch(`${server.base}/api/summary`);assert.equal(denied.status,401);
  const summary=await fetch(`${server.base}/api/summary`,{headers:{authorization:`Bearer ${token}`}});assert.equal(summary.status,200);
  const created=await fetch(`${server.base}/api/projects`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({name:'Arquivo seguro',brief:'Teste do link temporário para download'} )});
  assert.equal(created.status,201);workspace=(await created.json()).id;
  const blocked=await fetch(`${server.base}/api/projects/${workspace}/download`);assert.equal(blocked.status,401);
  const exp=Math.floor(Date.now()/1000)+60,sig=createHmac('sha256',token).update(`${workspace}.${exp}`).digest('hex');
  const download=await fetch(`${server.base}/api/projects/${workspace}/download?exp=${exp}&sig=${sig}`);
  assert.equal(download.status,200);assert.equal(download.headers.get('content-type'),'application/zip');
});
