import type { CompanyContactRole } from '@prisma/client'
import { optionalString, requireString } from '@/lib/validation'

const VALID_ROLES: CompanyContactRole[] = [
  'hr',
  'ssm',
  'plant_manager',
  'shift_supervisor',
  'lab',
  'billing',
  'other',
]

export interface ParsedContactInput {
  name?: string
  role?: CompanyContactRole
  roleNote?: string
  phone?: string
  email?: string
  isPrimary?: boolean
  notes?: string
}

export function parseCompanyContactInput(
  body: Record<string, unknown>,
  issues: string[],
  opts: { isCreate: boolean }
): ParsedContactInput {
  const result: ParsedContactInput = {}

  result.name = opts.isCreate
    ? requireString('name', body.name, issues, { maxLength: 200 })
    : optionalString('name', body.name, issues, { maxLength: 200 })

  if (body.role !== undefined) {
    if (!VALID_ROLES.includes(body.role as CompanyContactRole)) {
      issues.push(`role must be one of: ${VALID_ROLES.join(', ')}`)
    } else {
      result.role = body.role as CompanyContactRole
    }
  } else if (opts.isCreate) {
    issues.push('role is required')
  }

  result.roleNote = optionalString('roleNote', body.roleNote, issues, {
    maxLength: 100,
  })
  result.phone = optionalString('phone', body.phone, issues, { maxLength: 40 })
  result.notes = optionalString('notes', body.notes, issues, { maxLength: 500 })

  if (body.email !== undefined) {
    const emailStr = optionalString('email', body.email, issues, {
      maxLength: 200,
    })
    if (emailStr) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr)) {
        issues.push('email must be a valid email address')
      } else {
        result.email = emailStr
      }
    }
  }

  if (body.isPrimary !== undefined) {
    if (typeof body.isPrimary !== 'boolean') {
      issues.push('isPrimary must be a boolean')
    } else {
      result.isPrimary = body.isPrimary
    }
  }

  return result
}
