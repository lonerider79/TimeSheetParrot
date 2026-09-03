// SQLite database creation, validation, and workspace import helpers.
const Database = require('better-sqlite3')
const fs = require('node:fs')
const path = require('node:path')

const REQUIRED_TABLES = {
  currencies: ['currency_code', 'currency_symbol', 'currency_name'],
  clients: ['client_id', 'client_name', 'currency_code', 'default_rate', 'archived'],
  projects: [
    'project_id',
    'project_name',
    'client_id',
    'currency_code',
    'default_rate',
    'archived',
  ],
  tasks: [
    'task_id',
    'task_name',
    'client_id',
    'project_id',
    'billable',
    'currency_code',
    'rate',
    'archived',
  ],
  time_entries: [
    'time_entry_id',
    'task_id',
    'started_at',
    'ended_at',
    'duration_seconds',
    'note',
    'deleted',
  ],
  settings: ['key', 'value'],
}

const DEFAULT_CURRENCIES = [
  ['USD', '$', 'US Dollar'],
  ['EUR', '€', 'Euro'],
  ['GBP', '£', 'British Pound'],
  ['INR', '₹', 'Indian Rupee'],
  ['AUD', 'A$', 'Australian Dollar'],
  ['CAD', 'C$', 'Canadian Dollar'],
  ['SGD', 'S$', 'Singapore Dollar'],
  ['AED', 'د.إ', 'UAE Dirham'],
  ['JPY', '¥', 'Japanese Yen'],
  ['CHF', 'CHF', 'Swiss Franc'],
  ['NZD', 'NZ$', 'New Zealand Dollar'],
  ['ZAR', 'R', 'South African Rand'],
]

function getDatabasePath(userDataPath) {
  return path.join(userDataPath, 'data', 'timesheet-parrot.sqlite')
}

function ensureDataDirectory(userDataPath) {
  const dataDirectory = path.join(userDataPath, 'data')

  fs.mkdirSync(dataDirectory, { recursive: true })

  return dataDirectory
}

function configureDatabase(database) {
  database.pragma('journal_mode = WAL')
  database.pragma('foreign_keys = ON')
}

function configureReadOnlyDatabase(database) {
  database.pragma('foreign_keys = ON')
}

function createSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS currencies (
      currency_code TEXT PRIMARY KEY,
      currency_symbol TEXT NOT NULL,
      currency_name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS clients (
      client_id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_name TEXT NOT NULL,
      currency_code TEXT NOT NULL DEFAULT 'USD'
        REFERENCES currencies(currency_code),
      default_rate REAL NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS projects (
      project_id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_name TEXT NOT NULL,
      client_id INTEGER REFERENCES clients(client_id) ON DELETE SET NULL,
      currency_code TEXT NOT NULL DEFAULT 'USD'
        REFERENCES currencies(currency_code),
      default_rate REAL NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tasks (
      task_id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#06b6d4',
      client_id INTEGER REFERENCES clients(client_id) ON DELETE SET NULL,
      project_id INTEGER REFERENCES projects(project_id) ON DELETE SET NULL,
      billable INTEGER NOT NULL DEFAULT 1,
      currency_code TEXT REFERENCES currencies(currency_code),
      rate REAL,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS time_entries (
      time_entry_id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      note TEXT NOT NULL DEFAULT '',
      deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_time_entries_started_at
      ON time_entries(started_at);

    CREATE INDEX IF NOT EXISTS idx_time_entries_task_id
      ON time_entries(task_id);

    CREATE INDEX IF NOT EXISTS idx_time_entries_deleted
      ON time_entries(deleted);

    CREATE INDEX IF NOT EXISTS idx_tasks_project_id
      ON tasks(project_id);

    CREATE INDEX IF NOT EXISTS idx_tasks_client_id
      ON tasks(client_id);

    CREATE INDEX IF NOT EXISTS idx_projects_client_id
      ON projects(client_id);
  `)
}

function seedCurrencies(database) {
  const statement = database.prepare(`
    INSERT OR IGNORE INTO currencies (
      currency_code,
      currency_symbol,
      currency_name
    ) VALUES (?, ?, ?)
  `)

  database.transaction(() => {
    for (const currency of DEFAULT_CURRENCIES) {
      statement.run(...currency)
    }
  })()
}

function seedSettings(database) {
  const statement = database.prepare(`
    INSERT OR IGNORE INTO settings (key, value)
    VALUES (?, ?)
  `)

  database.transaction(() => {
    statement.run('language', 'en')
    statement.run('theme', 'dark')
    statement.run('timeDisplayFormat', 'decimal')
    statement.run('minimizeToTray', 'true')
    statement.run('startWithWindows', 'false')
  })()
}

function seedTasks(database) {
  const taskCount = database.prepare('SELECT COUNT(*) AS count FROM tasks').get().count

  if (taskCount > 0) {
    return
  }

  const statement = database.prepare(`
    INSERT INTO tasks (task_name, color, billable)
    VALUES (?, ?, 1)
  `)

  database.transaction(() => {
    statement.run('Client work', '#06b6d4')
    statement.run('Development', '#8b5cf6')
    statement.run('Meetings', '#f59e0b')
    statement.run('Admin & planning', '#22c55e')
  })()
}

function createDatabase(userDataPath) {
  ensureDataDirectory(userDataPath)

  const database = new Database(getDatabasePath(userDataPath))

  configureDatabase(database)
  createSchema(database)
  seedCurrencies(database)
  seedSettings(database)
  seedTasks(database)

  return database
}

function openExistingDatabase(userDataPath) {
  const databasePath = getDatabasePath(userDataPath)

  if (!fs.existsSync(databasePath)) {
    return null
  }

  const database = new Database(databasePath)

  configureDatabase(database)

  return database
}

function validateWorkspaceDatabase(database) {
  const errors = []

  for (const [tableName, requiredColumns] of Object.entries(REQUIRED_TABLES)) {
    const table = database
      .prepare(
        `
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name = ?
      `,
      )
      .get(tableName)

    if (!table) {
      errors.push(`Missing table: ${tableName}`)
      continue
    }

    const columns = database.prepare(`PRAGMA table_info("${tableName}")`).all()

    const columnNames = new Set(columns.map((column) => column.name))

    for (const columnName of requiredColumns) {
      if (!columnNames.has(columnName)) {
        errors.push(`Missing column: ${tableName}.${columnName}`)
      }
    }
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
    }
  }

  try {
    const foreignKeyErrors = database.pragma('foreign_key_check')

    if (foreignKeyErrors.length > 0) {
      errors.push('Foreign-key validation failed.')
    }

    const invalidTimeEntries = database
      .prepare(
        `
        SELECT COUNT(*) AS count
        FROM time_entries
        WHERE duration_seconds < 0
           OR started_at IS NULL
      `,
      )
      .get().count

    if (invalidTimeEntries > 0) {
      errors.push('One or more time entries are invalid.')
    }

    const invalidClients = database
      .prepare(
        `
        SELECT COUNT(*) AS count
        FROM clients
        WHERE default_rate < 0
           OR default_rate IS NULL
      `,
      )
      .get().count

    if (invalidClients > 0) {
      errors.push('One or more client rates are invalid.')
    }

    const invalidProjects = database
      .prepare(
        `
        SELECT COUNT(*) AS count
        FROM projects
        WHERE default_rate < 0
           OR default_rate IS NULL
      `,
      )
      .get().count

    if (invalidProjects > 0) {
      errors.push('One or more project rates are invalid.')
    }
  } catch (error) {
    errors.push(error.message)
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

function removeDatabaseFiles(databasePath) {
  for (const suffix of ['', '-wal', '-shm']) {
    const filePath = `${databasePath}${suffix}`

    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { force: true })
    }
  }
}

function importWorkspaceDatabase(userDataPath, sourcePath, progressCallback) {
  ensureDataDirectory(userDataPath)

  progressCallback({
    percent: 5,
    messageKey: 'workspace.progressOpening',
  })

  const sourceDatabase = new Database(sourcePath, {
    readonly: true,
    fileMustExist: true,
  })

  configureReadOnlyDatabase(sourceDatabase)

  try {
    progressCallback({
      percent: 20,
      messageKey: 'workspace.progressValidating',
    })

    const validation = validateWorkspaceDatabase(sourceDatabase)

    if (!validation.valid) {
      return {
        success: false,
        validationErrors: validation.errors,
      }
    }

    const destinationPath = getDatabasePath(userDataPath)

    removeDatabaseFiles(destinationPath)

    const destinationDatabase = new Database(destinationPath)

    try {
      configureDatabase(destinationDatabase)
      createSchema(destinationDatabase)

      progressCallback({
        percent: 35,
        messageKey: 'workspace.progressCreating',
      })

      copyTable(sourceDatabase, destinationDatabase, 'currencies', [
        'currency_code',
        'currency_symbol',
        'currency_name',
      ])

      progressCallback({
        percent: 50,
        messageKey: 'workspace.progressCurrencies',
      })

      copyTable(sourceDatabase, destinationDatabase, 'clients', [
        'client_id',
        'client_name',
        'currency_code',
        'default_rate',
        'archived',
        'created_at',
        'updated_at',
      ])

      progressCallback({
        percent: 60,
        messageKey: 'workspace.progressClients',
      })

      copyTable(sourceDatabase, destinationDatabase, 'projects', [
        'project_id',
        'project_name',
        'client_id',
        'currency_code',
        'default_rate',
        'archived',
        'created_at',
        'updated_at',
      ])

      progressCallback({
        percent: 70,
        messageKey: 'workspace.progressProjects',
      })

      copyTable(sourceDatabase, destinationDatabase, 'tasks', [
        'task_id',
        'task_name',
        'color',
        'client_id',
        'project_id',
        'billable',
        'currency_code',
        'rate',
        'archived',
        'created_at',
        'updated_at',
      ])

      progressCallback({
        percent: 80,
        messageKey: 'workspace.progressTasks',
      })

      copyTable(sourceDatabase, destinationDatabase, 'time_entries', [
        'time_entry_id',
        'task_id',
        'started_at',
        'ended_at',
        'duration_seconds',
        'note',
        'deleted',
        'created_at',
        'updated_at',
      ])

      progressCallback({
        percent: 90,
        messageKey: 'workspace.progressEntries',
      })

      copyTable(sourceDatabase, destinationDatabase, 'settings', ['key', 'value'])

      progressCallback({
        percent: 95,
        messageKey: 'workspace.progressSettings',
      })

      seedCurrencies(destinationDatabase)
      seedSettings(destinationDatabase)

      const finalValidation = validateWorkspaceDatabase(destinationDatabase)

      if (!finalValidation.valid) {
        throw new Error(finalValidation.errors.join(' '))
      }

      progressCallback({
        percent: 100,
        messageKey: 'workspace.progressComplete',
      })

      return {
        success: true,
      }
    } finally {
      destinationDatabase.close()
    }
  } finally {
    sourceDatabase.close()
  }
}

function copyTable(sourceDatabase, destinationDatabase, tableName, columns) {
  const quotedColumns = columns.map((column) => `"${column}"`).join(', ')
  const rows = sourceDatabase.prepare(`SELECT ${quotedColumns} FROM "${tableName}"`).all()

  if (rows.length === 0) {
    return
  }

  const placeholders = columns.map(() => '?').join(', ')
  const insert = destinationDatabase.prepare(`
    INSERT INTO "${tableName}" (${quotedColumns})
    VALUES (${placeholders})
  `)

  destinationDatabase.transaction(() => {
    for (const row of rows) {
      insert.run(...columns.map((column) => row[column]))
    }
  })()
}

module.exports = {
  createDatabase,
  getDatabasePath,
  openExistingDatabase,
  validateWorkspaceDatabase,
  importWorkspaceDatabase,
}
