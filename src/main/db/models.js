"use strict";

const DB_MODELS = {
  projects: {
    tableName: "projects",
    description: "工作区项目",
    columns: [
      { name: "id", type: "TEXT", primaryKey: true },
      { name: "name", type: "TEXT", notNull: true },
      { name: "path", type: "TEXT", notNull: true, unique: true },
      { name: "default_provider", type: "TEXT", notNull: true, default: "'claude'" },
      { name: "created_at", type: "TEXT", notNull: true },
      { name: "updated_at", type: "TEXT", notNull: true }
    ]
  },
  sessions: {
    tableName: "sessions",
    description: "会话与运行状态",
    columns: [
      { name: "id", type: "TEXT", primaryKey: true },
      { name: "project_id", type: "TEXT", notNull: true, references: { table: "projects", column: "id" } },
      { name: "title", type: "TEXT", notNull: true },
      { name: "provider", type: "TEXT", notNull: true },
      { name: "provider_session_id", type: "TEXT" },
      { name: "cwd", type: "TEXT", notNull: true },
      { name: "status", type: "TEXT", notNull: true },
      { name: "last_active_at", type: "TEXT", notNull: true },
      { name: "created_at", type: "TEXT", notNull: true },
      { name: "updated_at", type: "TEXT", notNull: true },
      { name: "is_archived", type: "INTEGER", notNull: true, default: 0 },
      { name: "archived_at", type: "TEXT" }
    ],
    indexes: [
      { name: "idx_sessions_project", columns: ["project_id"] },
      { name: "idx_sessions_provider_sid", columns: ["provider", "provider_session_id"] }
    ]
  },
  appSettings: {
    tableName: "app_settings",
    description: "应用设置键值",
    columns: [
      { name: "key", type: "TEXT", primaryKey: true },
      { name: "value", type: "TEXT", notNull: true },
      { name: "updated_at", type: "TEXT", notNull: true }
    ]
  },
  sessionArchives: {
    tableName: "session_archives",
    description: "已归档会话索引",
    columns: [
      { name: "session_id", type: "TEXT", primaryKey: true },
      { name: "provider", type: "TEXT", notNull: true, default: "'claude'" },
      { name: "project_id", type: "TEXT" },
      { name: "title", type: "TEXT" },
      { name: "cwd", type: "TEXT", notNull: true },
      { name: "archived_at", type: "TEXT", notNull: true },
      { name: "updated_at", type: "TEXT", notNull: true }
    ]
  }
};

function buildColumnSql(column) {
  const parts = [column.name, column.type];
  if (column.primaryKey) parts.push("PRIMARY KEY");
  if (column.notNull) parts.push("NOT NULL");
  if (column.unique) parts.push("UNIQUE");
  if (Object.prototype.hasOwnProperty.call(column, "default")) {
    parts.push(`DEFAULT ${column.default}`);
  }
  return parts.join(" ");
}

function buildCreateTableSql(model) {
  const columnSqlList = model.columns.map(buildColumnSql);
  const foreignKeys = model.columns
    .filter((column) => column.references)
    .map((column) => `FOREIGN KEY(${column.name}) REFERENCES ${column.references.table}(${column.references.column})`);
  const allDefinitions = [...columnSqlList, ...foreignKeys].join(",\n      ");
  return `CREATE TABLE IF NOT EXISTS ${model.tableName} (\n      ${allDefinitions}\n    );`;
}

function buildCreateIndexSql(model) {
  return (model.indexes || []).map((index) => {
    const columns = index.columns.join(", ");
    return `CREATE INDEX IF NOT EXISTS ${index.name} ON ${model.tableName}(${columns});`;
  });
}

function buildSchemaSql() {
  const statements = [];
  for (const model of Object.values(DB_MODELS)) {
    statements.push(buildCreateTableSql(model));
    statements.push(...buildCreateIndexSql(model));
  }
  return statements.join("\n\n");
}

function getModelByTableName(tableName) {
  return Object.values(DB_MODELS).find((model) => model.tableName === tableName) || null;
}

module.exports = {
  DB_MODELS,
  buildSchemaSql,
  getModelByTableName
};
