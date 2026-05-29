'use client'

import Link from 'next/link'
import type { SubscriptionStatus, PlanTier } from '@prisma/client'

interface SubscriptionBannerProps {
  subscription: {
    status: SubscriptionStatus
    trialEndsAt: Date | null
    tier: PlanTier
  } | null
}

export function SubscriptionBanner({ subscription }: SubscriptionBannerProps) {
  if (!subscription) return null

  const { status, trialEndsAt } = subscription

  if (status === 'trial_active' && trialEndsAt) {
    const daysLeft = Math.ceil((trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))

    if (daysLeft > 7) {
      // Subtle info banner — trial is still comfortable
      return (
        <div className="bg-blue-50 border-b border-blue-200 text-blue-800">
          <div className="container mx-auto px-4 py-2 flex items-center justify-between gap-4 text-[13px]">
            <span>
              Ești în perioada de trial.{' '}
              {daysLeft} {daysLeft === 1 ? 'zi' : 'zile'} rămase.
            </span>
            <Link
              href="/settings/billing"
              className="shrink-0 font-medium underline underline-offset-2 hover:text-blue-900 transition-colors"
            >
              Vezi planuri
            </Link>
          </div>
        </div>
      )
    }

    return (
      <div className="bg-amber-50 border-b border-amber-200 text-amber-800">
        <div className="container mx-auto px-4 py-2 flex items-center justify-between gap-4 text-[13px]">
          <span>
            {daysLeft <= 0
              ? 'Trial-ul tău expiră astăzi.'
              : `Mai ai ${daysLeft} ${daysLeft === 1 ? 'zi' : 'zile'} din trial.`}
          </span>
          <Link
            href="/settings/billing"
            className="shrink-0 font-medium underline underline-offset-2 hover:text-amber-900 transition-colors"
          >
            Alege un plan
          </Link>
        </div>
      </div>
    )
  }

  if (status === 'trial_expired') {
    return (
      <div className="bg-red-50 border-b border-red-200 text-red-800">
        <div className="container mx-auto px-4 py-2 flex items-center justify-between gap-4 text-[13px]">
          <span>Perioada de trial a expirat. Accesul la funcționalități este restricționat.</span>
          <Link
            href="/settings/billing"
            className="shrink-0 font-medium underline underline-offset-2 hover:text-red-900 transition-colors"
          >
            Activează subscripția
          </Link>
        </div>
      </div>
    )
  }

  if (status === 'past_due') {
    return (
      <div className="bg-red-50 border-b border-red-200 text-red-800">
        <div className="container mx-auto px-4 py-2 flex items-center justify-between gap-4 text-[13px]">
          <span>Plata subscripției a eșuat. Actualizează metoda de plată.</span>
          <Link
            href="/settings/billing"
            className="shrink-0 font-medium underline underline-offset-2 hover:text-red-900 transition-colors"
          >
            Actualizează
          </Link>
        </div>
      </div>
    )
  }

  return null
}
