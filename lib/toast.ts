/**
 * Centralized toast helpers.
 *
 * Use these helpers for Buzomed-specific patterns so messages stay
 * consistent and translatable. Client-side only.
 */

import { toast } from 'sonner'

// ─── Generic ────────────────────────────────────────────────────────

export function toastSuccess(message: string, description?: string) {
  toast.success(message, { description })
}

export function toastError(message: string, description?: string) {
  toast.error(message, { description })
}

export function toastInfo(message: string, description?: string) {
  toast.info(message, { description })
}

export function toastWarning(message: string, description?: string) {
  toast.warning(message, { description })
}

export function toastLoading(message: string): string | number {
  return toast.loading(message)
}

export function toastDismiss(id: string | number) {
  toast.dismiss(id)
}

/**
 * Success toast with an "Undo" action. Returns the toast id.
 *
 * The onUndo callback is invoked when the user clicks Undo within the duration.
 * If the toast expires without action, nothing happens — caller's optimistic
 * action stands.
 */
export function toastUndo(
  message: string,
  options: {
    description?: string
    onUndo: () => void | Promise<void>
    undoLabel?: string
    duration?: number
  }
): string | number {
  return toast.success(message, {
    description: options.description,
    duration: options.duration ?? 6000,
    action: {
      label: options.undoLabel ?? 'Anulează',
      onClick: () => {
        void options.onUndo()
      },
    },
  })
}

// ─── Domain-specific ─────────────────────────────────────────────────

export const TOAST = {
  // Companies
  companySaved: (name: string) =>
    toast.success(`Companie salvată`, { description: name }),
  companyDeleted: (name: string, onUndo?: () => void) =>
    onUndo
      ? toastUndo(`Companie eliminată`, { description: name, onUndo })
      : toast.success(`Companie eliminată`, { description: name }),

  // Employees
  employeeSaved: (name: string) =>
    toast.success(`Angajat salvat`, { description: name }),
  employeeArchived: (name: string, onUndo?: () => void) =>
    onUndo
      ? toastUndo(`Angajat arhivat`, { description: name, onUndo })
      : toast.success(`Angajat arhivat`, { description: name }),
  importSuccess: (count: number) =>
    toast.success(`Import finalizat`, {
      description: `${count} angajați importați cu succes`,
    }),

  // Examinations
  examinationCreated: () =>
    toast.success(`Examinare creată`),
  examinationSigned: (number: string) =>
    toast.success(`Fișă semnată`, { description: `Nr. ${number}` }),
  examinationCancelled: (onUndo?: () => void) =>
    onUndo
      ? toastUndo(`Examinare anulată`, { onUndo })
      : toast.success(`Examinare anulată`),

  // Recalls / Scheduling
  recallScheduled: (name: string) =>
    toast.success(`Programare creată`, { description: name }),
  recallCancelled: (onUndo?: () => void) =>
    onUndo
      ? toastUndo(`Programare anulată`, { onUndo })
      : toast.success(`Programare anulată`),
  batchScheduled: (count: number) =>
    toast.success(`Programări create`, {
      description: `${count} examinări programate`,
    }),

  // Team
  userUpdated: (name: string) =>
    toast.success(`Cont actualizat`, { description: name }),
  userArchived: (name: string, onUndo?: () => void) =>
    onUndo
      ? toastUndo(`Cont arhivat`, { description: name, onUndo })
      : toast.success(`Cont arhivat`, { description: name }),

  // Generic
  saved: () => toast.success(`Salvat`),
  error: (msg?: string) =>
    toast.error(msg || `A apărut o eroare. Încearcă din nou.`),
  networkError: () =>
    toast.error(`Eroare de rețea. Verifică conexiunea.`),
} as const
