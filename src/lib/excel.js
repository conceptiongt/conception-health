// hojas = [{ nombre, columnas: [{ header, key, width, moneda }], filas: [{...}] }]
export async function descargarExcel(hojas, archivo) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Conception Health'
  for (const h of hojas) {
    const ws = wb.addWorksheet(h.nombre.slice(0, 31))
    ws.columns = h.columnas.map(c => ({ header: c.header, key: c.key, width: c.width || 18 }))
    h.filas.forEach(f => ws.addRow(f))
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } }
    ws.views = [{ state: 'frozen', ySplit: 1 }]
    h.columnas.filter(c => c.moneda).forEach(c => { ws.getColumn(c.key).numFmt = '"Q"#,##0.00' })
  }
  const buffer = await wb.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${/\d{4}-\d{2}-\d{2}$/.test(archivo) ? archivo : `${archivo}_${fechaHoy()}`}.xlsx` // always with the date
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const slug = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase()

const fechaHoy = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
