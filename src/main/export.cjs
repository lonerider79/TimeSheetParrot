// ExcelJS export. The renderer sends already localized labels so the main
// process never needs to contain user-visible translation strings.
const ExcelJS = require('exceljs')

async function exportTimesheet(filePath, rows, rangeLabel, labels) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = labels.appName
  workbook.created = new Date()

  const worksheet = workbook.addWorksheet(labels.sheetName)

  worksheet.mergeCells('A1:L1')
  worksheet.getCell('A1').value = `${labels.title} - ${rangeLabel}`
  worksheet.getCell('A1').font = {
    bold: true,
    size: 16,
  }

  worksheet.addRow([])

  const headerRow = worksheet.addRow([
    labels.date,
    labels.day,
    labels.task,
    labels.client,
    labels.project,
    labels.billable,
    labels.currencyCode,
    labels.currencySymbol,
    labels.rate,
    labels.hours,
    labels.amount,
    labels.notes,
  ])

  headerRow.font = {
    bold: true,
    color: { argb: 'FFFFFFFF' },
  }
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0891B2' },
  }
  headerRow.alignment = {
    vertical: 'middle',
  }

  for (const row of rows) {
    const hours = Number((Number(row.seconds || 0) / 3600).toFixed(2))
    const rate = Number(row.rate || 0)
    const amount = row.billable ? Number((hours * rate).toFixed(2)) : 0

    worksheet.addRow([
      row.date,
      row.day,
      row.task,
      row.client || '',
      row.project || '',
      row.billable ? labels.yes : labels.no,
      row.currency || '',
      row.currencySymbol || '',
      rate,
      hours,
      amount,
      row.note || '',
    ])
  }

  worksheet.columns = [
    { width: 14 },
    { width: 14 },
    { width: 28 },
    { width: 22 },
    { width: 24 },
    { width: 14 },
    { width: 14 },
    { width: 16 },
    { width: 14 },
    { width: 12 },
    { width: 14 },
    { width: 30 },
  ]

  worksheet.getColumn(9).numFmt = '0.00'
  worksheet.getColumn(10).numFmt = '0.00'
  worksheet.getColumn(11).numFmt = '0.00'
  worksheet.views = [{ state: 'frozen', ySplit: 3 }]
  worksheet.autoFilter = {
    from: 'A3',
    to: 'L3',
  }

  await workbook.xlsx.writeFile(filePath)

  return {
    filePath,
    rangeLabel,
  }
}

module.exports = {
  exportTimesheet,
}
