import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export function openStore(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'pixel.sqlite'));
  db.exec(`PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, brief TEXT NOT NULL,
      workspace TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, description TEXT NOT NULL, agent_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', output TEXT NOT NULL DEFAULT '',
      error TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, started_at TEXT, finished_at TEXT
    );
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL,
      message TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS offices (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, specialty TEXT NOT NULL,
      created_at TEXT NOT NULL, director_agent_id TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS custom_agents (
      id TEXT PRIMARY KEY, office_id TEXT NOT NULL REFERENCES offices(id),
      name TEXT NOT NULL, specialty TEXT NOT NULL, role TEXT NOT NULL DEFAULT '',
      instructions TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS resources (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, kind TEXT NOT NULL,
      content TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS prompts (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, kind TEXT NOT NULL,
      content TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS project_offices (
      project_id TEXT PRIMARY KEY REFERENCES projects(id), office_id TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS prospecting_searches (
      id TEXT PRIMARY KEY, query TEXT NOT NULL, category TEXT NOT NULL,
      region TEXT NOT NULL, radius_km INTEGER, max_results INTEGER NOT NULL,
      provider TEXT NOT NULL DEFAULT 'overpass', source_metadata TEXT NOT NULL DEFAULT '{}', stats_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'queued', error TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL, started_at TEXT, finished_at TEXT
    );
    CREATE TABLE IF NOT EXISTS prospecting_place_ids (
      search_id TEXT NOT NULL REFERENCES prospecting_searches(id) ON DELETE CASCADE,
      place_id TEXT NOT NULL, position INTEGER NOT NULL,
      PRIMARY KEY(search_id,place_id)
    );
    CREATE TABLE IF NOT EXISTS prospecting_results (
      search_id TEXT NOT NULL REFERENCES prospecting_searches(id) ON DELETE CASCADE,
      source_id TEXT NOT NULL, position INTEGER NOT NULL, result_json TEXT NOT NULL,
      PRIMARY KEY(search_id,source_id)
    );
    CREATE INDEX IF NOT EXISTS tasks_project_idx ON tasks(project_id, created_at);
    CREATE INDEX IF NOT EXISTS prospecting_searches_created_idx ON prospecting_searches(created_at DESC);`);
  const officeColumns = new Set(db.prepare('PRAGMA table_info(offices)').all().map(c => c.name));
  if (!officeColumns.has('director_agent_id')) db.exec("ALTER TABLE offices ADD COLUMN director_agent_id TEXT NOT NULL DEFAULT ''");
  const agentColumns = new Set(db.prepare('PRAGMA table_info(custom_agents)').all().map(c => c.name));
  if (!agentColumns.has('role')) db.exec("ALTER TABLE custom_agents ADD COLUMN role TEXT NOT NULL DEFAULT ''");
  if (!agentColumns.has('instructions')) db.exec("ALTER TABLE custom_agents ADD COLUMN instructions TEXT NOT NULL DEFAULT ''");
  const searchColumns=new Set(db.prepare('PRAGMA table_info(prospecting_searches)').all().map(c=>c.name));
  if(!searchColumns.has('provider'))db.exec("ALTER TABLE prospecting_searches ADD COLUMN provider TEXT NOT NULL DEFAULT 'google_places'");
  if(!searchColumns.has('source_metadata'))db.exec("ALTER TABLE prospecting_searches ADD COLUMN source_metadata TEXT NOT NULL DEFAULT '{}'");
  if(!searchColumns.has('stats_json'))db.exec("ALTER TABLE prospecting_searches ADD COLUMN stats_json TEXT NOT NULL DEFAULT '{}'");
  db.exec('PRAGMA user_version = 3');
  const now = () => new Date().toISOString();
  const listProjects = db.prepare('SELECT * FROM projects ORDER BY created_at DESC');
  const listTasks = db.prepare('SELECT * FROM tasks ORDER BY created_at DESC');
  const insertProject = db.prepare('INSERT INTO projects(id,name,brief,workspace,created_at) VALUES(?,?,?,?,?)');
  const insertTask = db.prepare('INSERT INTO tasks(id,project_id,title,description,agent_id,created_at) VALUES(?,?,?,?,?,?)');
  const event = db.prepare('INSERT INTO events(kind,message,created_at) VALUES(?,?,?)');
  const listOffices = db.prepare('SELECT * FROM offices ORDER BY created_at');
  const listResources = db.prepare('SELECT * FROM resources ORDER BY created_at DESC');
  const listPrompts = db.prepare('SELECT * FROM prompts ORDER BY created_at DESC');
  return {
    db, now, listProjects: () => listProjects.all(), listTasks: () => listTasks.all(),
    getProject: id => db.prepare('SELECT * FROM projects WHERE id=?').get(id),
    officeForProject: id => db.prepare('SELECT office_id FROM project_offices WHERE project_id=?').get(id)?.office_id || 'development',
    offices: () => listOffices.all().map(o => ({...o, agents:db.prepare('SELECT * FROM custom_agents WHERE office_id=? ORDER BY rowid').all(o.id)})),
    createOffice: (o, agents) => { const insertOffice=db.prepare('INSERT INTO offices(id,name,specialty,created_at,director_agent_id) VALUES(?,?,?,?,?)');const insertAgent=db.prepare('INSERT INTO custom_agents(id,office_id,name,specialty,role,instructions) VALUES(?,?,?,?,?,?)');db.exec('BEGIN IMMEDIATE');try{insertOffice.run(o.id,o.name,o.specialty,now(),o.director_agent_id||'');for(const a of agents)insertAgent.run(a.id,o.id,a.name,a.specialty,a.role||'',a.instructions||'');event.run('office',`Escritório criado: ${o.name}`,now());db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e} },
    hasOffice: id => Boolean(db.prepare('SELECT 1 FROM offices WHERE id=?').get(id)),
    findOfficeByName: name => db.prepare('SELECT * FROM offices WHERE lower(name)=lower(?)').get(name),
    updateOfficeDirector: (id,agentId) => db.prepare('UPDATE offices SET director_agent_id=? WHERE id=?').run(agentId,id),
    updateOfficeSpecialty: (id,specialty) => db.prepare('UPDATE offices SET specialty=? WHERE id=?').run(specialty,id),
    updateCustomAgent: (id,fields) => db.prepare('UPDATE custom_agents SET role=?,specialty=?,instructions=? WHERE id=?').run(fields.role,fields.specialty,fields.instructions,id),
    deleteOffice: id => { db.prepare('DELETE FROM custom_agents WHERE office_id=?').run(id);db.prepare('DELETE FROM offices WHERE id=?').run(id); },
    createProspectingSearch: s => {db.prepare('INSERT INTO prospecting_searches(id,query,category,region,radius_km,max_results,provider,created_at) VALUES(?,?,?,?,?,?,?,?)').run(s.id,s.query,s.category,s.region,s.radius_km||null,s.max_results,s.provider||'overpass',now());return db.prepare('SELECT * FROM prospecting_searches WHERE id=?').get(s.id)},
    getProspectingSearch: id => db.prepare('SELECT * FROM prospecting_searches WHERE id=?').get(id),
    listProspectingSearches: () => db.prepare('SELECT * FROM prospecting_searches ORDER BY created_at DESC LIMIT 50').all(),
    updateProspectingSearch: (id,fields) => db.prepare('UPDATE prospecting_searches SET status=COALESCE(?,status),error=?,started_at=COALESCE(?,started_at),finished_at=?,source_metadata=COALESCE(?,source_metadata),stats_json=COALESCE(?,stats_json) WHERE id=?').run(fields.status||null,fields.error||'',fields.started_at||null,fields.finished_at||null,fields.source_metadata?JSON.stringify(fields.source_metadata):null,fields.stats?JSON.stringify(fields.stats):null,id),
    saveProspectingPlaceIds: (id,placeIds) => {const add=db.prepare('INSERT OR IGNORE INTO prospecting_place_ids(search_id,place_id,position) VALUES(?,?,?)');db.exec('BEGIN IMMEDIATE');try{placeIds.forEach((placeId,index)=>add.run(id,placeId,index));db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}},
    prospectingPlaceIds: id => db.prepare('SELECT place_id FROM prospecting_place_ids WHERE search_id=? ORDER BY position').all(id).map(r=>r.place_id),
    saveProspectingResults: (id,results) => {const add=db.prepare('INSERT OR IGNORE INTO prospecting_results(search_id,source_id,position,result_json) VALUES(?,?,?,?)');db.exec('BEGIN IMMEDIATE');try{results.forEach((item,index)=>add.run(id,item.id,index,JSON.stringify(item)));db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}},
    prospectingResults: id => db.prepare('SELECT result_json FROM prospecting_results WHERE search_id=? ORDER BY position').all(id).map(row=>JSON.parse(row.result_json)),
    countProspectingResults: id => db.prepare('SELECT count(*) n FROM prospecting_results WHERE search_id=?').get(id).n,
    assignProjectOffice: (projectId,officeId) => db.prepare('INSERT INTO project_offices(project_id,office_id) VALUES(?,?) ON CONFLICT(project_id) DO UPDATE SET office_id=excluded.office_id').run(projectId,officeId),
    resources: () => listResources.all(), addResource: r => {db.prepare('INSERT INTO resources VALUES(?,?,?,?,?)').run(r.id,r.title,r.kind,r.content,now());}, deleteResource: id => db.prepare('DELETE FROM resources WHERE id=?').run(id),
    prompts: () => listPrompts.all(), addPrompt: p => {db.prepare('INSERT INTO prompts VALUES(?,?,?,?,?)').run(p.id,p.title,p.kind,p.content,now());}, deletePrompt: id => db.prepare('DELETE FROM prompts WHERE id=?').run(id),
    updateProject: (id,status) => db.prepare('UPDATE projects SET status=? WHERE id=?').run(status,id),
    getTask: id => db.prepare('SELECT * FROM tasks WHERE id=?').get(id),
    createProject: p => { insertProject.run(p.id,p.name,p.brief,p.workspace,now()); event.run('project',`Projeto criado: ${p.name}`,now()); return db.prepare('SELECT * FROM projects WHERE id=?').get(p.id); },
    createTask: t => { insertTask.run(t.id,t.project_id,t.title,t.description,t.agent_id,now()); return db.prepare('SELECT * FROM tasks WHERE id=?').get(t.id); },
    updateTask: (id, fields) => { db.prepare('UPDATE tasks SET status=?, output=?, error=?, started_at=COALESCE(?,started_at), finished_at=? WHERE id=?').run(fields.status,fields.output,fields.error,fields.started_at ?? null,fields.finished_at,id); },
    event: (kind,message) => event.run(kind,message,now()),
    events: () => db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT 60').all(),
    recoverInterrupted: () => {
      const interrupted=db.prepare("SELECT id,title,status FROM tasks WHERE status IN ('running','queued')").all();
      const update=db.prepare("UPDATE tasks SET status=?,error=?,finished_at=? WHERE id=?");
      for(const task of interrupted){const wasRunning=task.status==='running';update.run(wasRunning?'failed':'pending',wasRunning?'Servidor reiniciado antes da conclusão; revise a saída e execute novamente.':'',now(),task.id);if(wasRunning)event.run('error',`Execução interrompida pela reinicialização: ${task.title}`,now());}
      return interrupted.length;
    },
    reconcileDuplicateAttempts: () => {
      const result=db.prepare(`UPDATE tasks SET status='superseded'
        WHERE status IN ('pending','queued','failed','cancelled') AND EXISTS(
          SELECT 1 FROM tasks completed WHERE completed.project_id=tasks.project_id
            AND completed.title=tasks.title AND completed.description=tasks.description
            AND completed.status='succeeded' AND completed.created_at>=tasks.created_at
        )`).run();
      if(result.changes)event.run('task',`${result.changes} tentativa(s) antiga(s) substituída(s) por entregas concluídas.`,now());
      return result.changes;
    },
    summary: () => ({ projects: db.prepare("SELECT count(*) n FROM projects WHERE status='active'").get().n,
      pending: db.prepare("SELECT count(*) n FROM tasks WHERE status IN ('pending','queued')").get().n,
      running: db.prepare("SELECT count(*) n FROM tasks WHERE status='running'").get().n,
      failed: db.prepare("SELECT count(*) n FROM tasks WHERE status='failed'").get().n }),
    export: () => ({ projects: listProjects.all(), tasks: listTasks.all(), events: db.prepare('SELECT * FROM events ORDER BY id').all(), offices:listOffices.all(), resources:listResources.all(), prompts:listPrompts.all() }),
    close: () => db.close()
  };
}
