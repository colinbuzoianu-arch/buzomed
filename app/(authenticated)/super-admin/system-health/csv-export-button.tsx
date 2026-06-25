'use client'

interface CsvExportButtonProps {
  headers: string[]
  rows: (string | number | boolean | null)[][]
  filename: string
}

export function CsvExportButton({ headers, rows, filename }: CsvExportButtonProps) {
  function handleExport() {
    const esc = (v: string | number | boolean | null): string => {
      const s = v === null || v === undefined ? '' : String(v)
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`
      }
      return s
    }
    const csv = [headers, ...rows].map((row) => row.map(esc).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      className="text-xs px-2 py-1 rounded border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
    >
      Export CSV
    </button>
  )
}
