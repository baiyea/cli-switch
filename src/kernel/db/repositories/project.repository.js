function createProjectsRepo({ getDatabase, now, genId }) {
  const conn = getDatabase();

  return {
    list() {
      return conn.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all();
    },
    getById(projectId) {
      return conn.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    },
    create({ name, path: projectPath }) {
      const timestamp = now();
      const project = {
        id: genId(),
        name,
        path: projectPath,
        default_provider: 'claude',
        created_at: timestamp,
        updated_at: timestamp,
      };
      conn
        .prepare(
          `INSERT OR REPLACE INTO projects (id, name, path, default_provider, created_at, updated_at)
         VALUES (@id, @name, @path, @default_provider, @created_at, @updated_at)`,
        )
        .run(project);
      return project;
    },
    remove(projectId) {
      conn.prepare('DELETE FROM sessions WHERE project_id = ?').run(projectId);
      return conn.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
    },
  };
}

module.exports = { createProjectsRepo };
