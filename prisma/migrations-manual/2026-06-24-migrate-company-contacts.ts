/**
 * One-shot migration: seed one CompanyContact (isPrimary=true) per Company
 * that has at least one non-null contactPerson* field and does not already
 * have any CompanyContact rows.
 *
 * Run:  npx tsx prisma/migrations-manual/2026-06-24-migrate-company-contacts.ts
 * Safe to run multiple times — idempotent (skips companies that already have contacts).
 */

import { type CompanyContactRole, PrismaClient } from '@prisma/client'
import 'dotenv/config'

const prisma = new PrismaClient()

function inferRole(contactPersonRole: string | null): {
  role: CompanyContactRole
  roleNote: string | null
} {
  if (!contactPersonRole) return { role: 'other', roleNote: null }

  const normalized = contactPersonRole.toLowerCase().trim()

  if (
    normalized.includes('hr') ||
    normalized.includes('resurse umane') ||
    normalized.includes('umane')
  ) {
    return { role: 'hr', roleNote: null }
  }
  if (
    normalized.includes('ssm') ||
    normalized.includes('ss&m') ||
    normalized.includes('siguranță') ||
    normalized.includes('siguranta') ||
    normalized.includes('securitate')
  ) {
    return { role: 'ssm', roleNote: null }
  }
  if (normalized.includes('manager') || normalized.includes('director')) {
    return { role: 'plant_manager', roleNote: null }
  }

  // Doesn't fit a known role — keep original text as roleNote
  return {
    role: 'other',
    roleNote: contactPersonRole.slice(0, 100) || null,
  }
}

async function main() {
  const companies = await prisma.company.findMany({
    where: {
      deletedAt: null,
      OR: [
        { contactPersonName: { not: null } },
        { contactPersonPhone: { not: null } },
        { contactPersonEmail: { not: null } },
        { contactPersonRole: { not: null } },
      ],
    },
    select: {
      id: true,
      contactPersonName: true,
      contactPersonRole: true,
      contactPersonPhone: true,
      contactPersonEmail: true,
      _count: { select: { contacts: true } },
    },
  })

  console.log(`Scanned ${companies.length} companies with legacy contact data`)

  let created = 0
  let skipped = 0

  for (const company of companies) {
    if (company._count.contacts > 0) {
      skipped++
      continue
    }

    const { role, roleNote } = inferRole(company.contactPersonRole)

    await prisma.companyContact.create({
      data: {
        companyId: company.id,
        name: company.contactPersonName ?? 'Contact principal',
        role,
        roleNote,
        phone: company.contactPersonPhone ?? undefined,
        email: company.contactPersonEmail ?? undefined,
        isPrimary: true,
      },
    })
    created++
  }

  console.log(`Created ${created} contacts, skipped ${skipped} (already had contacts)`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
