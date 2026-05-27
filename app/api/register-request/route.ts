import { NextRequest, NextResponse } from 'next/server'

export async function POST(_request: NextRequest) {
  // Registration is invite-only as of June 2026.
  return NextResponse.json(
    {
      error: 'registration_disabled',
      message:
        'Înregistrarea publică este dezactivată. Contactați echipa Buzomed la hello@buzomed.com pentru acces.',
    },
    { status: 403 }
  )
}
