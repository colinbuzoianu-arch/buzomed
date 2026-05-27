export default function SuspendedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--surface-muted))]">
      <div className="max-w-md w-full mx-auto px-6 text-center space-y-6">
        <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto">
          <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-display font-normal text-foreground">
            Cont suspendat
          </h1>
          <p className="text-sm text-[hsl(var(--text-muted))] leading-relaxed">
            Accesul la Buzomed a fost suspendat temporar pentru cabinetul tău. Contactează echipa Buzomed pentru reactivare.
          </p>
        </div>
        <a
          href="mailto:hello@buzomed.com"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Contactează echipa Buzomed
        </a>
        <p className="text-[11px] text-[hsl(var(--text-faint))]">
          Buzomed · un produs Verumsell
        </p>
      </div>
    </div>
  )
}
