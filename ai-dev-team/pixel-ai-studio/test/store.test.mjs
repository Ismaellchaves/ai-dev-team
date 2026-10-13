import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openStore } from '../src/store.mjs';

test('persiste projetos, tarefas, eventos e resumo em SQLite', t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pixel-store-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  let store=openStore(dir);
  const project=store.createProject({id:'project-1',name:'Loja Aurora',brief:'Sistema de estoque',workspace:'workspaces/project-1'});
  const task=store.createTask({id:'task-1',project_id:project.id,title:'Modelar catálogo',description:'Criar entidades',agent_id:'database'});
  assert.equal(store.summary().projects,1);
  assert.equal(store.summary().pending,1);
  store.updateTask(task.id,{status:'running',output:'log',error:'',started_at:store.now(),finished_at:null});
  assert.equal(store.summary().running,1);
  store.event('task','Execução iniciada');
  store.close();
  store=openStore(dir);
  assert.equal(store.recoverInterrupted(),1);
  assert.equal(store.getProject(project.id).name,'Loja Aurora');
  assert.equal(store.getTask(task.id).status,'failed');
  assert.match(store.getTask(task.id).error,/Servidor reiniciado/);
  assert.equal(store.events().length,3);
  assert.equal(store.export().tasks.length,1);
  store.close();
});

test('não aceita tarefa cujo projeto não existe', t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pixel-store-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const store=openStore(dir);
  assert.throws(()=>store.createTask({id:'task-1',project_id:'missing',title:'x',description:'x',agent_id:'qa'}));
  store.close();
});

test('fecha tentativas antigas duplicadas sem apagar seus logs', t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pixel-store-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const store=openStore(dir);
  store.createProject({id:'project-1',name:'Portal',brief:'Site local',workspace:'workspaces/project-1'});
  const old=store.createTask({id:'old',project_id:'project-1',title:'Criar página',description:'Página inicial',agent_id:'frontend'});
  store.updateTask(old.id,{status:'failed',output:'tentativa anterior',error:'falha antiga',started_at:store.now(),finished_at:store.now()});
  const current=store.createTask({id:'current',project_id:'project-1',title:'Criar página',description:'Página inicial',agent_id:'frontend'});
  store.updateTask(current.id,{status:'succeeded',output:'entrega final',error:'',started_at:store.now(),finished_at:store.now()});
  assert.equal(store.reconcileDuplicateAttempts(),1);
  assert.equal(store.getTask(old.id).status,'superseded');
  assert.equal(store.getTask(old.id).error,'falha antiga');
  store.close();
});
