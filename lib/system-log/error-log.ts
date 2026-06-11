import { prisma } from '@/lib/prisma'

// CRITICAL PRIVACY RULE: context must only contain IDs, enums, counts, or
// other non-PII scalars (e.g. employeeId, companyId, rowNumber, rowCount).
// NEVER pass full records, names, emails, CNPs, addresses, phone numbers,
// dates of birth, or any clinical/medical data into context.
// Allowed: { employeeId, companyId, tenantId, rowNumber, rowCount, workplaceId }
// Forbidden: { firstName, lastName, email, cnp, birthDate, diagnosis, ... }

export async function logSystemError(params: {
  tenantId?: string | null
  route: string
  method: string
  error: unknown
  context?: Record<string, string | number | boolean | null>
}): Promise<void> {
  try {
    const message = params.error instanceof Error ? params.error.message : String(params.error)
    const stackTrace = params.error instanceof Error ? (params.error.stack ?? null) : null
    const errorType = params.error instanceof Error ? params.error.constructor.name : typeof params.error

    await prisma.systemErrorLog.create({
      data: {
        tenantId: params.tenantId ?? null,
        route: params.route,
        method: params.method,
        errorType,
        message,
        stackTrace,
        context: params.context ?? undefined,
      },
    })
  } catch (fallbackErr) {
    console.error('[system-error-log] DB write failed:', fallbackErr)
    console.error('[system-error-log] Original error:', params.error)
  }
}
