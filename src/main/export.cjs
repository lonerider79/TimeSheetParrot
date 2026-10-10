// ExcelJS export. The renderer sends localized labels and dashboard-calculated rows.
const ExcelJS = require('exceljs')

function styleHeader(row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0891B2' } }
  row.alignment = { vertical: 'middle', wrapText: true }
}

function setDurationFormat(column, format) {
  column.numFmt = format === 'hms' ? '[h]:mm:ss' : '0.00"h"'
}

function durationValue(seconds, format) {
  return format === 'hms' ? (Number(seconds || 0) / 86400) : (Number(seconds || 0) / 3600)
}

async function exportTimesheet(filePath, payload) {
  const { rows = [], weeklyRows = [], billingRows = [], rangeLabel, labels } = payload
  const workbook = new ExcelJS.Workbook()
  workbook.creator = labels.appName
  workbook.created = new Date()

  const worksheet = workbook.addWorksheet(labels.sheetName)
  worksheet.mergeCells('A1:J1')
  worksheet.getCell('A1').value = `${labels.title} - ${rangeLabel}`
  worksheet.getCell('A1').font = { bold: true, size: 16 }
  worksheet.addRow([])

  const byWeek = new Map()
  for (const row of weeklyRows) {
    const key = row.weekStart
    if (!byWeek.has(key)) byWeek.set(key, [])
    byWeek.get(key).push(row)
  }
  for (const [weekStart, rowsForWeek] of byWeek) {
    const sample = rowsForWeek[0]
    const start = new Date(weekStart)
    const end = new Date(sample.weekEnd)
    const weekLabel = `${labels.week} | ${start.toLocaleDateString(labels.locale || 'en')} - ${end.toLocaleDateString(labels.locale || 'en')}`
    const section = worksheet.addRow([weekLabel])
    worksheet.mergeCells(`A${section.number}:J${section.number}`)
    section.font = { bold: true, size: 12 }
    const header = worksheet.addRow([labels.group, ...sample.dayDates.map((iso) => {
      const day = new Date(iso)
      return `${new Intl.DateTimeFormat(labels.locale || 'en', { weekday: 'short' }).format(day)}\n${day.toLocaleDateString(labels.locale || 'en')}`
    }), labels.weeklyTotal || labels.total, ''])
    styleHeader(header)
    for (const row of rowsForWeek) {
      worksheet.addRow([row.name, ...row.days.map((seconds) => durationValue(seconds, labels.timeFormat)), durationValue(row.seconds, labels.timeFormat), ''])
    }
    const totals = Array.from({ length: 7 }, (_, dayIndex) => rowsForWeek.reduce((sum, row) => sum + Number(row.days[dayIndex] || 0), 0))
    const subtotal = worksheet.addRow([labels.weeklyTotal || labels.total, ...totals.map((seconds) => durationValue(seconds, labels.timeFormat)), durationValue(totals.reduce((sum, seconds) => sum + seconds, 0), labels.timeFormat), ''])
    subtotal.font = { bold: true }
    for (let col = 2; col <= 9; col += 1) setDurationFormat(worksheet.getColumn(col), labels.timeFormat)
  }

  const totalRow = worksheet.addRow([labels.total, '', '', '', '', '', '', '', durationValue(weeklyRows.reduce((sum, row) => sum + Number(row.seconds || 0), 0), labels.timeFormat), ''])
  totalRow.font = { bold: true }
  totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' } }
  for (let col = 2; col <= 9; col += 1) setDurationFormat(worksheet.getColumn(col), labels.timeFormat)

  worksheet.addRow([])
  const billingTitle = worksheet.addRow([labels.billingSummary || labels.amount])
  billingTitle.font = { bold: true, size: 13 }
  const billingHeader = worksheet.addRow([labels.group, labels.billable, labels.currencyCode, labels.currencySymbol, labels.rate, labels.hours, labels.amount])
  styleHeader(billingHeader)
  for (const item of billingRows) {
    const billRow = worksheet.addRow([item.name, item.billable ? labels.yes : labels.no, item.currency, item.currencySymbol, item.rate, durationValue(item.seconds, labels.timeFormat), Number(item.amount || 0)])
    billRow.getCell(5).numFmt = '0.00'
    setDurationFormat(worksheet.getColumn(6), labels.timeFormat)
    billRow.getCell(7).numFmt = '0.00'
  }
  worksheet.getColumn(1).width = 32
  worksheet.getColumn(2).width = 14
  for (let col = 3; col <= 8; col += 1) worksheet.getColumn(col).width = 14
  worksheet.getColumn(9).width = 16
  worksheet.getColumn(10).width = 4
  worksheet.views = [{ state: 'frozen', ySplit: 3 }]

  const details = workbook.addWorksheet(labels.detailsSheet || 'Entries')
  details.addRow([labels.date, labels.day, labels.task, labels.client, labels.project, labels.billable, labels.currencyCode, labels.currencySymbol, labels.rate, labels.hours, labels.amount, labels.notes])
  styleHeader(details.getRow(1))
  for (const row of rows) {
    const hours = Number(row.seconds || 0) / 3600
    details.addRow([row.date, row.day, row.task, row.client, row.project, row.billable ? labels.yes : labels.no, row.currency, row.currencySymbol, Number(row.rate || 0), durationValue(row.seconds, labels.timeFormat), row.billable ? Number((hours * Number(row.rate || 0)).toFixed(2)) : 0, row.note])
  }
  ;[14, 14, 32, 24, 24, 14, 16, 16, 14, 14, 14, 32].forEach((width, i) => { details.getColumn(i + 1).width = width })
  details.getColumn(9).numFmt = '0.00'
  setDurationFormat(details.getColumn(10), labels.timeFormat)
  details.getColumn(11).numFmt = '0.00'
  details.views = [{ state: 'frozen', ySplit: 1 }]
  details.autoFilter = { from: 'A1', to: 'L1' }

  await workbook.xlsx.writeFile(filePath)
  return { filePath, rangeLabel }
}

module.exports = { exportTimesheet }
