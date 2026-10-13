import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import handler from '../api/[...path].mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function harness(req){
  const res={statusCode:200,headers:{},body:null,setHeader(key,value){this.headers[key.toLowerCase()]=value},end(value){this.body=value;this.finished=true}};
  return {req,res};
}

test('build Vercel copia a interface para a pasta estática',async()=>{
  const {spawnSync}=await import('node:child_process');
  const result=spawnSync(process.execPath,['scripts/build-vercel.mjs'],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert.ok(fs.existsSync(path.join(root,'dist','index.html')));
  assert.ok(fs.existsSync(path.join(root,'dist','app.js')));
});

test('proxy Vercel encaminha API com token privado e sem expô-lo ao navegador',async t=>{
  const oldUrl=process.env.PIXEL_BACKEND_URL,oldToken=process.env.PIXEL_BACKEND_TOKEN,oldFetch=globalThis.fetch;
  t.after(()=>{if(oldUrl===undefined)delete process.env.PIXEL_BACKEND_URL;else process.env.PIXEL_BACKEND_URL=oldUrl;if(oldToken===undefined)delete process.env.PIXEL_BACKEND_TOKEN;else process.env.PIXEL_BACKEND_TOKEN=oldToken;globalThis.fetch=oldFetch;});
  process.env.PIXEL_BACKEND_URL='https://pixel-backend.example';process.env.PIXEL_BACKEND_TOKEN='a'.repeat(64);
  let upstream;
  globalThis.fetch=async(url,options)=>{upstream={url:String(url),options};return new Response(JSON.stringify({ok:true}),{status:200,headers:{'content-type':'application/json'}})};
  const {req,res}=harness({url:'/api/health',method:'GET',headers:{accept:'application/json',authorization:'Basic should-not-forward'}});
  await handler(req,res);
  assert.equal(res.statusCode,200);assert.deepEqual(JSON.parse(String(res.body)),{ok:true});
  assert.equal(new URL(upstream.url).pathname,'/api/health');
  assert.equal(upstream.options.headers.get('authorization'),`Bearer ${process.env.PIXEL_BACKEND_TOKEN}`);
  assert.equal(upstream.options.headers.has('origin'),false);
});

test('proxy gera link temporário assinado para o ZIP',async t=>{
  const oldUrl=process.env.PIXEL_BACKEND_URL,oldToken=process.env.PIXEL_BACKEND_TOKEN;
  t.after(()=>{if(oldUrl===undefined)delete process.env.PIXEL_BACKEND_URL;else process.env.PIXEL_BACKEND_URL=oldUrl;if(oldToken===undefined)delete process.env.PIXEL_BACKEND_TOKEN;else process.env.PIXEL_BACKEND_TOKEN=oldToken;});
  process.env.PIXEL_BACKEND_URL='https://pixel-backend.example';process.env.PIXEL_BACKEND_TOKEN='b'.repeat(64);
  const projectId='project-123';const {req,res}=harness({url:`/api/projects/${projectId}/download`,method:'GET',headers:{}});
  await handler(req,res);
  assert.equal(res.statusCode,302);
  const signed=new URL(res.headers.location);const expires=signed.searchParams.get('exp'),signature=signed.searchParams.get('sig');
  assert.equal(signed.pathname,`/api/projects/${projectId}/download`);
  assert.equal(signature,createHmac('sha256',process.env.PIXEL_BACKEND_TOKEN).update(`${projectId}.${expires}`).digest('hex'));
});

test('proxy falha com mensagem de configuração em vez de erro 500',async t=>{
  const oldUrl=process.env.PIXEL_BACKEND_URL,oldToken=process.env.PIXEL_BACKEND_TOKEN;
  t.after(()=>{if(oldUrl===undefined)delete process.env.PIXEL_BACKEND_URL;else process.env.PIXEL_BACKEND_URL=oldUrl;if(oldToken===undefined)delete process.env.PIXEL_BACKEND_TOKEN;else process.env.PIXEL_BACKEND_TOKEN=oldToken;});
  delete process.env.PIXEL_BACKEND_URL;delete process.env.PIXEL_BACKEND_TOKEN;
  const {req,res}=harness({url:'/api/health',method:'GET',headers:{}});
  await handler(req,res);
  assert.equal(res.statusCode,503);assert.match(String(res.body),/PIXEL_BACKEND_URL/);
});
