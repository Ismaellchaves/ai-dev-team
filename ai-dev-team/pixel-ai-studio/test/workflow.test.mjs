import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
async function freePort(){const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
async function launch(port,dataDir){
  const child=spawn(process.execPath,['src/server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),PIXEL_DATA_DIR:dataDir},stdio:['ignore','pipe','pipe']});
  let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
  const base=`http://127.0.0.1:${port}`;let ready=false;
  for(let i=0;i<60;i++){if(child.exitCode!==null)throw new Error(`Server encerrou: ${logs}`);try{const r=await fetch(`${base}/api/summary`);if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
  if(!ready){child.kill();throw new Error(`Servidor não iniciou: ${logs}`);}
  return {child,base};
}
async function stop(child){if(child.exitCode!==null)return;child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),new Promise(r=>setTimeout(r,2500))]);if(child.exitCode===null)child.kill('SIGKILL');}
async function post(base,url,value,headers={}){return fetch(base+url,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(value)});}

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
