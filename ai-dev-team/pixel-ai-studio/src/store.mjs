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
    CREATE INDEX IF NOT EXISTS tasks_project_idx ON tasks(project_id, created_at);`);
  const now = () => new Date().toISOString();
  const listProjects = db.prepare('SELECT * FROM projects ORDER BY created_at DESC');
  const listTasks = db.prepare('SELECT * FROM tasks ORDER BY created_at DESC');
  const insertProject = db.prepare('INSERT INTO projects(id,name,brief,workspace,created_at) VALUES(?,?,?,?,?)');
  const insertTask = db.prepare('INSERT INTO tasks(id,project_id,title,description,agent_id,created_at) VALUES(?,?,?,?,?,?)');
  const event = db.prepare('INSERT INTO events(kind,message,created_at) VALUES(?,?,?)');
  return {
    db, now, listProjects: () => listProjects.all(), listTasks: () => listTasks.all(),
    getProject: id => db.prepare('SELECT * FROM projects WHERE id=?').get(id),
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
    export: () => ({ projects: listProjects.all(), tasks: listTasks.all(), events: db.prepare('SELECT * FROM events ORDER BY id').all() }),
    close: () => db.close()
  };
}
