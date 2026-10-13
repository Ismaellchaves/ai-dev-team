import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function codexEnvironment(){
  const env={...process.env};
  if(process.platform==='win32'){
    const home=env.USERPROFILE||(env.HOMEDRIVE&&env.HOMEPATH?path.join(env.HOMEDRIVE,env.HOMEPATH):'');
    if(home&&fs.existsSync(home)){
      if(!env.HOME)env.HOME=home;
      const codexHome=path.join(home,'.codex');
      if(!env.CODEX_HOME&&fs.existsSync(codexHome))env.CODEX_HOME=codexHome;
    }
  }
  return env;
}

function commandDetails(env) {
  const explicit = env.PIXEL_CODEX_PATH;
  if (explicit) {
    if(process.platform==='win32'&&explicit.toLowerCase().endsWith('.ps1'))return {command:'powershell.exe',prefix:['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',explicit],shell:false,executable:explicit,configured:fs.existsSync(explicit)};
    return { command: explicit, prefix:[], shell: explicit.toLowerCase().endsWith('.cmd'),executable:explicit,configured:explicit==='codex'||fs.existsSync(explicit) };
  }
  if (process.platform === 'win32' && env.APPDATA) {
    const entry = path.join(env.APPDATA,'npm','node_modules','@openai','codex','bin','codex.js');
    if(fs.existsSync(entry))return {command:process.execPath,prefix:[entry],shell:false,executable:entry,configured:true};
    const script = path.join(env.APPDATA,'npm','codex.ps1');
    if (fs.existsSync(script)) return { command: 'powershell.exe', prefix: ['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script], shell: false,executable:script,configured:true };
  }
  return { command: 'codex', prefix: [], shell: false,executable:'codex (PATH)',configured:true };
}

export function providerConfig(env = process.env) {
  const details = commandDetails(env);
  return { provider: 'codex-cli', configured: details.configured, executable: details.executable,
    command: details.command, prefix: details.prefix ?? [], shell: details.shell };
}

export function checkCodex(config, cwd, timeoutMs = 12000) {
  return new Promise(resolve => {
    const isPs = config.command.toLowerCase().includes('powershell');
    const args = [...config.prefix, ...(isPs ? ['login','status'] : ['login','status'])];
    let output = '';
    let child;
    try { child = spawn(config.command,args,{cwd,env:codexEnvironment(),shell:config.shell,windowsHide:true}); }
    catch (e) { resolve({ available:false, message:e.message }); return; }
    const timer = setTimeout(() => { child.kill(); resolve({available:false,message:'Verificação do Codex excedeu o tempo limite.'}); },timeoutMs);
    child.stdout.on('data', chunk => { output += chunk.toString(); });
    child.stderr.on('data', chunk => { output += chunk.toString(); });
    child.on('error', e => { clearTimeout(timer); resolve({available:false,message:`Não foi possível iniciar o Codex: ${e.message}`}); });
    child.on('close', code => { clearTimeout(timer); resolve({available:code===0,message:code===0?'Codex autenticado.':'Codex não autenticado ou configuração indisponível.',exitCode:code}); });
  });
}

export function runCodex(config, cwd, prompt, { timeoutMs=10*60*1000, onOutput=()=>{} }={}) {
  let cancelProcess=()=>{};
  const execution=new Promise((resolve,reject) => {
    const args = config.prefix.length
      ? [...config.prefix,'exec','--json','--sandbox','workspace-write','--skip-git-repo-check','--cd',cwd,'-']
      : ['exec','--json','--sandbox','workspace-write','--skip-git-repo-check','--cd',cwd,'-'];
    let child;
    try { child=spawn(config.command,args,{cwd,env:codexEnvironment(),shell:config.shell,windowsHide:true,stdio:['pipe','pipe','pipe']}); }
    catch (e) { reject(e); return; }
    let output='', stderr='', settled=false, wasCancelled=false;
    const finish=(fn,value)=>{ if(settled)return; settled=true; clearTimeout(timer); fn(value); };
    cancelProcess=()=>{wasCancelled=true;child.kill();};
    const timer=setTimeout(()=>{ child.kill(); finish(reject,new Error('A execução do Codex excedeu o limite de 10 minutos.')); },timeoutMs);
    const scrub=s=>s.replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g,'[segredo ocultado]').replace(/\bBearer\s+\S+/gi,'Bearer [segredo ocultado]').replace(/(api[_-]?key\s*[=:]\s*)[^\s,;]+/gi,'$1[segredo ocultado]');
    child.stdout.on('data',chunk=>{ const s=scrub(chunk.toString()); output=(output+s).slice(-24000); onOutput(s); });
    child.stderr.on('data',chunk=>{ const s=scrub(chunk.toString()); stderr=(stderr+s).slice(-4000); onOutput(s); });
    child.on('error',e=>finish(reject,e));
    child.on('close',code=>wasCancelled ? finish(reject,Object.assign(new Error('Execução cancelada pelo usuário.'),{cancelled:true})) : code===0 ? finish(resolve,{output,stderr}) : finish(reject,new Error((stderr||output||`Codex terminou com código ${code}`).slice(-1800))));
    child.stdin.end(prompt);
  });
  execution.cancel=()=>cancelProcess();
  return execution;
}
