const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { initDatabase, projectsRepo, sessionsRepo } = require("./database");

function setupDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zeelin-db-test-"));
  const dbFile = path.join(dir, "test.db");
  const db = initDatabase(dbFile);
  return { db, dbFile, dir };
}

test("projects and sessions CRUD should work", () => {
  const { db } = setupDb();
  const projects = projectsRepo(db);
  const sessions = sessionsRepo(db);

  const project = projects.create({
    name: "demo",
    path: "/tmp/demo-project"
  });

  const allProjects = projects.list();
  assert.equal(allProjects.length, 1);
  assert.equal(allProjects[0].id, project.id);

  const session = sessions.create({
    projectId: project.id,
    title: "New Chat",
    provider: "claude",
    cwd: project.path
  });

  const list = sessions.listByProject(project.id);
  assert.equal(list.length, 1);
  assert.equal(list[0].id, session.id);
  assert.equal(list[0].status, "idle");

  sessions.updateState({ sessionId: session.id, status: "running" });
  sessions.updateProviderSessionId({ sessionId: session.id, providerSessionId: "sid-123" });

  const updated = sessions.getById(session.id);
  assert.equal(updated.status, "running");
  assert.equal(updated.provider_session_id, "sid-123");

  projects.remove(project.id);
  assert.equal(projects.list().length, 0);
  assert.equal(sessions.listByProject(project.id).length, 0);

  db.close();
});
