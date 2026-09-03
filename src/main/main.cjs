// Electron main process.
// This file owns application windows, the system tray, IPC handlers, locale
// discovery, workspace selection, and the SQLite repository lifecycle.
const { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Tray, shell } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const {
  createDatabase,
  getDatabasePath,
  importWorkspaceDatabase,
  openExistingDatabase,
} = require('./db.cjs')
const { createTimeEntriesRepository } = require('./repositories/timeEntriesRepository.cjs')
const { exportTimesheet } = require('./export.cjs')
const { autoUpdater } = require('electron-updater')

let mainWindow = null
let timerWindow = null
let workspaceWindow = null
let tray = null
let database = null
let repository = null
let localeFiles = new Map()
let currentLocale = 'en'
let updateCheckInProgress = false

const isDevelopment = !app.isPackaged
const rendererUrl = 'http://127.0.0.1:5173'
const rendererFile = path.join(__dirname, '../../dist/index.html')

function isAutoUpdateSupported() {
  if (!app.isPackaged) {
    return false
  }

  if (process.platform === 'win32' && process.env.PORTABLE_EXECUTABLE_FILE) {
    return false
  }

  if (process.platform === 'linux' && !process.env.APPIMAGE) {
    return false
  }

  return ['win32', 'darwin', 'linux'].includes(process.platform)
}

function sendUpdaterStatus(status) {
  BrowserWindow.getAllWindows().forEach((browserWindow) => {
    if (!browserWindow.isDestroyed()) {
      browserWindow.webContents.send('updater:status', status)
    }
  })
}

function setupAutoUpdater() {
  if (!isAutoUpdateSupported()) {
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    sendUpdaterStatus({ state: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    sendUpdaterStatus({
      state: 'available',
      version: info.version,
    })
  })

  autoUpdater.on('download-progress', (progress) => {
    sendUpdaterStatus({
      state: 'downloading',
      percent: Math.round(progress.percent),
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    sendUpdaterStatus({
      state: 'downloaded',
      version: info.version,
    })
  })

  autoUpdater.on('update-not-available', () => {
    updateCheckInProgress = false
    sendUpdaterStatus({ state: 'latest' })
  })

  autoUpdater.on('error', (error) => {
    updateCheckInProgress = false
    console.error('Automatic update check failed:', error)
    sendUpdaterStatus({ state: 'error' })
  })
}

async function checkForUpdates() {
  if (!isAutoUpdateSupported()) {
    return {
      supported: false,
      state: 'unsupported',
    }
  }

  if (updateCheckInProgress) {
    return {
      supported: true,
      state: 'checking',
    }
  }

  updateCheckInProgress = true

  try {
    await autoUpdater.checkForUpdates()

    return {
      supported: true,
      state: 'checking',
    }
  } catch (error) {
    updateCheckInProgress = false
    console.error('Manual update check failed:', error)
    sendUpdaterStatus({ state: 'error' })

    return {
      supported: true,
      state: 'error',
    }
  }
}

function scheduleAutomaticUpdateCheck() {
  if (!isAutoUpdateSupported()) {
    return
  }

  setTimeout(() => {
    checkForUpdates().catch((error) => {
      console.error('Automatic update check failed:', error)
    })
  }, 5000)
}

function getLocaleDirectory() {
  if (isDevelopment) {
    return path.join(__dirname, '../renderer/locales')
  }

  return path.join(process.resourcesPath, 'locales')
}

function scanLocaleFiles() {
  const directory = getLocaleDirectory()
  const discovered = new Map()

  if (!fs.existsSync(directory)) {
    console.warn(`Locale directory does not exist: ${directory}`)
    localeFiles = discovered
    return
  }

  for (const fileName of fs.readdirSync(directory)) {
    if (!fileName.toLowerCase().endsWith('.json')) {
      continue
    }

    const localeCode = path.basename(fileName, '.json')
    const filePath = path.join(directory, fileName)

    try {
      const translations = JSON.parse(fs.readFileSync(filePath, 'utf8'))

      if (!translations._meta) {
        console.warn(`Locale file has no _meta section: ${fileName}`)
        continue
      }

      discovered.set(localeCode, translations)
    } catch (error) {
      console.error(`Failed to read locale file ${fileName}:`, error)
    }
  }

  localeFiles = discovered

  if (!localeFiles.has('en')) {
    throw new Error('The required English locale file en.json was not found.')
  }
}

function getLocale(localeCode) {
  return localeFiles.get(localeCode) || localeFiles.get('en')
}

function translate(key) {
  const activeLocale = getLocale(currentLocale)
  const englishLocale = getLocale('en')

  return activeLocale?.[key] ?? englishLocale?.[key] ?? key
}

function updateMainLocale() {
  const savedLocale = repository?.getSetting('language', 'en') || 'en'

  currentLocale = localeFiles.has(savedLocale) ? savedLocale : 'en'
}

function getLocaleSummary() {
  return Array.from(localeFiles.entries())
    .map(([code, dictionary]) => ({
      code,
      name: dictionary._meta.name || code,
      nativeName: dictionary._meta.nativeName || dictionary._meta.name || code,
      direction: dictionary._meta.direction || 'ltr',
    }))
    .sort((first, second) => {
      if (first.code === 'en') {
        return -1
      }

      if (second.code === 'en') {
        return 1
      }

      return first.name.localeCompare(second.name)
    })
}

function loadRenderer(browserWindow, hash = '') {
  if (isDevelopment) {
    return browserWindow.loadURL(`${rendererUrl}${hash}`)
  }

  const options = hash ? { hash: hash.replace(/^#/, '') } : undefined

  return browserWindow.loadFile(rendererFile, options)
}

function makeIcon() {
  const imagePath = path.join(app.getAppPath(), 'assets', 'parrot.png')
  const image = nativeImage.createFromPath(imagePath)

  if (image.isEmpty()) {
    return nativeImage.createEmpty()
  }

  return image.resize({ width: 32, height: 32 })
}

function baseWindowOptions(extraOptions = {}) {
  return {
    backgroundColor: '#07111f',
    icon: makeIcon(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    ...extraOptions,
  }
}

function removeWindowMenu(browserWindow) {
  // We do not use Electron's default menu in this application. The renderer
  // provides the application navigation and controls instead.
  browserWindow.setMenu(null)
}

function createWorkspaceWindow() {
  workspaceWindow = new BrowserWindow(
    baseWindowOptions({
      width: 760,
      height: 500,
      minWidth: 680,
      minHeight: 500,
      resizable: false,
      maximizable: false,
      minimizable: false,
      show: false,
      title: translate('app.name'),
    }),
  )

  removeWindowMenu(workspaceWindow)
  loadRenderer(workspaceWindow, '#/workspace')

  workspaceWindow.once('ready-to-show', () => {
    workspaceWindow.show()
  })

  workspaceWindow.on('closed', () => {
    workspaceWindow = null
    if (database === null) app.quit() // If the workspace window is closed without any selection, exit the application.
  })
}

function createMainWindow() {
  mainWindow = new BrowserWindow(
    baseWindowOptions({
      width: 1220,
      height: 780,
      minWidth: 980,
      minHeight: 680,
      resizable: true,
      maximizable: true,
      minimizable: true,
      show: false,
      title: translate('app.name'),
    }),
  )
  // Intercept requests to open new windows and open them in the system browser instead
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url) // Opens in the default system browser
      return { action: 'deny' } // Prevents Electron from opening a new internal window
    }
    return { action: 'allow' }
  })
  removeWindowMenu(mainWindow)
  loadRenderer(mainWindow)

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.on('close', (event) => {
    if (!app.isQuitting && repository?.getSetting('minimizeToTray', true)) {
      event.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function createTimerWindow() {
  if (timerWindow && !timerWindow.isDestroyed()) {
    timerWindow.show()
    timerWindow.focus()
    return
  }

  timerWindow = new BrowserWindow(
    baseWindowOptions({
      width: 390,
      height: 250,
      resizable: false,
      maximizable: false,
      alwaysOnTop: true,
      frame: false,
      title: `${translate('app.name')} - ${translate('floating.timer')}`,
    }),
  )

  removeWindowMenu(timerWindow)
  loadRenderer(timerWindow, '#/timer')

  timerWindow.on('closed', () => {
    timerWindow = null
  })
}

function createTray() {
  tray = new Tray(makeIcon())
  tray.setToolTip(translate('app.name'))

  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: translate('tray.open'),
        click: () => {
          mainWindow?.show()
          mainWindow?.focus()
        },
      },
      {
        label: translate('tray.timer'),
        click: createTimerWindow,
      },
      {
        type: 'separator',
      },
      {
        label: translate('tray.quit'),
        click: () => {
          app.isQuitting = true
          app.quit()
        },
      },
    ]),
  )

  tray.on('double-click', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })
}

function recreateTray() {
  if (tray) {
    tray.destroy()
    tray = null
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setTitle(translate('app.name'))
  }

  if (timerWindow && !timerWindow.isDestroyed()) {
    timerWindow.setTitle(`${translate('app.name')} - ${translate('floating.timer')}`)
  }

  if (workspaceWindow && !workspaceWindow.isDestroyed()) {
    workspaceWindow.setTitle(translate('app.name'))
  }

  if (repository) {
    createTray()
  }
}

function setupIpc() {
  ipcMain.handle('app:getInfo', () => ({
    name: translate('app.name'),
    version: app.getVersion(),
    platform: process.platform,
  }))

  ipcMain.handle('updater:check', () => checkForUpdates())

  ipcMain.handle('updater:install', () => {
    if (!isAutoUpdateSupported()) {
      return { success: false, supported: false }
    }

    autoUpdater.quitAndInstall()

    return { success: true }
  })

  ipcMain.handle('locales:list', () => ({
    locales: getLocaleSummary(),
    currentLocale,
  }))

  ipcMain.handle('locales:get', (_, localeCode) => {
    return getLocale(localeCode)
  })

  ipcMain.handle('window:hide', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.hide()
  })

  ipcMain.handle('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  ipcMain.handle('window:closeTimer', () => {
    timerWindow?.close()
  })

  ipcMain.handle('window:openTimer', () => {
    createTimerWindow()
  })

  ipcMain.handle('workspace:initialize', () => {
    initializeWorkspace(true)

    return { success: true }
  })

  ipcMain.handle('workspace:continue', () => {
    finishWorkspace()

    return { success: true }
  })

  ipcMain.handle('workspace:chooseDatabase', async () => {
    const result = await dialog.showOpenDialog(workspaceWindow, {
      title: translate('workspace.browseTitle'),
      properties: ['openFile'],
      filters: [
        {
          name: translate('workspace.databaseFiles'),
          extensions: ['sqlite', 'db', 'sqlite3'],
        },
      ],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true }
    }

    return {
      canceled: false,
      filePath: result.filePaths[0],
    }
  })

  ipcMain.handle('workspace:import', async (_, sourcePath) => {
    return importWorkspace(sourcePath)
  })

  ipcMain.handle('tasks:list', () => repository.listTasks())
  ipcMain.handle('tasks:add', (_, payload) => repository.addTask(payload))
  ipcMain.handle('tasks:update', (_, payload) => repository.updateTask(payload))
  ipcMain.handle('tasks:archive', (_, taskId) => repository.archiveTask(taskId))

  ipcMain.handle('currencies:list', () => repository.listCurrencies())

  ipcMain.handle('clients:list', () => repository.listClients())
  ipcMain.handle('clients:add', (_, payload) => repository.addClient(payload))
  ipcMain.handle('clients:update', (_, payload) => repository.updateClient(payload))
  ipcMain.handle('clients:archive', (_, clientId) => repository.archiveClient(clientId))

  ipcMain.handle('projects:list', () => repository.listProjects())
  ipcMain.handle('projects:add', (_, payload) => repository.addProject(payload))
  ipcMain.handle('projects:update', (_, payload) => repository.updateProject(payload))
  ipcMain.handle('projects:archive', (_, projectId) => repository.archiveProject(projectId))

  ipcMain.handle('timer:running', () => repository.getRunning())
  ipcMain.handle('timer:start', (_, payload) => {
    return repository.startTimer(Number(payload.task_id), new Date().toISOString())
  })

  ipcMain.handle('timer:stop', (_, payload) => {
    const timeEntryId = payload.time_entry_id ?? payload.timeEntryId
    const durationSeconds = Number(payload.duration_seconds ?? payload.durationSeconds ?? 0)

    return repository.stopTimer(Number(timeEntryId), new Date().toISOString(), durationSeconds)
  })

  ipcMain.handle('timeEntries:listRecent', (_, limit) => {
    return repository.getRecentEntries(limit || 100)
  })

  ipcMain.handle('timeEntries:update', (_, payload) => {
    return repository.updateTimeEntry(payload)
  })

  ipcMain.handle('timeEntries:delete', (_, timeEntryId) => {
    return repository.deleteTimeEntry(Number(timeEntryId))
  })

  ipcMain.handle('timeEntries:restart', (_, taskId) => {
    return repository.startTimer(Number(taskId), new Date().toISOString())
  })

  ipcMain.handle('timesheet:get', (_, payload) => {
    return repository.getEntries(payload.startIso, payload.endIso)
  })

  ipcMain.handle('settings:get', (_, payload) => {
    return repository.getSetting(payload.key, payload.fallback)
  })

  ipcMain.handle('settings:set', (_, payload) => {
    if (payload.key === 'startWithWindows' && process.platform === 'win32') {
      app.setLoginItemSettings({
        openAtLogin: Boolean(payload.value),
      })
    }

    const value = repository.setSetting(payload.key, payload.value)

    if (payload.key === 'language') {
      currentLocale = localeFiles.has(payload.value) ? payload.value : 'en'
      recreateTray()
    }

    return value
  })

  ipcMain.handle('timesheet:export', async (_, payload) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: translate('export.dialogTitle'),
      defaultPath: payload.defaultPath,
      filters: [
        {
          name: translate('export.fileType'),
          extensions: ['xlsx'],
        },
      ],
    })

    if (result.canceled || !result.filePath) {
      return { canceled: true }
    }

    return exportTimesheet(result.filePath, payload.rows, payload.rangeLabel, payload.labels)
  })
}

function closeDatabase() {
  if (database) {
    database.close()
    database = null
  }

  repository = null
}

function initializeWorkspace(closeWindow) {
  closeDatabase()

  database = createDatabase(app.getPath('userData'))
  repository = createTimeEntriesRepository(database)
  updateMainLocale()

  if (closeWindow) {
    finishWorkspace()
  }
}

function importWorkspace(sourcePath) {
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    return {
      success: false,
      messageKey: 'workspace.invalidFile',
    }
  }

  closeDatabase()

  try {
    const result = importWorkspaceDatabase(app.getPath('userData'), sourcePath, (progress) => {
      workspaceWindow?.webContents.send('workspace:progress', progress)
    })

    if (!result.success) {
      initializeWorkspace(false)

      return {
        success: false,
        initializedNew: true,
        messageKey: 'workspace.invalidBackup',
      }
    }

    database = openExistingDatabase(app.getPath('userData'))
    repository = createTimeEntriesRepository(database)
    updateMainLocale()

    finishWorkspace()

    return { success: true }
  } catch (error) {
    console.error('Workspace import failed:', error)

    initializeWorkspace(false)

    return {
      success: false,
      initializedNew: true,
      messageKey: 'workspace.importFailed',
    }
  }
}

function finishWorkspace() {
  workspaceWindow?.close()

  if (!mainWindow) {
    createMainWindow()
  }

  if (!tray) {
    createTray()
  }
}

app.whenReady().then(() => {
  scanLocaleFiles()

  const databasePath = getDatabasePath(app.getPath('userData'))
  const hasDatabase = fs.existsSync(databasePath)

  setupIpc()
  setupAutoUpdater()

  if (hasDatabase) {
    try {
      database = openExistingDatabase(app.getPath('userData'))
      repository = createTimeEntriesRepository(database)
      updateMainLocale()
      createMainWindow()
      createTray()
    } catch (error) {
      console.error('Unable to open existing database:', error)
      closeDatabase()
      currentLocale = 'en'
      createWorkspaceWindow()
    }
  } else {
    currentLocale = 'en'
    createWorkspaceWindow()
  }

  scheduleAutomaticUpdateCheck()

  app.on('activate', () => {
    if (!mainWindow && repository) {
      createMainWindow()
      return
    }

    mainWindow?.show()
  })
})

app.on('before-quit', () => {
  app.isQuitting = true
  closeDatabase()
})

app.on('window-all-closed', (event) => {
  event.preventDefault()
})
