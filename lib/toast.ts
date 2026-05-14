/**
 * Centralized toast helpers.
 *
 * Import `toast` from sonner directly at call sites, but use these
 * helpers for the common Buzomed-specific patterns so the messages
 * stay consistent and translatable in the future.
 *
 * These run client-side only. Do not import in server components.
 */

import { toast } from 'sonner'

// ─── Generic ────────────────────────────────────────────────────────

export function toastSuccess(message: string, description?: string) {
  toast.success(message, { description })
}

export function toastError(message: string, description?: string) {
  toast.error(message, { description })
}

export function toastLoading(message: string): string | number {
  return toast.loading(message)
}

export function toastDismiss(id: string | number) {
  toast.dismiss(id)
}

// ─── Domain-specific ─────────────────────────────────────────────────

export const TOAST = {
  // Companies
  companySaved: (name: string) =>
    toast.success(`Companie salvată`, { description: name }),
  companyDeleted: (name: string) =>
    toast.success(`Companie eliminată`, { description: name }),

  // Employees
  employeeSaved: (name: string) =>
    toast.success(`Angajat salvat`, { description: name }),
  employeeArchived: (name: string) =>
    toast.success(`Angajat arhivat`, { description: name }),
  importSuccess: (count: number) =>
    toast.success(`Import finalizat`, {
      description: `${count} angajați importați cu succes`,
    }),

  // Examinations
  examinationCreated: () =>
    toast.success(`Examinare creată`),
  examinationSigned: (number: string) =>
    toast.success(`Fișă semnată`, { description: `Nr. ${number}` }),
  examinationCancelled: () =>
    toast.success(`Examinare anulată`),

  // Recalls / Scheduling
  recallScheduled: (name: string) =>
    toast.success(`Programare creată`, { description: name }),
  recallCancelled: () =>
    toast.success(`Programare anulată`),

  // Team
  userUpdated: (name: string) =>
    toast.success(`Cont actualizat`, { description: name }),
  userArchived: (name: string) =>
    toast.success(`Cont arhivat`, { description: name }),

  // Generic
  saved: () => toast.success(`Salvat`),
  error: (msg?: string) =>
    toast.error(msg || `A apărut o eroare. Încearcă din nou.`),
  networkError: () =>
    toast.error(`Eroare de rețea. Verifică conexiunea.`),
} as const
