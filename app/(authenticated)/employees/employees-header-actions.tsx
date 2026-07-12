'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { NewVaccinationModal } from '@/components/employees/new-vaccination-modal'

interface Props {
  canWrite: boolean
  newEmployeeLabel: string
  newVaccinationLabel: string
  mergeLabel: string
}

export function EmployeesHeaderActions({
  canWrite,
  newEmployeeLabel,
  newVaccinationLabel,
  mergeLabel,
}: Props) {
  const [showVaccinationModal, setShowVaccinationModal] = useState(false)
  const router = useRouter()

  if (!canWrite) return null

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setShowVaccinationModal(true)}>
          + {newVaccinationLabel}
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/employees/merge">{mergeLabel}</Link>
        </Button>
        <Button asChild size="sm">
          <Link href="/employees/new">+ {newEmployeeLabel}</Link>
        </Button>
      </div>

      {showVaccinationModal && (
        <NewVaccinationModal
          onClose={() => setShowVaccinationModal(false)}
          onSuccess={() => router.refresh()}
        />
      )}
    </>
  )
}
