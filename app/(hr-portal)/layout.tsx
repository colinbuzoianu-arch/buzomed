import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { LogoutButton } from '@/components/logout-button'
import { BuzomedLogo } from '@/components/buzomed-logo'

export default async function HrPortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireUser()

  // Only company_hr users may access this portal
  if (!user.roles.includes('company_hr')) {
    redirect('/dashboard')
  }

  // Fetch the company names assigned to this user for the header
  const assignments = await prisma.companyHrAssignment.findMany({
    where: { userId: user.id },
    select: { company: { select: { name: true } } },
    take: 3,
  })

  const companyNames = assignments.map((a) => a.company.name)
  const headerCompanyLabel =
    companyNames.length === 0
      ? ''
      : companyNames.length === 1
        ? companyNames[0]
        : `${companyNames[0]} +${companyNames.length - 1}`

  const userDisplayName = `${user.firstName} ${user.lastName}`

  return (
    <div className="min-h-screen flex flex-col bg-[hsl(var(--surface-muted))]/30">
      <header className="sticky top-0 z-40 border-b bg-white shadow-sm">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BuzomedLogo variant="icon" size="sm" />
            <span className="w-px h-5 bg-border" />
            <div className="flex flex-col leading-none">
              <span className="text-xs text-muted-foreground">Portal HR</span>
              {headerCompanyLabel && (
                <span className="text-sm font-medium">{headerCompanyLabel}</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden md:block text-sm text-muted-foreground">
              {userDisplayName}
            </span>
            <LogoutButton label="Deconectare" />
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-6 md:py-8">
        {children}
      </main>

      <footer className="border-t bg-white py-3 mt-auto">
        <div className="container mx-auto px-4">
          <p className="text-[11px] text-muted-foreground text-center">
            Portal HR · Buzomed · {new Date().getFullYear()}
          </p>
        </div>
      </footer>
    </div>
  )
}
