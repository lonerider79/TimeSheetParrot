// Secure renderer bridge. Only the small set of application operations below
// is exposed to the browser context.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('timesheetAPI', {
  app: {
    getInfo: () => ipcRenderer.invoke('app:getInfo'),
  },

  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    install: () => ipcRenderer.invoke('updater:install'),
    onStatus: callback => {
      const listener = (_, status) => callback(status)
      ipcRenderer.on('updater:status', listener)

      return () => {
        ipcRenderer.removeListener('updater:status', listener)
      }
    },
  },

  locales: {
    list: () => ipcRenderer.invoke('locales:list'),
    get: localeCode => ipcRenderer.invoke('locales:get', localeCode),
  },

  window: {
    hide: () => ipcRenderer.invoke('window:hide'),
    minimize: () => ipcRenderer.invoke('window:minimize'),
    openTimer: () => ipcRenderer.invoke('window:openTimer'),
    closeTimer: () => ipcRenderer.invoke('window:closeTimer'),
  },

  workspace: {
    initialize: () => ipcRenderer.invoke('workspace:initialize'),
    chooseDatabase: () => ipcRenderer.invoke('workspace:chooseDatabase'),
    import: filePath => ipcRenderer.invoke('workspace:import', filePath),
    continue: () => ipcRenderer.invoke('workspace:continue'),
    onProgress: callback => {
      const listener = (_, progress) => callback(progress)
      ipcRenderer.on('workspace:progress', listener)

      return () => {
        ipcRenderer.removeListener('workspace:progress', listener)
      }
    },
  },

  currencies: {
    list: () => ipcRenderer.invoke('currencies:list'),
  },

  tasks: {
    list: () => ipcRenderer.invoke('tasks:list'),
    add: payload => ipcRenderer.invoke('tasks:add', payload),
    update: payload => ipcRenderer.invoke('tasks:update', payload),
    archive: taskId => ipcRenderer.invoke('tasks:archive', taskId),
  },

  clients: {
    list: () => ipcRenderer.invoke('clients:list'),
    add: payload => ipcRenderer.invoke('clients:add', payload),
    update: payload => ipcRenderer.invoke('clients:update', payload),
    archive: clientId => ipcRenderer.invoke('clients:archive', clientId),
  },

  projects: {
    list: () => ipcRenderer.invoke('projects:list'),
    add: payload => ipcRenderer.invoke('projects:add', payload),
    update: payload => ipcRenderer.invoke('projects:update', payload),
    archive: projectId => ipcRenderer.invoke('projects:archive', projectId),
  },

  timer: {
    running: () => ipcRenderer.invoke('timer:running'),
    start: payload => ipcRenderer.invoke('timer:start', payload),
    stop: payload => ipcRenderer.invoke('timer:stop', payload),
  },

  timeEntries: {
    listRecent: limit => ipcRenderer.invoke('timeEntries:listRecent', limit),
    update: payload => ipcRenderer.invoke('timeEntries:update', payload),
    delete: timeEntryId => ipcRenderer.invoke('timeEntries:delete', timeEntryId),
    restart: taskId => ipcRenderer.invoke('timeEntries:restart', taskId),
  },

  timesheet: {
    get: payload => ipcRenderer.invoke('timesheet:get', payload),
    export: payload => ipcRenderer.invoke('timesheet:export', payload),
  },

  settings: {
    get: payload => ipcRenderer.invoke('settings:get', payload),
    set: payload => ipcRenderer.invoke('settings:set', payload),
  },
})
