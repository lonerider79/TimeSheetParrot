// Repository layer. The renderer never talks to SQLite directly; all database
// operations are kept here and exposed through Electron IPC in main.cjs.
function createTimeEntriesRepository(database) {
  const taskSelect = `
    SELECT
      t.*,
      c.client_name,
      c.currency_code AS client_currency_code,
      c.default_rate AS client_rate,
      cc.currency_symbol AS client_currency_symbol,
      cc.currency_name AS client_currency_name,
      p.project_name,
      p.currency_code AS project_currency_code,
      p.default_rate AS project_rate,
      pc.currency_symbol AS project_currency_symbol,
      pc.currency_name AS project_currency_name,
      tc.currency_symbol AS task_currency_symbol,
      tc.currency_name AS task_currency_name
    FROM tasks t
    LEFT JOIN clients c
      ON c.client_id = t.client_id
    LEFT JOIN currencies cc
      ON cc.currency_code = c.currency_code
    LEFT JOIN projects p
      ON p.project_id = t.project_id
    LEFT JOIN currencies pc
      ON pc.currency_code = p.currency_code
    LEFT JOIN currencies tc
      ON tc.currency_code = t.currency_code
  `

  const entrySelect = `
    SELECT
      e.*,
      t.task_name,
      t.color AS task_color,
      t.billable,
      t.currency_code AS task_currency_code,
      t.rate AS task_rate,
      c.client_name,
      c.currency_code AS client_currency_code,
      c.default_rate AS client_rate,
      cc.currency_symbol AS client_currency_symbol,
      cc.currency_name AS client_currency_name,
      p.project_name,
      p.currency_code AS project_currency_code,
      p.default_rate AS project_rate,
      pc.currency_symbol AS project_currency_symbol,
      pc.currency_name AS project_currency_name,
      tc.currency_symbol AS task_currency_symbol,
      tc.currency_name AS task_currency_name
    FROM time_entries e
    JOIN tasks t
      ON t.task_id = e.task_id
    LEFT JOIN clients c
      ON c.client_id = t.client_id
    LEFT JOIN currencies cc
      ON cc.currency_code = c.currency_code
    LEFT JOIN projects p
      ON p.project_id = t.project_id
    LEFT JOIN currencies pc
      ON pc.currency_code = p.currency_code
    LEFT JOIN currencies tc
      ON tc.currency_code = t.currency_code
  `

  const statements = {
    tasks: database.prepare(`
      ${taskSelect}
      WHERE t.archived = 0
      ORDER BY t.task_name COLLATE NOCASE
    `),
    task: database.prepare(`
      ${taskSelect}
      WHERE t.task_id = ?
    `),
    addTask: database.prepare(`
      INSERT INTO tasks (
        task_name,
        color,
        client_id,
        project_id,
        billable,
        currency_code,
        rate
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    updateTask: database.prepare(`
      UPDATE tasks
      SET
        task_name = ?,
        color = ?,
        client_id = ?,
        project_id = ?,
        billable = ?,
        currency_code = ?,
        rate = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE task_id = ?
    `),
    archiveTask: database.prepare(`
      UPDATE tasks
      SET archived = 1, updated_at = CURRENT_TIMESTAMP
      WHERE task_id = ?
    `),

    clients: database.prepare(`
      SELECT
        c.*,
        cur.currency_symbol,
        cur.currency_name
      FROM clients c
      LEFT JOIN currencies cur
        ON cur.currency_code = c.currency_code
      WHERE c.archived = 0
      ORDER BY c.client_name COLLATE NOCASE
    `),
    client: database.prepare(`
      SELECT
        c.*,
        cur.currency_symbol,
        cur.currency_name
      FROM clients c
      LEFT JOIN currencies cur
        ON cur.currency_code = c.currency_code
      WHERE c.client_id = ?
    `),
    addClient: database.prepare(`
      INSERT INTO clients (client_name, currency_code, default_rate)
      VALUES (?, ?, ?)
    `),
    updateClient: database.prepare(`
      UPDATE clients
      SET
        client_name = ?,
        currency_code = ?,
        default_rate = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE client_id = ?
    `),
    archiveClient: database.prepare(`
      UPDATE clients
      SET archived = 1, updated_at = CURRENT_TIMESTAMP
      WHERE client_id = ?
    `),

    projects: database.prepare(`
      SELECT
        p.*,
        c.client_name,
        cur.currency_symbol,
        cur.currency_name
      FROM projects p
      LEFT JOIN clients c
        ON c.client_id = p.client_id
      LEFT JOIN currencies cur
        ON cur.currency_code = p.currency_code
      WHERE p.archived = 0
      ORDER BY p.project_name COLLATE NOCASE
    `),
    project: database.prepare(`
      SELECT
        p.*,
        c.client_name,
        cur.currency_symbol,
        cur.currency_name
      FROM projects p
      LEFT JOIN clients c
        ON c.client_id = p.client_id
      LEFT JOIN currencies cur
        ON cur.currency_code = p.currency_code
      WHERE p.project_id = ?
    `),
    addProject: database.prepare(`
      INSERT INTO projects (
        project_name,
        client_id,
        currency_code,
        default_rate
      ) VALUES (?, ?, ?, ?)
    `),
    updateProject: database.prepare(`
      UPDATE projects
      SET
        project_name = ?,
        client_id = ?,
        currency_code = ?,
        default_rate = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE project_id = ?
    `),
    archiveProject: database.prepare(`
      UPDATE projects
      SET archived = 1, updated_at = CURRENT_TIMESTAMP
      WHERE project_id = ?
    `),

    currencies: database.prepare(`
      SELECT
        currency_code,
        currency_symbol,
        currency_name
      FROM currencies
      ORDER BY currency_name COLLATE NOCASE
    `),

    entriesRecent: database.prepare(`
      ${entrySelect}
      ORDER BY e.created_at DESC, e.time_entry_id DESC
      LIMIT ?
    `),
    entriesBetween: database.prepare(`
      ${entrySelect}
      WHERE e.deleted = 0
        AND e.started_at < ?
        AND COALESCE(e.ended_at, ?) >= ?
      ORDER BY e.started_at ASC
    `),
    running: database.prepare(`
      ${entrySelect}
      WHERE e.deleted = 0
        AND e.ended_at IS NULL
      ORDER BY e.started_at DESC
      LIMIT 1
    `),
    entry: database.prepare(`
      ${entrySelect}
      WHERE e.time_entry_id = ?
    `),
    start: database.prepare(`
      INSERT INTO time_entries (
        task_id,
        started_at,
        duration_seconds
      ) VALUES (?, ?, 0)
    `),
    stop: database.prepare(`
      UPDATE time_entries
      SET
        ended_at = ?,
        duration_seconds = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE time_entry_id = ?
        AND deleted = 0
    `),
    updateEntry: database.prepare(`
      UPDATE time_entries
      SET
        task_id = ?,
        started_at = ?,
        ended_at = ?,
        duration_seconds = ?,
        note = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE time_entry_id = ?
        AND deleted = 0
    `),
    deleteEntry: database.prepare(`
      UPDATE time_entries
      SET
        deleted = 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE time_entry_id = ?
    `),

    setting: database.prepare(`
      SELECT value
      FROM settings
      WHERE key = ?
    `),
    upsertSetting: database.prepare(`
      INSERT INTO settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key)
      DO UPDATE SET value = excluded.value
    `),
  }

  function effective(row) {
    if (!row) {
      return null
    }

    const useTaskCurrency = Boolean(row.task_currency_code)
    const useProjectCurrency = !useTaskCurrency && Boolean(row.project_currency_code)
    const useClientCurrency = !useTaskCurrency && !useProjectCurrency && Boolean(row.client_currency_code)

    return {
      ...row,
      billable: Boolean(row.billable),
      deleted: Boolean(row.deleted),
      effective_currency: useTaskCurrency
        ? row.task_currency_code
        : useProjectCurrency
          ? row.project_currency_code
          : useClientCurrency
            ? row.client_currency_code
            : 'USD',
      effective_currency_symbol: useTaskCurrency
        ? row.task_currency_symbol
        : useProjectCurrency
          ? row.project_currency_symbol
          : useClientCurrency
            ? row.client_currency_symbol
            : '$',
      effective_currency_name: useTaskCurrency
        ? row.task_currency_name
        : useProjectCurrency
          ? row.project_currency_name
          : useClientCurrency
            ? row.client_currency_name
            : 'US Dollar',
      effective_rate: useTaskCurrency
        ? row.task_rate ?? 0
        : useProjectCurrency
          ? row.project_rate ?? 0
          : row.client_rate ?? 0,
    }
  }

  function getEntry(timeEntryId) {
    return effective(statements.entry.get(timeEntryId))
  }

  function normalizeRate(value) {
    if (value === '' || value === null || value === undefined) {
      return null
    }

    return Number(value)
  }

  return {
    listTasks() {
      return statements.tasks.all().map(effective)
    },

    addTask(payload) {
      const result = statements.addTask.run(
        payload.task_name.trim(),
        payload.color || '#06b6d4',
        payload.client_id || null,
        payload.project_id || null,
        payload.billable ? 1 : 0,
        payload.currency_code || null,
        normalizeRate(payload.rate),
      )

      return effective(statements.task.get(result.lastInsertRowid))
    },

    updateTask(payload) {
      statements.updateTask.run(
        payload.task_name.trim(),
        payload.color || '#06b6d4',
        payload.client_id || null,
        payload.project_id || null,
        payload.billable ? 1 : 0,
        payload.currency_code || null,
        normalizeRate(payload.rate),
        payload.task_id,
      )

      return effective(statements.task.get(payload.task_id))
    },

    archiveTask(taskId) {
      return statements.archiveTask.run(taskId)
    },

    listClients() {
      return statements.clients.all().map(effective)
    },

    addClient(payload) {
      const result = statements.addClient.run(
        payload.client_name.trim(),
        payload.currency_code || 'USD',
        Number(payload.default_rate) || 0,
      )

      return effective(statements.client.get(result.lastInsertRowid))
    },

    updateClient(payload) {
      statements.updateClient.run(
        payload.client_name.trim(),
        payload.currency_code || 'USD',
        Number(payload.default_rate) || 0,
        payload.client_id,
      )

      return effective(statements.client.get(payload.client_id))
    },

    archiveClient(clientId) {
      return statements.archiveClient.run(clientId)
    },

    listProjects() {
      return statements.projects.all().map(effective)
    },

    addProject(payload) {
      const result = statements.addProject.run(
        payload.project_name.trim(),
        payload.client_id || null,
        payload.currency_code || 'USD',
        Number(payload.default_rate) || 0,
      )

      return effective(statements.project.get(result.lastInsertRowid))
    },

    updateProject(payload) {
      statements.updateProject.run(
        payload.project_name.trim(),
        payload.client_id || null,
        payload.currency_code || 'USD',
        Number(payload.default_rate) || 0,
        payload.project_id,
      )

      return effective(statements.project.get(payload.project_id))
    },

    archiveProject(projectId) {
      return statements.archiveProject.run(projectId)
    },

    listCurrencies() {
      return statements.currencies.all()
    },

    getRecentEntries(limit = 100) {
      return statements.entriesRecent.all(Number(limit)).map(effective)
    },

    getEntries(startIso, endIso) {
      return statements.entriesBetween
        .all(endIso, endIso, startIso)
        .map(effective)
    },

    getEntry(timeEntryId) {
      return getEntry(timeEntryId)
    },

    getRunning() {
      return effective(statements.running.get())
    },

    startTimer(taskId, startedAt) {
      const result = statements.start.run(taskId, startedAt)

      return getEntry(result.lastInsertRowid)
    },

    stopTimer(timeEntryId, endedAt, durationSeconds) {
      statements.stop.run(
        endedAt,
        Math.max(0, Math.round(durationSeconds)),
        timeEntryId,
      )

      return getEntry(timeEntryId)
    },

    updateTimeEntry(payload) {
      statements.updateEntry.run(
        payload.task_id,
        payload.started_at,
        payload.ended_at || null,
        Math.max(0, Math.round(Number(payload.duration_seconds) || 0)),
        payload.note || '',
        payload.time_entry_id,
      )

      return getEntry(payload.time_entry_id)
    },

    deleteTimeEntry(timeEntryId) {
      statements.deleteEntry.run(timeEntryId)

      return true
    },

    getSetting(key, fallback = null) {
      const row = statements.setting.get(key)

      if (!row) {
        return fallback
      }

      return parseSetting(row.value, fallback)
    },

    setSetting(key, value) {
      statements.upsertSetting.run(key, serializeSetting(value))

      return value
    },
  }
}

function serializeSetting(value) {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

function parseSetting(value, fallback) {
  try {
    return JSON.parse(value)
  } catch {
    return value ?? fallback
  }
}

module.exports = {
  createTimeEntriesRepository,
}
