#!/usr/bin/env node
/**
 * Session 14 schema patch.
 *
 * Adds `isDemo Boolean @default(false) @map("is_demo")` to the Tenant
 * model in prisma/schema.prisma.
 *
 * Safe to re-run: checks if the field already exists before inserting.
 *
 * Usage: node scripts/apply-schema-patch-14.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const schemaPath = path.resolve(__dirname, '..', 'prisma', 'schema.prisma')
const content = fs.readFileSync(schemaPath, 'utf8')

if (content.includes('isDemo')) {
  console.log('✓ isDemo already present in schema.prisma — nothing to do.')
  process.exit(0)
}

// Insert isDemo after the cnpHashSalt line
const patched = content.replace(
  /(\s+cnpHashSalt\s+String\?[^\n]+\n)/,
  `$1\n  isDemo              Boolean             @default(false) @map("is_demo")\n`
)

if (patched === content) {
  console.error('✗ Could not find cnpHashSalt line to insert after. Check schema.prisma manually.')
  console.error('  Add this line to the Tenant model:')
  console.error('  isDemo  Boolean  @default(false)  @map("is_demo")')
  process.exit(1)
}

fs.writeFileSync(schemaPath, patched)
console.log('✓ Patched prisma/schema.prisma — added isDemo to Tenant model.')
console.log('  Next: npx prisma generate')
