'use client'

export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="text-sm border rounded-md px-3 py-1 hover:bg-muted"
    >
      {label}
    </button>
  )
}