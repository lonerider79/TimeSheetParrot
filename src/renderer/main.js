// Renderer entry point.
// The renderer loads every screen from an HTML file, obtains locale files from
// the Electron main process, and uses the preload API for all native operations.
import Chart from 'chart.js/auto'

import { hydrateIcons, icon } from './icons.js'

import aboutTemplate from './views/about.html?raw'
import dashboardTemplate from './views/dashboard.html?raw'
import floatingTimerTemplate from './views/floating-timer.html?raw'
import settingsTemplate from './views/settings.html?raw'
import shellTemplate from './views/shell.html?raw'
import splashTemplate from './views/splash.html?raw'
import timerTemplate from './views/timer.html?raw'
import workspaceTemplate from './views/workspace.html?raw'

const api = window.timesheetAPI
const appElement = document.querySelector('#app')

let locale = 'en'
let localeDictionary = {}
let availableLocales = []
let theme = 'dark'
let timeDisplayFormat = 'decimal'
let tasks = []
let clients = []
let projects = []
let currencies = []
let runningEntry = null
let chart = null
let currentRoute = 'dashboard'
let dashboardPeriod = 'month'
let dashboardDate = new Date()
let dashboardGroup = 'task'
let dashboardClientFilter = ''
let dashboardProjectFilter = ''
let timerInterval = null
let runningCardInterval = null

function t(key) {
  return localeDictionary[key] ?? key
}

function escapeHtml(value) {
  const element = document.createElement('div')
  element.textContent = value ?? ''

  return element.innerHTML
}

async function loadLocales() {
  const result = await api.locales.list()

  availableLocales = result.locales
  locale = result.currentLocale || 'en'
  localeDictionary = await api.locales.get(locale)

  if (!localeDictionary) {
    locale = 'en'
    localeDictionary = await api.locales.get('en')
  }
}

async function setLocale(nextLocale) {
  const dictionary = await api.locales.get(nextLocale)

  if (!dictionary) {
    return false
  }

  locale = nextLocale
  localeDictionary = dictionary
  document.documentElement.lang = locale
  document.documentElement.dir = localeDictionary._meta?.direction || 'ltr'

  await api.settings.set({
    key: 'language',
    value: locale,
  })

  return true
}

function applyTranslations(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(element => {
    element.textContent = t(element.dataset.i18n)
  })

  root.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
    element.placeholder = t(element.dataset.i18nPlaceholder)
  })

  root.querySelectorAll('[data-i18n-title]').forEach(element => {
    element.title = t(element.dataset.i18nTitle)
  })

  root.querySelectorAll('[data-i18n-aria-label]').forEach(element => {
    element.setAttribute('aria-label', t(element.dataset.i18nAriaLabel))
  })
}

async function loadSettings() {
  theme = await api.settings.get({
    key: 'theme',
    fallback: 'dark',
  })

  timeDisplayFormat = await api.settings.get({
    key: 'timeDisplayFormat',
    fallback: 'decimal',
  })

  document.documentElement.dataset.theme = theme
}

async function setTheme(nextTheme) {
  theme = nextTheme
  document.documentElement.dataset.theme = theme

  await api.settings.set({
    key: 'theme',
    value: theme,
  })
}

async function loadCommonData() {
  tasks = await api.tasks.list()
  clients = await api.clients.list()
  projects = await api.projects.list()
  currencies = await api.currencies.list()
  runningEntry = await api.timer.running()
}

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.round(Number(totalSeconds) || 0))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60

  if (timeDisplayFormat === 'hms') {
    return [hours, minutes, remainder]
      .map(value => String(value).padStart(2, '0'))
      .join(':')
  }

  return `${(seconds / 3600).toFixed(2)}h`
}

function formatClock(totalSeconds) {
  const seconds = Math.max(0, Math.round(Number(totalSeconds) || 0))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60

  return [hours, minutes, remainder]
    .map(value => String(value).padStart(2, '0'))
    .join(':')
}

function formatDateTime(isoValue) {
  if (!isoValue) {
    return t('common.emptyValue')
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(isoValue))
}

function formatDateOnly(date) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
  }).format(date)
}

function getDayName(date, short = true) {
  return new Intl.DateTimeFormat(locale, {
    weekday: short ? 'short' : 'long',
  }).format(date)
}

function getMonthName(date) {
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
  }).format(date)
}

function getMonday(date) {
  const value = new Date(date)
  const day = value.getDay()
  const difference = day === 0 ? -6 : 1 - day

  value.setDate(value.getDate() + difference)
  value.setHours(0, 0, 0, 0)

  return value
}

function getEndOfDay(date) {
  const value = new Date(date)
  value.setHours(23, 59, 59, 999)

  return value
}

function getDashboardRange() {
  const selected = new Date(dashboardDate)

  if (dashboardPeriod === 'day') {
    const start = new Date(selected)
    start.setHours(0, 0, 0, 0)

    return {
      start,
      end: getEndOfDay(selected),
      label: formatDateOnly(selected),
    }
  }

  if (dashboardPeriod === 'month') {
    const start = new Date(selected.getFullYear(), selected.getMonth(), 1)
    const end = new Date(selected.getFullYear(), selected.getMonth() + 1, 0)
    end.setHours(23, 59, 59, 999)

    return {
      start,
      end,
      label: `${getMonthName(start)} ${start.getFullYear()}`,
    }
  }

  const start = new Date(selected.getFullYear(), 0, 1)
  const end = new Date(selected.getFullYear(), 11, 31, 23, 59, 59, 999)

  return {
    start,
    end,
    label: String(selected.getFullYear()),
  }
}

function getGroupValue(entry) {
  if (dashboardGroup === 'client') {
    return entry.client_name || t('common.noClient')
  }

  if (dashboardGroup === 'project') {
    return entry.project_name || t('common.noProject')
  }

  return entry.task_name
}

function entryMatchesFilters(entry) {
  if (dashboardClientFilter && String(entry.client_id || '') !== dashboardClientFilter) {
    return false
  }

  if (dashboardProjectFilter && String(entry.project_id || '') !== dashboardProjectFilter) {
    return false
  }

  return true
}

function calculateDailySeconds(entries, rangeStart, rangeEnd) {
  const daily = new Map()
  const groups = new Map()

  for (const entry of entries) {
    if (!entryMatchesFilters(entry)) {
      continue
    }

    const entryStart = new Date(entry.started_at)
    const entryEnd = entry.ended_at
      ? new Date(entry.ended_at)
      : new Date()

    const clippedStart = entryStart < rangeStart ? rangeStart : entryStart
    const clippedEnd = entryEnd > rangeEnd ? rangeEnd : entryEnd

    if (clippedEnd <= clippedStart) {
      continue
    }

    const groupName = getGroupValue(entry)
    const groupId = `${dashboardGroup}:${
      dashboardGroup === 'client'
        ? entry.client_id || 'none'
        : dashboardGroup === 'project'
          ? entry.project_id || 'none'
          : entry.task_id
    }`

    if (!groups.has(groupId)) {
      groups.set(groupId, {
        id: groupId,
        name: groupName,
        seconds: 0,
      })
    }

    let cursor = new Date(clippedStart)

    while (cursor < clippedEnd) {
      const dayStart = new Date(cursor)
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = getEndOfDay(dayStart)
      const segmentEnd = clippedEnd < dayEnd ? clippedEnd : dayEnd
      const seconds = Math.max(0, (segmentEnd - cursor) / 1000)
      const dayKey = dayStart.toISOString().slice(0, 10)

      if (!daily.has(dayKey)) {
        daily.set(dayKey, new Map())
      }

      const dayGroups = daily.get(dayKey)
      dayGroups.set(groupId, (dayGroups.get(groupId) || 0) + seconds)

      groups.get(groupId).seconds += seconds

      cursor = new Date(dayEnd.getTime() + 1)
    }
  }

  return {
    daily,
    groups,
  }
}

function createWeeklyRows(rangeStart, rangeEnd, daily, groups) {
  const weeks = []
  let cursor = getMonday(rangeStart)

  while (cursor <= rangeEnd) {
    const weekStart = new Date(cursor)
    const weekEnd = new Date(cursor)
    weekEnd.setDate(weekEnd.getDate() + 6)
    weekEnd.setHours(23, 59, 59, 999)

    const groupRows = Array.from(groups.values())
      .filter(group => {
        const firstDay = weekStart < rangeStart ? rangeStart : weekStart
        const lastDay = weekEnd > rangeEnd ? rangeEnd : weekEnd

        for (
          const date = new Date(firstDay);
          date <= lastDay;
          date.setDate(date.getDate() + 1)
        ) {
          const key = date.toISOString().slice(0, 10)
          const seconds = daily.get(key)?.get(group.id) || 0

          if (seconds > 0) {
            return true
          }
        }

        return false
      })
      .map(group => ({
        ...group,
        weekStart,
        weekEnd,
      }))

    weeks.push(...groupRows)
    cursor.setDate(cursor.getDate() + 7)
  }

  return weeks
}

function createElement(tag, className = '', text = '') {
  const element = document.createElement(tag)

  if (className) {
    element.className = className
  }

  if (text !== '') {
    element.textContent = text
  }

  return element
}

function appendIconButton(parent, iconName, title, handler, danger = false) {
  const button = createElement('button', `icon-btn ${danger ? 'text-red-500' : ''}`)
  button.title = title
  button.innerHTML = icon(iconName, 'w-4 h-4')
  button.addEventListener('click', handler)
  parent.appendChild(button)

  return button
}

function populateSelect(select, options, selectedValue = '') {
  select.replaceChildren()

  for (const optionData of options) {
    const option = document.createElement('option')
    option.value = optionData.value
    option.textContent = optionData.label
    option.selected = String(optionData.value) === String(selectedValue)
    select.appendChild(option)
  }
}

function populateCurrencySelect(select, selectedCode = 'USD', includeDefault = false) {
  const options = []

  if (includeDefault) {
    options.push({
      value: '',
      label: t('settings.useDefault'),
    })
  }

  options.push(
    ...currencies.map(currency => ({
      value: currency.currency_code,
      label: `${currency.currency_code} - ${currency.currency_symbol} - ${currency.currency_name}`,
    })),
  )

  populateSelect(select, options, selectedCode)
}

function populateTaskSelect(select, selectedTaskId) {
  populateSelect(
    select,
    tasks.map(task => ({
      value: task.task_id,
      label: task.task_name,
    })),
    selectedTaskId,
  )
}

async function startTimer(taskId) {
  if (runningEntry) {
    return runningEntry
  }

  runningEntry = await api.timer.start({
    task_id: Number(taskId),
  })

  return runningEntry
}

async function stopRunningTimer() {
  if (!runningEntry) {
    return null
  }

  const startedAt = new Date(runningEntry.started_at).getTime()
  const durationSeconds = Math.max(
    0,
    Math.round((Date.now() - startedAt) / 1000),
  )

  const stoppedEntry = await api.timer.stop({
    time_entry_id: Number(runningEntry.time_entry_id),
    duration_seconds: durationSeconds,
  })

  runningEntry = null

  return stoppedEntry
}

function renderRunningCard(container) {
  if (runningCardInterval) {
    window.clearInterval(runningCardInterval)
    runningCardInterval = null
  }

  container.replaceChildren()

  if (!runningEntry) {
    return
  }

  const card = createElement('div', 'card p-4 flex flex-wrap items-center justify-between gap-4')
  const left = createElement('div')
  const title = createElement('div', 'font-bold', runningEntry.task_name)
  const meta = createElement('div', 'muted text-xs mt-1', billingLabel(runningEntry))
  left.append(title, meta)

  const right = createElement('div', 'flex items-center gap-3')
  const elapsed = createElement('div', 'font-mono font-bold text-cyan-500')
  const stop = createElement('button', 'btn btn-danger')
  stop.innerHTML = `${icon('stop', 'w-4 h-4')}<span>${escapeHtml(t('timer.stopSave'))}</span>`
  stop.addEventListener('click', async () => {
    await stopRunningTimer()
    await loadCommonData()
    renderDashboard()
  })

  right.append(elapsed, stop)
  card.append(left, right)
  container.appendChild(card)

  const update = () => {
    if (!runningEntry || !document.body.contains(elapsed)) {
      return
    }

    const seconds = (Date.now() - new Date(runningEntry.started_at).getTime()) / 1000
    elapsed.textContent = formatClock(seconds)
  }

  update()
  runningCardInterval = window.setInterval(update, 1000)
}

function billingLabel(row) {
  if (!row.billable) {
    return t('common.nonBillable')
  }

  const rate = Number(row.effective_rate || 0).toFixed(2)

  return `${t('common.billable')} · ${row.effective_currency_symbol || ''}${rate} ${t('common.perHour')}`
}

function renderDashboardTable(entries, range) {
  const head = document.querySelector('#timesheet-head')
  const body = document.querySelector('#timesheet-body')
  const foot = document.querySelector('#timesheet-foot')

  head.replaceChildren()
  body.replaceChildren()
  foot.replaceChildren()

  const headerRow = document.createElement('tr')
  headerRow.className = 'border-b border-[var(--border)] text-left'

  const labelHeader = createElement('th', 'p-3 task-cell', t(`dashboard.${dashboardGroup}`))
  headerRow.appendChild(labelHeader)

  if (dashboardPeriod === 'day') {
    headerRow.appendChild(createElement('th', 'p-3 week-cell', getDayName(range.start)))
    headerRow.appendChild(createElement('th', 'p-3 week-cell', t('common.total')))
  } else {
    headerRow.appendChild(createElement('th', 'p-3 week-cell', t('dashboard.week')))

    for (let index = 0; index < 7; index += 1) {
      const day = new Date(2024, 0, 1 + index)
      headerRow.appendChild(
        createElement('th', 'p-3 week-cell', getDayName(day)),
      )
    }

    headerRow.appendChild(createElement('th', 'p-3 week-cell', t('common.total')))
  }

  head.appendChild(headerRow)

  const filteredEntries = entries.filter(entryMatchesFilters)
  const calculated = calculateDailySeconds(
    filteredEntries,
    range.start,
    range.end,
  )

  const rows = []

  if (dashboardPeriod === 'day') {
    for (const group of calculated.groups.values()) {
      const row = document.createElement('tr')
      row.className = 'border-b border-[var(--border)]'
      row.appendChild(createElement('td', 'p-3 font-medium', group.name))

      const key = range.start.toISOString().slice(0, 10)
      const seconds = calculated.daily.get(key)?.get(group.id) || 0

      row.appendChild(createElement('td', 'p-3', formatDuration(seconds)))
      row.appendChild(createElement('td', 'p-3 font-bold', formatDuration(seconds)))
      body.appendChild(row)
      rows.push({ name: group.name, seconds })
    }
  } else {
    const weeklyRows = createWeeklyRows(
      range.start,
      range.end,
      calculated.daily,
      calculated.groups,
    )

    for (const group of weeklyRows) {
      const row = document.createElement('tr')
      row.className = 'border-b border-[var(--border)]'
      row.appendChild(createElement('td', 'p-3 font-medium', group.name))

      row.appendChild(
        createElement(
          'td',
          'p-3 muted whitespace-nowrap',
          `${formatDateOnly(group.weekStart)} - ${formatDateOnly(group.weekEnd)}`,
        ),
      )

      let total = 0

      for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
        const day = new Date(group.weekStart)
        day.setDate(day.getDate() + dayIndex)
        const key = day.toISOString().slice(0, 10)
        const seconds = calculated.daily.get(key)?.get(group.id) || 0
        total += seconds

        row.appendChild(createElement('td', 'p-3', seconds ? formatDuration(seconds) : t('common.emptyValue')))
      }

      row.appendChild(createElement('td', 'p-3 font-bold', formatDuration(total)))
      body.appendChild(row)
      rows.push({ name: group.name, seconds: total })
    }
  }

  if (rows.length === 0) {
    const emptyRow = document.createElement('tr')
    const emptyCell = createElement('td', 'p-8 text-center muted')
    emptyCell.colSpan = dashboardPeriod === 'day' ? 3 : 10
    emptyCell.textContent = t('dashboard.empty')
    emptyRow.appendChild(emptyCell)
    body.appendChild(emptyRow)
  }

  const totalSeconds = rows.reduce((sum, row) => sum + row.seconds, 0)
  const totalRow = document.createElement('tr')
  totalRow.className = 'font-bold bg-[var(--panel-soft)]'
  const totalLabel = createElement('td', 'p-3', t('common.total'))
  totalRow.appendChild(totalLabel)

  if (dashboardPeriod === 'day') {
    totalRow.appendChild(createElement('td', 'p-3', formatDuration(totalSeconds)))
  } else {
    totalRow.appendChild(createElement('td', 'p-3', ''))
    for (let index = 0; index < 7; index += 1) {
      totalRow.appendChild(createElement('td', 'p-3', ''))
    }
  }

  totalRow.appendChild(createElement('td', 'p-3', formatDuration(totalSeconds)))
  foot.appendChild(totalRow)
}

function renderChart(entries, range) {
  const canvas = document.querySelector('#task-chart')

  if (!canvas) {
    return
  }

  if (chart) {
    chart.destroy()
    chart = null
  }

  const calculated = calculateDailySeconds(
    entries.filter(entryMatchesFilters),
    range.start,
    range.end,
  )

  const labels = Array.from(calculated.groups.values()).map(group => group.name)
  const data = Array.from(calculated.groups.values()).map(group => group.seconds / 3600)

  chart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [
        {
          data,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: getComputedStyle(document.documentElement).getPropertyValue('--text'),
          },
        },
      },
    },
  })
}

async function exportDashboardTimesheet() {
  const range = getDashboardRange()
  const entries = await api.timesheet.get({
    startIso: range.start.toISOString(),
    endIso: range.end.toISOString(),
  })

  const rows = entries
    .filter(entryMatchesFilters)
    .map(entry => ({
      date: new Intl.DateTimeFormat(locale).format(new Date(entry.started_at)),
      day: getDayName(new Date(entry.started_at), false),
      task: entry.task_name,
      client: entry.client_name || '',
      project: entry.project_name || '',
      billable: Boolean(entry.billable),
      currency: entry.effective_currency || '',
      currencySymbol: entry.effective_currency_symbol || '',
      rate: Number(entry.effective_rate || 0),
      seconds: Number(entry.duration_seconds || 0),
      note: entry.note || '',
    }))

  const labels = {
    appName: t('app.name'),
    sheetName: t('export.sheetName'),
    title: t('export.title'),
    date: t('export.date'),
    day: t('export.day'),
    task: t('export.task'),
    client: t('export.client'),
    project: t('export.project'),
    billable: t('export.billable'),
    currencyCode: t('export.currencyCode'),
    currencySymbol: t('export.currencySymbol'),
    rate: t('export.rate'),
    hours: t('export.hours'),
    amount: t('export.amount'),
    notes: t('export.notes'),
    yes: t('export.yes'),
    no: t('export.no'),
  }

  const result = await api.timesheet.export({
    rows,
    rangeLabel: range.label,
    labels,
    defaultPath: `Timesheet-Parrot-${range.label.replace(/[^a-zA-Z0-9_-]+/g, '-')}.xlsx`,
  })

  if (result?.filePath) {
    window.alert(t('export.completed'))
  }
}

function renderTaskCards() {
  const container = document.querySelector('#task-list')

  if (!container) {
    return
  }

  container.replaceChildren()

  if (tasks.length === 0) {
    container.appendChild(createElement('div', 'muted text-sm', t('common.noTasks')))
    return
  }

  for (const task of tasks) {
    const card = createElement('div', 'soft-card')
    const titleRow = createElement('div', 'flex items-center justify-between gap-3')
    const title = createElement('div', 'font-semibold', task.task_name)
    const color = createElement('span', 'w-3 h-3 rounded-full')
    color.style.backgroundColor = task.color
    titleRow.append(title, color)

    const meta = createElement(
      'div',
      'muted text-xs mt-2',
      `${task.client_name || t('common.noClient')} · ${task.project_name || t('common.noProject')}`,
    )

    const billing = createElement(
      'div',
      task.billable ? 'billing-pill inline-flex mt-3' : 'nonbillable-pill inline-flex mt-3',
      billingLabel(task),
    )

    card.append(titleRow, meta, billing)
    container.appendChild(card)
  }
}

async function renderDashboard() {
  currentRoute = 'dashboard'
  const view = document.querySelector('#view')
  view.innerHTML = dashboardTemplate
  applyTranslations(view)
  hydrateIcons(view)

  const periodSelect = document.querySelector('#period-select')
  const groupSelect = document.querySelector('#group-select')
  const clientFilter = document.querySelector('#client-filter')
  const projectFilter = document.querySelector('#project-filter')

  populateSelect(periodSelect, [
    { value: 'day', label: t('common.day') },
    { value: 'month', label: t('common.month') },
    { value: 'year', label: t('common.year') },
  ], dashboardPeriod)

  populateSelect(groupSelect, [
    { value: 'client', label: t('common.client') },
    { value: 'project', label: t('common.project') },
    { value: 'task', label: t('common.task') },
  ], dashboardGroup)

  populateSelect(
    clientFilter,
    [
      { value: '', label: t('common.allClients') },
      ...clients.map(client => ({
        value: client.client_id,
        label: client.client_name,
      })),
    ],
    dashboardClientFilter,
  )

  populateSelect(
    projectFilter,
    [
      { value: '', label: t('common.allProjects') },
      ...projects.map(project => ({
        value: project.project_id,
        label: project.project_name,
      })),
    ],
    dashboardProjectFilter,
  )

  periodSelect.addEventListener('change', () => {
    dashboardPeriod = periodSelect.value
    renderDashboard()
  })

  groupSelect.addEventListener('change', () => {
    dashboardGroup = groupSelect.value
    renderDashboard()
  })

  clientFilter.addEventListener('change', () => {
    dashboardClientFilter = clientFilter.value
    renderDashboard()
  })

  projectFilter.addEventListener('change', () => {
    dashboardProjectFilter = projectFilter.value
    renderDashboard()
  })

  document.querySelector('#period-prev').addEventListener('click', () => {
    if (dashboardPeriod === 'day') {
      dashboardDate.setDate(dashboardDate.getDate() - 1)
    } else if (dashboardPeriod === 'month') {
      dashboardDate.setMonth(dashboardDate.getMonth() - 1)
    } else {
      dashboardDate.setFullYear(dashboardDate.getFullYear() - 1)
    }

    renderDashboard()
  })

  document.querySelector('#period-next').addEventListener('click', () => {
    if (dashboardPeriod === 'day') {
      dashboardDate.setDate(dashboardDate.getDate() + 1)
    } else if (dashboardPeriod === 'month') {
      dashboardDate.setMonth(dashboardDate.getMonth() + 1)
    } else {
      dashboardDate.setFullYear(dashboardDate.getFullYear() + 1)
    }

    renderDashboard()
  })

  document.querySelector('#period-today').addEventListener('click', () => {
    dashboardDate = new Date()
    renderDashboard()
  })

  document.querySelector('#new-task').addEventListener('click', () => openTaskModal())
  document.querySelector('#manage-settings').addEventListener('click', () => navigate('settings'))
  document.querySelector('#export-btn').addEventListener('click', async () => {
    await exportDashboardTimesheet()
  })

  const range = getDashboardRange()
  document.querySelector('#range-label').textContent = range.label

  const entries = await api.timesheet.get({
    startIso: range.start.toISOString(),
    endIso: range.end.toISOString(),
  })

  renderRunningCard(document.querySelector('#running-card'))
  renderDashboardTable(entries, range)
  renderChart(entries, range)
  renderTaskCards()
}

function renderTimerScreen() {
  currentRoute = 'timer'
  const view = document.querySelector('#view')
  view.innerHTML = timerTemplate
  applyTranslations(view)
  hydrateIcons(view)

  populateTaskSelect(document.querySelector('#timer-select'), runningEntry?.task_id || tasks[0]?.task_id)
  updateTimerScreen()

  document.querySelector('#timer-start').addEventListener('click', async () => {
    const taskId = Number(document.querySelector('#timer-select').value)

    if (!taskId) {
      return
    }

    await startTimer(taskId)
    updateTimerScreen()
  })

  document.querySelector('#timer-stop').addEventListener('click', async () => {
    await stopRunningTimer()
    await loadCommonData()
    updateTimerScreen()
    renderEntryHistory()
  })

  document.querySelector('#floating-timer').addEventListener('click', () => {
    api.window.openTimer()
  })

  renderEntryHistory()
}

function updateTimerScreen() {
  const taskElement = document.querySelector('#timer-task')
  const displayElement = document.querySelector('#timer-display')
  const metaElement = document.querySelector('#timer-meta')
  const startButton = document.querySelector('#timer-start')
  const stopButton = document.querySelector('#timer-stop')

  if (!taskElement) {
    return
  }

  if (runningEntry) {
    taskElement.textContent = runningEntry.task_name
    metaElement.textContent = billingLabel(runningEntry)
    startButton.classList.add('hidden')
    stopButton.classList.remove('hidden')

    const seconds = (Date.now() - new Date(runningEntry.started_at).getTime()) / 1000
    displayElement.textContent = formatClock(seconds)
  } else {
    taskElement.textContent = t('timer.ready')
    metaElement.textContent = t('timer.selectPrompt')
    startButton.classList.remove('hidden')
    stopButton.classList.add('hidden')
    displayElement.textContent = '00:00:00'
  }

  if (timerInterval) {
    window.clearInterval(timerInterval)
  }

  if (runningEntry) {
    timerInterval = window.setInterval(() => {
      if (!runningEntry || currentRoute !== 'timer') {
        return
      }

      displayElement.textContent = formatClock(
        (Date.now() - new Date(runningEntry.started_at).getTime()) / 1000,
      )
    }, 1000)
  }
}

async function renderEntryHistory() {
  const list = document.querySelector('#entry-list')

  if (!list) {
    return
  }

  const entries = await api.timeEntries.listRecent(100)
  list.replaceChildren()

  if (entries.length === 0) {
    const row = document.createElement('tr')
    const cell = createElement('td', 'p-8 text-center muted', t('timer.noEntries'))
    cell.colSpan = 8
    row.appendChild(cell)
    list.appendChild(row)
    return
  }

  for (const entry of entries) {
    const row = createElement('tr', 'entry-row border-b border-[var(--border)]')

    row.appendChild(createElement('td', 'p-4 muted whitespace-nowrap', formatDateTime(entry.created_at)))
    row.appendChild(createElement('td', 'p-4 font-medium', entry.task_name))
    row.appendChild(createElement('td', 'p-4', entry.client_name || t('common.noClient')))
    row.appendChild(createElement('td', 'p-4', entry.project_name || t('common.noProject')))
    row.appendChild(createElement('td', 'p-4 whitespace-nowrap', formatDateTime(entry.started_at)))
    row.appendChild(createElement('td', 'p-4 whitespace-nowrap', formatDateTime(entry.ended_at)))
    row.appendChild(createElement('td', 'p-4 font-semibold', formatDuration(entry.duration_seconds)))

    const actions = createElement('td', 'p-4')
    const actionGroup = createElement('div', 'flex items-center gap-1')

    if (entry.deleted) {
      const deletedBadge = createElement('span', 'deleted-pill', t('timer.deleted'))
      actionGroup.appendChild(deletedBadge)
    } else {
      appendIconButton(
        actionGroup,
        'play',
        t('timer.restart'),
        async () => {
          if (runningEntry) {
            return
          }

          runningEntry = await api.timeEntries.restart(entry.task_id)
          updateTimerScreen()
          renderEntryHistory()
        },
      )

      appendIconButton(
        actionGroup,
        'pencil',
        t('timer.edit'),
        () => openEntryModal(entry),
      )

      appendIconButton(
        actionGroup,
        'trash',
        t('timer.delete'),
        async () => {
          if (!window.confirm(t('timer.deleteConfirm'))) {
            return
          }

          await api.timeEntries.delete(entry.time_entry_id)

          if (runningEntry?.time_entry_id === entry.time_entry_id) {
            runningEntry = null
          }

          await loadCommonData()
          renderEntryHistory()
        },
        true,
      )
    }

    actions.appendChild(actionGroup)
    row.appendChild(actions)
    list.appendChild(row)
  }
}

function toDateTimeLocal(isoValue) {
  if (!isoValue) {
    return ''
  }

  const date = new Date(isoValue)
  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60000)

  return local.toISOString().slice(0, 16)
}

function fromDateTimeLocal(value) {
  if (!value) {
    return null
  }

  return new Date(value).toISOString()
}

function updateEntryDurationPreview() {
  const start = document.querySelector('#entry-start')?.value
  const end = document.querySelector('#entry-end')?.value
  const preview = document.querySelector('#entry-duration-preview')

  if (!preview) {
    return
  }

  if (!start || !end) {
    preview.textContent = t('timer.durationWillBeCalculated')
    return
  }

  const seconds = Math.max(0, (new Date(end) - new Date(start)) / 1000)
  preview.textContent = `${t('timer.duration')}: ${formatDuration(seconds)}`
}

function openEntryModal(entry) {
  const modal = document.querySelector('#entry-modal')
  modal.classList.remove('hidden')
  hydrateIcons(modal)

  document.querySelector('#entry-id').value = entry.time_entry_id
  populateTaskSelect(document.querySelector('#entry-task'), entry.task_id)
  document.querySelector('#entry-start').value = toDateTimeLocal(entry.started_at)
  document.querySelector('#entry-end').value = toDateTimeLocal(entry.ended_at)
  document.querySelector('#entry-note').value = entry.note || ''
  updateEntryDurationPreview()

  document.querySelector('#entry-start').oninput = updateEntryDurationPreview
  document.querySelector('#entry-end').oninput = updateEntryDurationPreview
  document.querySelector('#entry-modal-close').onclick = closeEntryModal
  document.querySelector('#entry-cancel').onclick = closeEntryModal
  document.querySelector('#entry-form').onsubmit = async event => {
    event.preventDefault()

    const startedAt = fromDateTimeLocal(document.querySelector('#entry-start').value)
    const endedAt = fromDateTimeLocal(document.querySelector('#entry-end').value)
    const durationSeconds = endedAt
      ? Math.max(0, (new Date(endedAt) - new Date(startedAt)) / 1000)
      : 0

    await api.timeEntries.update({
      time_entry_id: Number(document.querySelector('#entry-id').value),
      task_id: Number(document.querySelector('#entry-task').value),
      started_at: startedAt,
      ended_at: endedAt,
      duration_seconds: durationSeconds,
      note: document.querySelector('#entry-note').value,
    })

    closeEntryModal()
    await loadCommonData()
    renderEntryHistory()
  }
}

function closeEntryModal() {
  document.querySelector('#entry-modal')?.classList.add('hidden')
}

async function renderSettings() {
  currentRoute = 'settings'
  const view = document.querySelector('#view')
  view.innerHTML = settingsTemplate
  applyTranslations(view)

  const tabButtons = view.querySelectorAll('[data-settings-tab]')
  const content = view.querySelector('#settings-content')

  async function selectTab(tab) {
    tabButtons.forEach(button => {
      button.classList.toggle('active', button.dataset.settingsTab === tab)
    })

    if (tab === 'tasks') {
      renderTaskSettings(content)
    } else if (tab === 'clients') {
      renderClientProjectSettings(content)
    } else {
      await renderPreferenceSettings(content)
    }
  }

  tabButtons.forEach(button => {
    button.addEventListener('click', () => selectTab(button.dataset.settingsTab))
  })

  await selectTab('tasks')
}

function renderTaskSettings(container) {
  container.replaceChildren()

  const card = createElement('div', 'card p-5')
  const header = createElement('div', 'flex items-center justify-between gap-3')
  const titleGroup = createElement('div')
  titleGroup.append(
    createElement('div', 'font-bold', t('settings.tasks')),
    createElement('div', 'muted text-xs mt-1', t('settings.everyTask')),
  )

  const addButton = createElement('button', 'btn btn-primary')
  addButton.innerHTML = `${icon('plus', 'w-4 h-4')}<span>${escapeHtml(t('settings.newTask'))}</span>`
  addButton.addEventListener('click', () => openTaskModal())

  header.append(titleGroup, addButton)
  card.appendChild(header)

  const list = createElement('div', 'divide-y divide-[var(--border)] mt-4')

  for (const task of tasks) {
    const row = createElement('div', 'py-4 flex flex-wrap items-center justify-between gap-3')
    const info = createElement('div')
    const name = createElement('div', 'font-semibold', task.task_name)
    const meta = createElement(
      'div',
      'muted text-xs mt-1',
      `${task.client_name || t('common.noClient')} · ${task.project_name || t('common.noProject')}`,
    )
    info.append(name, meta)

    const actions = createElement('div', 'flex items-center gap-1')
    appendIconButton(actions, 'pencil', t('settings.edit'), () => openTaskModal(task.task_id))
    appendIconButton(
      actions,
      'archive-box',
      t('settings.archive'),
      async () => {
        if (!window.confirm(t('settings.archiveTaskConfirm'))) {
          return
        }

        await api.tasks.archive(task.task_id)
        await loadCommonData()
        renderTaskSettings(container)
      },
    )

    row.append(info, actions)
    list.appendChild(row)
  }

  if (tasks.length === 0) {
    list.appendChild(createElement('div', 'py-8 muted text-sm', t('common.noTasks')))
  }

  card.appendChild(list)
  container.appendChild(card)
}

function renderClientProjectSettings(container) {
  container.replaceChildren()

  const grid = createElement('div', 'grid grid-cols-1 xl:grid-cols-2 gap-5')
  grid.appendChild(buildClientCard())
  grid.appendChild(buildProjectCard())
  container.appendChild(grid)
}

function buildClientCard() {
  const card = createElement('div', 'card p-5')
  const header = createElement('div', 'flex items-center justify-between gap-3')
  header.appendChild(createElement('div', 'font-bold', t('settings.clients')))

  const add = createElement('button', 'btn btn-primary')
  add.innerHTML = `${icon('plus', 'w-4 h-4')}<span>${escapeHtml(t('settings.addClient'))}</span>`
  add.onclick = () => openEntityModal('client')
  header.appendChild(add)
  card.appendChild(header)

  const list = createElement('div', 'divide-y divide-[var(--border)] mt-4')

  for (const client of clients) {
    const row = createElement('div', 'py-4 flex items-center justify-between gap-3')
    const info = createElement('div')
    info.append(
      createElement('div', 'font-semibold', client.client_name),
      createElement(
        'div',
        'muted text-xs mt-1',
        `${client.currency_code} ${client.currency_symbol} · ${Number(client.default_rate).toFixed(2)}${t('common.perHour')}`,
      ),
    )

    const actions = createElement('div', 'flex items-center gap-1')
    appendIconButton(actions, 'pencil', t('settings.edit'), () => openEntityModal('client', client.client_id))
    appendIconButton(
      actions,
      'archive-box',
      t('settings.archive'),
      async () => {
        if (!window.confirm(t('settings.archiveClientConfirm'))) {
          return
        }

        await api.clients.archive(client.client_id)
        await loadCommonData()
        renderClientProjectSettings(document.querySelector('#settings-content'))
      },
    )

    row.append(info, actions)
    list.appendChild(row)
  }

  if (clients.length === 0) {
    list.appendChild(createElement('div', 'py-8 muted text-sm', t('settings.noClients')))
  }

  card.appendChild(list)

  return card
}

function buildProjectCard() {
  const card = createElement('div', 'card p-5')
  const header = createElement('div', 'flex items-center justify-between gap-3')
  header.appendChild(createElement('div', 'font-bold', t('settings.projects')))

  const add = createElement('button', 'btn btn-primary')
  add.innerHTML = `${icon('plus', 'w-4 h-4')}<span>${escapeHtml(t('settings.addProject'))}</span>`
  add.onclick = () => openEntityModal('project')
  header.appendChild(add)
  card.appendChild(header)

  const list = createElement('div', 'divide-y divide-[var(--border)] mt-4')

  for (const project of projects) {
    const row = createElement('div', 'py-4 flex items-center justify-between gap-3')
    const info = createElement('div')
    info.append(
      createElement('div', 'font-semibold', project.project_name),
      createElement(
        'div',
        'muted text-xs mt-1',
        `${project.client_name || t('common.noClient')} · ${project.currency_code} ${project.currency_symbol} · ${Number(project.default_rate).toFixed(2)}${t('common.perHour')}`,
      ),
    )

    const actions = createElement('div', 'flex items-center gap-1')
    appendIconButton(actions, 'pencil', t('settings.edit'), () => openEntityModal('project', project.project_id))
    appendIconButton(
      actions,
      'archive-box',
      t('settings.archive'),
      async () => {
        if (!window.confirm(t('settings.archiveProjectConfirm'))) {
          return
        }

        await api.projects.archive(project.project_id)
        await loadCommonData()
        renderClientProjectSettings(document.querySelector('#settings-content'))
      },
    )

    row.append(info, actions)
    list.appendChild(row)
  }

  if (projects.length === 0) {
    list.appendChild(createElement('div', 'py-8 muted text-sm', t('settings.noProjects')))
  }

  card.appendChild(list)

  return card
}

async function renderPreferenceSettings(container) {
  container.replaceChildren()

  const card = createElement('div', 'card p-5 space-y-6')

  const languageSection = createElement('div')
  languageSection.append(
    createElement('div', 'font-bold', t('settings.languages')),
    createElement('div', 'muted text-sm mt-1', t('settings.languageHint')),
  )

  const languageSelect = createElement('select', 'input mt-3 max-w-xs')
  populateSelect(
    languageSelect,
    availableLocales.map(item => ({
      value: item.code,
      label: `${item.nativeName} (${item.code.toUpperCase()})`,
    })),
    locale,
  )
  languageSelect.addEventListener('change', async () => {
    await setLocale(languageSelect.value)
    await renderApplicationShell()
  })
  languageSection.appendChild(languageSelect)
  card.appendChild(languageSection)

  const themeSection = createElement('div', 'border-t border-[var(--border)] pt-5 flex items-center justify-between gap-4')
  const themeText = createElement('div')
  themeText.append(
    createElement('div', 'font-bold', t('settings.dayNight')),
    createElement('div', 'muted text-sm', t('settings.dayNightHint')),
  )

  const themeButton = createElement('button', 'btn btn-secondary')
  themeButton.innerHTML = `${icon(theme === 'dark' ? 'sun' : 'moon', 'w-5 h-5')}<span>${escapeHtml(theme === 'dark' ? t('settings.dayMode') : t('settings.nightMode'))}</span>`
  themeButton.onclick = async () => {
    await setTheme(theme === 'dark' ? 'light' : 'dark')
    await renderPreferenceSettings(container)
  }
  themeSection.append(themeText, themeButton)
  card.appendChild(themeSection)

  const timeSection = createElement('div', 'border-t border-[var(--border)] pt-5')
  timeSection.append(
    createElement('div', 'font-bold', t('settings.timeFormat')),
    createElement('div', 'muted text-sm mt-1', t('settings.timeFormatHint')),
  )

  const timeSelect = createElement('select', 'input mt-3 max-w-xs')
  populateSelect(timeSelect, [
    { value: 'decimal', label: t('settings.decimalHours') },
    { value: 'hms', label: t('settings.hoursMinutesSeconds') },
  ], timeDisplayFormat)
  timeSelect.onchange = async () => {
    timeDisplayFormat = timeSelect.value
    await api.settings.set({
      key: 'timeDisplayFormat',
      value: timeDisplayFormat,
    })
    await renderPreferenceSettings(container)
  }
  timeSection.appendChild(timeSelect)
  card.appendChild(timeSection)

  const traySection = await buildBooleanPreference(
    'settings.minimizeTray',
    'settings.minimizeTrayHint',
    'minimizeToTray',
    true,
  )
  card.appendChild(traySection)

  const startupSection = await buildBooleanPreference(
    'settings.startWindows',
    'settings.startWindowsHint',
    'startWithWindows',
    false,
  )
  card.appendChild(startupSection)

  container.appendChild(card)
}

async function buildBooleanPreference(titleKey, hintKey, settingKey, fallback) {
  const section = createElement('div', 'border-t border-[var(--border)] pt-5 flex items-center justify-between gap-4')
  const text = createElement('div')
  text.append(
    createElement('div', 'font-bold', t(titleKey)),
    createElement('div', 'muted text-sm', t(hintKey)),
  )

  const checkbox = document.createElement('input')
  checkbox.type = 'checkbox'
  checkbox.className = 'w-5 h-5'
  checkbox.checked = Boolean(await api.settings.get({
    key: settingKey,
    fallback,
  }))

  checkbox.onchange = async () => {
    await api.settings.set({
      key: settingKey,
      value: checkbox.checked,
    })
  }

  section.append(text, checkbox)

  return section
}

function openTaskModal(taskId = null) {
  const modal = document.querySelector('#task-modal')
  modal.classList.remove('hidden')
  hydrateIcons(modal)

  const task = taskId
    ? tasks.find(item => Number(item.task_id) === Number(taskId))
    : null

  document.querySelector('#task-id').value = task?.task_id || ''
  document.querySelector('#task-modal-title').textContent = task
    ? t('settings.editTask')
    : t('settings.newTask')
  document.querySelector('#task-name').value = task?.task_name || ''
  document.querySelector('#task-color').value = task?.color || '#06b6d4'
  document.querySelector('#task-billable').checked = task?.billable ?? true
  populateSelect(
    document.querySelector('#task-client'),
    [
      { value: '', label: t('common.noClient') },
      ...clients.map(client => ({
        value: client.client_id,
        label: client.client_name,
      })),
    ],
    task?.client_id || '',
  )
  populateSelect(
    document.querySelector('#task-project'),
    [
      { value: '', label: t('common.noProject') },
      ...projects.map(project => ({
        value: project.project_id,
        label: project.project_name,
      })),
    ],
    task?.project_id || '',
  )
  populateCurrencySelect(
    document.querySelector('#task-currency'),
    task?.currency_code || '',
    true,
  )
  document.querySelector('#task-rate').value = task?.rate ?? ''

  document.querySelector('#task-modal-close').onclick = closeTaskModal
  document.querySelector('#task-cancel').onclick = closeTaskModal
  document.querySelector('#task-form').onsubmit = async event => {
    event.preventDefault()

    const payload = {
      task_name: document.querySelector('#task-name').value,
      color: document.querySelector('#task-color').value,
      client_id: document.querySelector('#task-client').value
        ? Number(document.querySelector('#task-client').value)
        : null,
      project_id: document.querySelector('#task-project').value
        ? Number(document.querySelector('#task-project').value)
        : null,
      billable: document.querySelector('#task-billable').checked,
      currency_code: document.querySelector('#task-currency').value || null,
      rate: document.querySelector('#task-rate').value,
    }

    const existingTaskId = Number(document.querySelector('#task-id').value)

    if (existingTaskId) {
      await api.tasks.update({
        ...payload,
        task_id: existingTaskId,
      })
    } else {
      await api.tasks.add(payload)
    }

    closeTaskModal()
    await loadCommonData()

    if (currentRoute === 'dashboard') {
      renderDashboard()
    } else if (currentRoute === 'settings') {
      renderTaskSettings(document.querySelector('#settings-content'))
    }
  }
}

function closeTaskModal() {
  document.querySelector('#task-modal')?.classList.add('hidden')
}

function openEntityModal(type, entityId = null) {
  const modal = document.querySelector('#entity-modal')
  modal.classList.remove('hidden')
  hydrateIcons(modal)

  const data = type === 'client'
    ? clients.find(item => Number(item.client_id) === Number(entityId))
    : projects.find(item => Number(item.project_id) === Number(entityId))

  document.querySelector('#entity-id').value = entityId || ''
  document.querySelector('#entity-type').value = type
  document.querySelector('#entity-modal-title').textContent = entityId
    ? t(type === 'client' ? 'settings.editClient' : 'settings.editProject')
    : t(type === 'client' ? 'settings.addClient' : 'settings.addProject')
  document.querySelector('#entity-name-label').textContent = t(
    type === 'client' ? 'settings.clientName' : 'settings.projectName',
  )
  document.querySelector('#entity-name').value = type === 'client'
    ? data?.client_name || ''
    : data?.project_name || ''
  document.querySelector('#entity-rate').value = data?.default_rate ?? 0
  populateCurrencySelect(
    document.querySelector('#entity-currency'),
    data?.currency_code || 'USD',
  )

  const clientField = document.querySelector('#project-client-field')
  clientField.replaceChildren()

  if (type === 'project') {
    const label = createElement('label', 'field')
    label.appendChild(createElement('span', '', t('settings.clientOptional')))

    const select = document.createElement('select')
    select.id = 'entity-client'
    select.className = 'input'
    populateSelect(
      select,
      [
        { value: '', label: t('common.noClient') },
        ...clients.map(client => ({
          value: client.client_id,
          label: client.client_name,
        })),
      ],
      data?.client_id || '',
    )
    label.appendChild(select)
    clientField.appendChild(label)
  }

  document.querySelector('#entity-modal-close').onclick = closeEntityModal
  document.querySelector('#entity-cancel').onclick = closeEntityModal
  document.querySelector('#entity-form').onsubmit = async event => {
    event.preventDefault()

    const name = document.querySelector('#entity-name').value
    const currencyCode = document.querySelector('#entity-currency').value
    const rate = document.querySelector('#entity-rate').value

    if (type === 'client') {
      const payload = {
        client_name: name,
        currency_code: currencyCode,
        default_rate: rate,
      }

      if (entityId) {
        await api.clients.update({
          ...payload,
          client_id: Number(entityId),
        })
      } else {
        await api.clients.add(payload)
      }
    } else {
      const payload = {
        project_name: name,
        client_id: document.querySelector('#entity-client')?.value
          ? Number(document.querySelector('#entity-client').value)
          : null,
        currency_code: currencyCode,
        default_rate: rate,
      }

      if (entityId) {
        await api.projects.update({
          ...payload,
          project_id: Number(entityId),
        })
      } else {
        await api.projects.add(payload)
      }
    }

    closeEntityModal()
    await loadCommonData()
    renderClientProjectSettings(document.querySelector('#settings-content'))
  }
}

function closeEntityModal() {
  document.querySelector('#entity-modal')?.classList.add('hidden')
}

async function renderAbout() {
  const view = document.querySelector('#view')
  view.innerHTML = aboutTemplate
  applyTranslations(view)
  hydrateIcons(view)

  const info = await api.app.getInfo()
  document.querySelector('#about-version').textContent = `${t('about.version')} ${info.version}`
}

function renderFloatingTimer() {
  appElement.innerHTML = floatingTimerTemplate
  applyTranslations(appElement)
  hydrateIcons(appElement)

  const update = () => {
    const taskElement = document.querySelector('#float-task')
    const timeElement = document.querySelector('#float-time')
    const metaElement = document.querySelector('#float-meta')
    const controls = document.querySelector('#float-controls')

    if (!taskElement || !timeElement || !metaElement || !controls) {
      return
    }

    if (runningEntry) {
      taskElement.textContent = runningEntry.task_name
      timeElement.textContent = formatClock(
        (Date.now() - new Date(runningEntry.started_at).getTime()) / 1000,
      )
      metaElement.textContent = billingLabel(runningEntry)
      controls.replaceChildren()

      const stop = createElement('button', 'btn btn-danger w-full')
      stop.innerHTML = `${icon('stop', 'w-4 h-4')}<span>${escapeHtml(t('timer.stopSave'))}</span>`
      stop.onclick = async () => {
        await stopRunningTimer()
        await loadCommonData()
        update()
      }
      controls.appendChild(stop)
    } else {
      taskElement.textContent = t('floating.ready')
      timeElement.textContent = '00:00:00'
      metaElement.textContent = t('floating.select')
      controls.replaceChildren()

      const select = document.createElement('select')
      select.className = 'input flex-1'
      populateTaskSelect(select, tasks[0]?.task_id)

      const start = createElement('button', 'btn btn-primary')
      start.innerHTML = icon('play', 'w-4 h-4')
      start.onclick = async () => {
        runningEntry = await startTimer(select.value)
        update()
      }

      const row = createElement('div', 'flex gap-2')
      row.append(select, start)
      controls.appendChild(row)
    }

    hydrateIcons(appElement)
  }

  document.querySelector('#float-close').onclick = () => api.window.closeTimer()
  document.querySelector('#float-min').onclick = () => api.window.minimize()

  update()
  window.setInterval(update, 1000)
}

function renderWorkspace() {
  appElement.innerHTML = workspaceTemplate
  applyTranslations(appElement)
  hydrateIcons(appElement)

  const options = document.querySelector('#workspace-options')
  const progress = document.querySelector('#workspace-progress')
  const failure = document.querySelector('#workspace-failure')
  const progressMessage = document.querySelector('#workspace-progress-message')
  const progressBar = document.querySelector('#workspace-progress-bar')
  const progressPercent = document.querySelector('#workspace-progress-percent')

  const showProgress = () => {
    options.classList.add('hidden')
    failure.classList.add('hidden')
    progress.classList.remove('hidden')
  }

  const showFailure = messageKey => {
    progress.classList.add('hidden')
    options.classList.add('hidden')
    failure.classList.remove('hidden')
    document.querySelector('#workspace-failure-message').textContent = t(messageKey)
  }

  api.workspace.onProgress(progressData => {
    progressMessage.textContent = t(progressData.messageKey)
    progressBar.style.width = `${progressData.percent}%`
    progressPercent.textContent = `${progressData.percent}%`
  })

  document.querySelector('#workspace-initialize').onclick = async () => {
    showProgress()
    await api.workspace.initialize()
  }

  document.querySelector('#workspace-load').onclick = async () => {
    const selection = await api.workspace.chooseDatabase()

    if (selection.canceled) {
      return
    }

    showProgress()

    const result = await api.workspace.import(selection.filePath)

    if (!result.success) {
      showFailure(result.messageKey || 'workspace.importFailed')
    }
  }

  document.querySelector('#workspace-continue').onclick = async () => {
    await api.workspace.continue()
  }

  document.querySelector('#workspace-another').onclick = () => {
    failure.classList.add('hidden')
    options.classList.remove('hidden')
  }
}

async function renderApplicationShell() {
  appElement.innerHTML = shellTemplate
  applyTranslations(appElement)
  hydrateIcons(appElement)

  document.querySelectorAll('[data-route]').forEach(button => {
    button.addEventListener('click', () => navigate(button.dataset.route))
  })

  document.querySelector('#theme-toggle').addEventListener('click', async () => {
    await setTheme(theme === 'dark' ? 'light' : 'dark')
    await renderApplicationShell()
  })

  document.querySelector('#top-timer').addEventListener('click', () => navigate('timer'))
  document.querySelector('#minimize-btn').addEventListener('click', () => api.window.minimize())

  await navigate(currentRoute)
}

async function navigate(route) {
  currentRoute = route

  document.querySelectorAll('[data-route]').forEach(button => {
    button.classList.toggle('active', button.dataset.route === route)
  })

  const pageTitle = document.querySelector('#page-title')

  if (pageTitle) {
    pageTitle.textContent = t(`page.${route}`)
  }

  if (route === 'dashboard') {
    await renderDashboard()
  } else if (route === 'timer') {
    renderTimerScreen()
  } else if (route === 'settings') {
    await renderSettings()
  } else if (route === 'about') {
    await renderAbout()
  }
}

async function boot() {
  await loadLocales()

  if (location.hash === '#/workspace') {
    renderWorkspace()
    return
  }

  await loadSettings()
  await loadCommonData()

  if (location.hash === '#/timer') {
    renderFloatingTimer()
    return
  }

  appElement.innerHTML = splashTemplate
  applyTranslations(appElement)

  window.setTimeout(async () => {
    await renderApplicationShell()
  }, 850)
}

boot().catch(error => {
  console.error('Timesheet Parrot renderer failed to start:', error)
})
