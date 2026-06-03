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
    // TODO: create new Stripe recurring price for Starter (99 RON/month, currency RON) and update stripePriceId
    { name: 'Starter',    tier: 'starter'    as const, monthlyPrice: 99,  maxEmployees: 100,  isPublic: true,  stripePriceId: 'price_1TeG2vQi3J3l1LWun2U5Mlgx' },
    // TODO: create new Stripe recurring price for Growth (299 RON/month, currency RON) and update stripePriceId
    { name: 'Growth',     tier: 'growth'     as const, monthlyPrice: 299, maxEmployees: 500,  isPublic: true,  stripePriceId: 'price_1TeG3cQi3J3l1LWugF8XF51o' },
    // TODO: create new Stripe recurring price for Pro (699 RON/month, currency RON) and update stripePriceId
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
