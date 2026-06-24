import { PrismaClient } from '@prisma/client'
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const prisma = new PrismaClient()

// Romanian medicina muncii examination types per HG 355/2007 and subsequent legislation.
// These map to the checkboxes on the official fișa de aptitudine form.
const examinationTypes = [
  {
    code: 'angajare',
    nameRo: 'Examen medical la angajare',
    nameEn: 'Pre-employment medical examination',
    description:
      'Examen efectuat înainte de angajare pentru a stabili aptitudinea în muncă a candidatului.',
    legalReference: 'HG 355/2007',
    defaultValidityMonths: 12,
  },
  {
    code: 'control_periodic',
    nameRo: 'Control medical periodic',
    nameEn: 'Periodic medical check-up',
    description:
      'Control efectuat la intervale stabilite, pentru a urmări starea de sănătate a angajatului.',
    legalReference: 'HG 355/2007',
    defaultValidityMonths: 12,
  },
  {
    code: 'adaptare',
    nameRo: 'Examen de adaptare',
    nameEn: 'Adaptation examination',
    description: 'Examen efectuat după 30-45 zile de la angajare pentru a evalua adaptarea la post.',
    legalReference: 'HG 355/2007',
    defaultValidityMonths: 12,
  },
  {
    code: 'reluare_munca',
    nameRo: 'Examen la reluarea activității',
    nameEn: 'Return-to-work examination',
    description:
      'Examen efectuat după întrerupere mai mare de 90 zile (concediu medical, accident, etc.).',
    legalReference: 'HG 355/2007',
    defaultValidityMonths: 12,
  },
  {
    code: 'supraveghere_speciala',
    nameRo: 'Supraveghere medicală specială',
    nameEn: 'Special medical surveillance',
    description: 'Pentru lucrători expuși la factori de risc deosebit (radiații, cancerigeni, etc.).',
    legalReference: 'HG 355/2007',
    defaultValidityMonths: 6,
  },
  {
    code: 'schimbare_loc_munca',
    nameRo: 'Examen la schimbarea locului de muncă',
    nameEn: 'Job change examination',
    description: 'Necesar la schimbarea postului sau a locului de muncă în cadrul aceleași companii.',
    legalReference: 'HG 355/2007',
    defaultValidityMonths: 12,
  },
  {
    code: 'alte',
    nameRo: 'Alte examinări',
    nameEn: 'Other examinations',
    description: 'Examinări medicale care nu se încadrează în categoriile standard.',
    legalReference: null,
    defaultValidityMonths: 12,
  },
]

async function main() {
  console.log('Seeding examination types...')
  for (const examType of examinationTypes) {
    await prisma.examinationType.upsert({
      where: { code: examType.code },
      update: examType,
      create: examType,
    })
  }
  console.log(`Seeded ${examinationTypes.length} examination types.`)

  // Link super admin user (matches by email to the Supabase Auth user)
  console.log('\nLinking super admin user...')
  
  const superAdminEmail = 'colinbuzoianu@gmail.com'
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!supabaseUrl || !supabaseServiceKey) {
    console.warn(
      '⚠️  SUPABASE_SERVICE_ROLE_KEY not set in .env — skipping super admin user link. Set it and re-run seed.'
    )
    return
  }
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  
  // Find the auth user by email
  const { data: usersList, error: listError } = await supabase.auth.admin.listUsers()
  if (listError) {
    console.error('Could not list auth users:', listError.message)
    return
  }
  
  const authUser = usersList.users.find((u) => u.email === superAdminEmail)
  if (!authUser) {
    console.warn(`⚠️  Auth user not found for ${superAdminEmail}. Create them in Supabase Auth first.`)
    return
  }
  
  // Upsert app-side user
  const appUser = await prisma.user.upsert({
    where: { email: superAdminEmail },
    update: {
      authUserId: authUser.id,
      roles: ['super_admin'],
      isActive: true,
    },
    create: {
      email: superAdminEmail,
      authUserId: authUser.id,
      firstName: 'Colin',
      lastName: 'Buzoianu',
      roles: ['super_admin'],
      isActive: true,
      tenantId: null, // super admin has no tenant
    },
  })
  
  console.log(`✅ Super admin user linked: ${appUser.email} (ID: ${appUser.id})`)

  // Seed subscription plans
  console.log('\nSeeding subscription plans...')
  const planDefs = [
    { name: 'Starter',    tier: 'starter'    as const, monthlyPrice: 99,  maxEmployees: 100,  isPublic: true,  stripePriceId: 'price_1TeG2vQi3J3l1LWun2U5Mlgx' },
    { name: 'Growth',     tier: 'growth'     as const, monthlyPrice: 299, maxEmployees: 500,  isPublic: true,  stripePriceId: 'price_1TeG3cQi3J3l1LWugF8XF51o' },
    { name: 'Pro',        tier: 'pro'        as const, monthlyPrice: 699, maxEmployees: 2000, isPublic: true,  stripePriceId: 'price_1TeG41Qi3J3l1LWuIPU7DacV' },
    { name: 'Enterprise', tier: 'enterprise' as const, monthlyPrice: 0,   maxEmployees: -1,   isPublic: false, stripePriceId: null },
  ]
  for (const p of planDefs) {
    await prisma.plan.upsert({
      where: { tier: p.tier },
      update: { name: p.name, monthlyPrice: p.monthlyPrice, maxEmployees: p.maxEmployees, isPublic: p.isPublic, stripePriceId: p.stripePriceId },
      create: p,
    })
  }
  console.log(`Seeded ${planDefs.length} plans.`)

  // Seed demo employees for "Exemplu Cabinet" tenant
  console.log('\nSeeding demo employees...')
  const exempluTenantId = '3b59e85f-1246-44ea-8034-a1602f412d4e'
  const exempluTenant = await prisma.tenant.findUnique({ where: { id: exempluTenantId } })
  if (exempluTenant) {
    const demoEmployees = [
      {
        id: 'a1000001-0000-4000-8000-000000000001',
        firstName: 'Andrei',
        lastName: 'Popescu',
        jobTitle: 'Sudor',
        nationality: 'RO',
        phone: '+40722111222',
        medicCurantName: 'Dr. Maria Ionescu',
        medicCurantPhone: '+40731555666',
      },
      {
        id: 'a1000002-0000-4000-8000-000000000002',
        firstName: 'Elena',
        lastName: 'Dumitrescu',
        jobTitle: 'Contabilă',
        nationality: 'RO',
        phone: '+40744333444',
        medicCurantName: 'Dr. Gheorghe Popa',
        medicCurantPhone: '+40756777888',
      },
      {
        id: 'a1000003-0000-4000-8000-000000000003',
        firstName: 'Mihai',
        lastName: 'Constantin',
        jobTitle: 'Operator utilaj',
        nationality: 'RO',
        phone: '+40768999000',
        medicCurantName: null,
        medicCurantPhone: null,
      },
      {
        id: 'a1000004-0000-4000-8000-000000000004',
        firstName: 'Ioana',
        lastName: 'Gheorghe',
        jobTitle: 'Inginer',
        nationality: 'RO',
        phone: '+40712345678',
        medicCurantName: 'Dr. Radu Munteanu',
        medicCurantPhone: '+40723456789',
      },
      {
        id: 'a1000005-0000-4000-8000-000000000005',
        firstName: 'Cristian',
        lastName: 'Stanescu',
        jobTitle: 'Electrician',
        nationality: 'RO',
        phone: '+40734567890',
        medicCurantName: null,
        medicCurantPhone: null,
      },
    ]

    for (const emp of demoEmployees) {
      await prisma.employee.upsert({
        where: { id: emp.id },
        update: {
          medicCurantName: emp.medicCurantName,
          medicCurantPhone: emp.medicCurantPhone,
        },
        create: {
          id: emp.id,
          tenantId: exempluTenantId,
          firstName: emp.firstName,
          lastName: emp.lastName,
          jobTitle: emp.jobTitle,
          nationality: emp.nationality,
          phone: emp.phone,
          medicCurantName: emp.medicCurantName,
          medicCurantPhone: emp.medicCurantPhone,
        },
      })
    }
    console.log(`Seeded ${demoEmployees.length} demo employees (${demoEmployees.filter(e => e.medicCurantName).length} with medic curant).`)

    // Seed demo companies and contacts for "Exemplu Cabinet"
    console.log('\nSeeding demo companies and contacts...')
    const demoCompanies = [
      {
        id: 'c1000001-0000-4000-8000-000000000001',
        name: 'SC Metalotehnica SRL',
        cui: '12345001',
        city: 'Cluj-Napoca',
        county: 'Cluj',
      },
      {
        id: 'c1000002-0000-4000-8000-000000000002',
        name: 'Fabrica de Utilaje SA',
        cui: '12345002',
        city: 'Turda',
        county: 'Cluj',
      },
      {
        id: 'c1000003-0000-4000-8000-000000000003',
        name: 'Construcții Moderne SRL',
        cui: '12345003',
        city: 'Cluj-Napoca',
        county: 'Cluj',
      },
    ]

    for (const comp of demoCompanies) {
      await prisma.company.upsert({
        where: { id: comp.id },
        update: {},
        create: {
          id: comp.id,
          tenantId: exempluTenantId,
          name: comp.name,
          cui: comp.cui,
          city: comp.city,
          county: comp.county,
          isActive: true,
        },
      })
    }

    // Contacts per company — idempotent: only create if none exist yet
    const demoContacts: Array<{
      companyId: string
      name: string
      role: 'hr' | 'ssm' | 'plant_manager'
      phone: string
      isPrimary: boolean
    }> = [
      // Metalotehnica
      { companyId: 'c1000001-0000-4000-8000-000000000001', name: 'Ioana Neagu', role: 'hr', phone: '+40721100001', isPrimary: true },
      { companyId: 'c1000001-0000-4000-8000-000000000001', name: 'Dan Rusu', role: 'ssm', phone: '+40721100002', isPrimary: false },
      { companyId: 'c1000001-0000-4000-8000-000000000001', name: 'Vlad Marinescu', role: 'plant_manager', phone: '+40721100003', isPrimary: false },
      // Fabrica de Utilaje
      { companyId: 'c1000002-0000-4000-8000-000000000002', name: 'Rodica Stan', role: 'hr', phone: '+40722200001', isPrimary: true },
      { companyId: 'c1000002-0000-4000-8000-000000000002', name: 'Mihai Drăghici', role: 'ssm', phone: '+40722200002', isPrimary: false },
      // Construcții Moderne
      { companyId: 'c1000003-0000-4000-8000-000000000003', name: 'Andrei Florescu', role: 'hr', phone: '+40723300001', isPrimary: true },
      { companyId: 'c1000003-0000-4000-8000-000000000003', name: 'Simona Lupu', role: 'ssm', phone: '+40723300002', isPrimary: false },
    ]

    for (const companyId of demoCompanies.map((c) => c.id)) {
      const existingCount = await prisma.companyContact.count({ where: { companyId } })
      if (existingCount === 0) {
        const contacts = demoContacts.filter((c) => c.companyId === companyId)
        for (const contact of contacts) {
          await prisma.companyContact.create({ data: contact })
        }
      }
    }
    console.log(`Seeded ${demoCompanies.length} demo companies with contacts.`)
  } else {
    console.log('Exemplu Cabinet tenant not found — skipping demo employees.')
  }

  // Create comp Subscription for all existing tenants that don't have one
  console.log('\nCreating comp subscriptions for existing tenants...')
  const tenants = await prisma.tenant.findMany({ where: { deletedAt: null } })
  let created = 0
  for (const tenant of tenants) {
    const existing = await prisma.subscription.findFirst({ where: { tenantId: tenant.id } })
    if (!existing) {
      await prisma.subscription.create({
        data: { tenantId: tenant.id, tier: 'enterprise', status: 'comp' },
      })
      created++
    }
  }
  console.log(`Created ${created} comp subscription(s).`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
