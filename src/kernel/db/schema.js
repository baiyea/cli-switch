'use strict';

const DB_MODELS = {
  projects: {
    tableName: 'projects',
    description: '工作区项目',
    columns: [
      { name: 'id', type: 'TEXT', primaryKey: true, description: '项目主键 ID（UUID）' },
      { name: 'name', type: 'TEXT', notNull: true, description: '项目显示名称' },
      {
        name: 'path',
        type: 'TEXT',
        notNull: true,
        unique: true,
        description: '项目绝对路径（工作目录）',
      },
      {
        name: 'default_provider',
        type: 'TEXT',
        notNull: true,
        default: "'claude'",
        description: '项目默认 CLI 提供商',
      },
      { name: 'created_at', type: 'TEXT', notNull: true, description: '创建时间（ISO 字符串）' },
      {
        name: 'updated_at',
        type: 'TEXT',
        notNull: true,
        description: '最后更新时间（ISO 字符串）',
      },
    ],
  },
  sessions: {
    tableName: 'sessions',
    description: '会话与运行状态',
    columns: [
      { name: 'id', type: 'TEXT', primaryKey: true, description: '会话记录主键 ID（UUID）' },
      {
        name: 'project_id',
        type: 'TEXT',
        notNull: true,
        references: { table: 'projects', column: 'id' },
        description: '所属项目 ID',
      },
      { name: 'title', type: 'TEXT', notNull: true, description: '会话标题（展示名）' },
      {
        name: 'provider',
        type: 'TEXT',
        notNull: true,
        description: '会话来源 CLI（claude/codex/gemini）',
      },
      {
        name: 'provider_session_id',
        type: 'TEXT',
        notNull: true,
        description: 'CLI 原生会话 ID（与 provider 组成唯一键）',
      },
      {
        name: 'cwd',
        type: 'TEXT',
        notNull: true,
        default: "''",
        description: '兼容字段：历史会话工作目录（当前以 project.path 为准）',
      },
      {
        name: 'session_file_path',
        type: 'TEXT',
        description: '会话实体文件路径（如 *.jsonl/*.json）',
      },
      {
        name: 'status',
        type: 'TEXT',
        notNull: true,
        description: '当前状态（idle/running/exited）',
      },
      {
        name: 'sort_order',
        type: 'INTEGER',
        notNull: true,
        default: 0,
        description: '会话手动排序权重（同项目内越大越靠前）',
      },
      {
        name: 'title_source',
        type: 'TEXT',
        notNull: true,
        default: "'auto'",
        description: '标题来源（auto=系统占位，derived=自动提取，manual=用户手动命名）',
      },
      {
        name: 'last_active_at',
        type: 'TEXT',
        notNull: true,
        description: '最近活跃时间（ISO 字符串）',
      },
      { name: 'created_at', type: 'TEXT', notNull: true, description: '创建时间（ISO 字符串）' },
      {
        name: 'updated_at',
        type: 'TEXT',
        notNull: true,
        description: '最后更新时间（ISO 字符串）',
      },
      {
        name: 'is_archived',
        type: 'INTEGER',
        notNull: true,
        default: 0,
        description: '是否已归档（0=否，1=是）',
      },
      { name: 'archived_at', type: 'TEXT', description: '归档时间（ISO 字符串）' },
    ],
    indexes: [
      { name: 'idx_sessions_project', columns: ['project_id'] },
      {
        name: 'idx_sessions_provider_sid_unique',
        columns: ['provider', 'provider_session_id'],
        unique: true,
      },
    ],
  },
  appSettings: {
    tableName: 'app_settings',
    description: '应用设置键值',
    columns: [
      { name: 'key', type: 'TEXT', primaryKey: true, description: '设置项键名' },
      { name: 'value', type: 'TEXT', notNull: true, description: '设置项值（JSON 字符串）' },
      {
        name: 'updated_at',
        type: 'TEXT',
        notNull: true,
        description: '最后更新时间（ISO 字符串）',
      },
    ],
  },
  imSessionBindings: {
    tableName: 'im_session_bindings',
    description: 'IM 私聊到会话的绑定',
    columns: [
      { name: 'id', type: 'TEXT', primaryKey: true, description: '绑定主键 ID' },
      { name: 'platform', type: 'TEXT', notNull: true, description: 'IM 平台' },
      { name: 'im_user_id', type: 'TEXT', notNull: true, description: 'IM 用户 ID' },
      { name: 'session_id', type: 'TEXT', notNull: true, description: '内部 session ID' },
      { name: 'session_db_id', type: 'INTEGER', notNull: true, description: '展示用 session 数据库 ID' },
      { name: 'created_at', type: 'TEXT', notNull: true, description: '创建时间（ISO 字符串）' },
      {
        name: 'updated_at',
        type: 'TEXT',
        notNull: true,
        description: '最后更新时间（ISO 字符串）',
      },
    ],
    indexes: [
      {
        name: 'idx_im_session_bindings_platform_user_unique',
        columns: ['platform', 'im_user_id'],
        unique: true,
      },
    ],
  },
  tokenUsageRuns: {
    tableName: 'token_usage_runs',
    description: 'Token 用量运行段',
    columns: [
      { name: 'id', type: 'TEXT', primaryKey: true, description: '运行段主键 ID' },
      {
        name: 'project_id',
        type: 'TEXT',
        notNull: true,
        references: { table: 'projects', column: 'id' },
        description: '所属项目 ID',
      },
      {
        name: 'session_id',
        type: 'TEXT',
        notNull: true,
        references: { table: 'sessions', column: 'id' },
        description: '所属会话记录 ID',
      },
      { name: 'provider', type: 'TEXT', notNull: true, description: 'CLI 提供商' },
      {
        name: 'provider_session_id',
        type: 'TEXT',
        notNull: true,
        description: 'CLI 原生会话 ID',
      },
      {
        name: 'profile_id',
        type: 'TEXT',
        notNull: true,
        default: "''",
        description: 'Provider profile ID',
      },
      {
        name: 'profile_name',
        type: 'TEXT',
        notNull: true,
        default: "''",
        description: 'Provider profile 名称',
      },
      {
        name: 'model_name',
        type: 'TEXT',
        notNull: true,
        default: "''",
        description: '运行段模型名',
      },
      {
        name: 'api_base_host',
        type: 'TEXT',
        notNull: true,
        default: "''",
        description: 'API Base Host',
      },
      {
        name: 'env_fingerprint',
        type: 'TEXT',
        notNull: true,
        default: "''",
        description: '运行环境指纹',
      },
      {
        name: 'session_file_path',
        type: 'TEXT',
        notNull: true,
        default: "''",
        description: '会话文件路径',
      },
      {
        name: 'run_started_at',
        type: 'TEXT',
        notNull: true,
        description: '运行段开始时间',
      },
      { name: 'run_ended_at', type: 'TEXT', description: '运行段结束时间' },
      { name: 'created_at', type: 'TEXT', notNull: true, description: '创建时间' },
      { name: 'updated_at', type: 'TEXT', notNull: true, description: '最后更新时间' },
    ],
    indexes: [
      {
        name: 'idx_token_usage_runs_session',
        columns: ['provider', 'provider_session_id', 'run_started_at'],
      },
      { name: 'idx_token_usage_runs_project', columns: ['project_id', 'run_started_at'] },
      {
        name: 'idx_token_usage_runs_model',
        columns: ['provider', 'model_name', 'api_base_host'],
      },
    ],
  },
  tokenUsageSnapshots: {
    tableName: 'token_usage_snapshots',
    description: 'Token 用量运行段快照',
    columns: [
      {
        name: 'run_id',
        type: 'TEXT',
        primaryKey: true,
        references: { table: 'token_usage_runs', column: 'id' },
        description: '运行段 ID',
      },
      {
        name: 'file_mtime_ms',
        type: 'INTEGER',
        notNull: true,
        default: 0,
        description: '会话文件 mtime',
      },
      {
        name: 'file_size',
        type: 'INTEGER',
        notNull: true,
        default: 0,
        description: '会话文件大小',
      },
      { name: 'stats_ended_at', type: 'TEXT', description: '统计截止时间' },
      { name: 'input_tokens', type: 'INTEGER', notNull: true, default: 0, description: '输入 Token' },
      { name: 'output_tokens', type: 'INTEGER', notNull: true, default: 0, description: '输出 Token' },
      { name: 'cached_tokens', type: 'INTEGER', notNull: true, default: 0, description: '缓存 Token' },
      {
        name: 'reasoning_tokens',
        type: 'INTEGER',
        notNull: true,
        default: 0,
        description: 'Reasoning Token',
      },
      { name: 'tool_tokens', type: 'INTEGER', notNull: true, default: 0, description: '工具 Token' },
      { name: 'total_tokens', type: 'INTEGER', notNull: true, default: 0, description: '总 Token' },
      { name: 'rounds', type: 'INTEGER', notNull: true, default: 0, description: '轮次' },
      {
        name: 'source_missing',
        type: 'INTEGER',
        notNull: true,
        default: 0,
        description: '来源文件是否缺失',
      },
      {
        name: 'last_error',
        type: 'TEXT',
        notNull: true,
        default: "''",
        description: '最近错误信息',
      },
      { name: 'updated_at', type: 'TEXT', notNull: true, description: '最后更新时间' },
    ],
  },
};

function buildColumnSql(column) {
  const parts = [column.name, column.type];
  if (column.primaryKey) parts.push('PRIMARY KEY');
  if (column.notNull) parts.push('NOT NULL');
  if (column.unique) parts.push('UNIQUE');
  if (Object.prototype.hasOwnProperty.call(column, 'default')) {
    parts.push(`DEFAULT ${column.default}`);
  }
  return parts.join(' ');
}

function buildCreateTableSql(model) {
  const columnSqlList = model.columns.map(buildColumnSql);
  const foreignKeys = model.columns
    .filter((column) => column.references)
    .map(
      (column) =>
        `FOREIGN KEY(${column.name}) REFERENCES ${column.references.table}(${column.references.column})`,
    );
  const allDefinitions = [...columnSqlList, ...foreignKeys].join(',\n      ');
  return `CREATE TABLE IF NOT EXISTS ${model.tableName} (\n      ${allDefinitions}\n    );`;
}

function buildCreateIndexSql(model) {
  return (model.indexes || []).map((index) => {
    const columns = index.columns.join(', ');
    const kind = index.unique ? 'UNIQUE INDEX' : 'INDEX';
    return `CREATE ${kind} IF NOT EXISTS ${index.name} ON ${model.tableName}(${columns});`;
  });
}

function buildSchemaSql() {
  const statements = [];
  for (const model of Object.values(DB_MODELS)) {
    statements.push(buildCreateTableSql(model));
    statements.push(...buildCreateIndexSql(model));
  }
  return statements.join('\n\n');
}

function getModelByTableName(tableName) {
  return Object.values(DB_MODELS).find((model) => model.tableName === tableName) || null;
}

module.exports = {
  DB_MODELS,
  buildCreateTableSql,
  buildCreateIndexSql,
  buildSchemaSql,
  getModelByTableName,
};
