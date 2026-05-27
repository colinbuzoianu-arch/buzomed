'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { NewMedicalEventModal } from '@/components/employees/new-medical-event-modal'

interface Props {
  label: string
}

export function MedicalEventsHeaderActions({ label }: Props) {
  const [showModal, setShowModal] = useState(false)
  const router = useRouter()

  return (
    <>
      <Button size="sm" onClick={() => setShowModal(true)}>
        + {label}
      </Button>

      {showModal && (
        <NewMedicalEventModal
          onClose={() => setShowModal(false)}
          onSuccess={() => router.refresh()}
        />
      )}
    </>
  )
}
