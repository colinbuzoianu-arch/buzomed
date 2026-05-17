import { NextRequest, NextResponse } from 'next/server'
import { getApiUser } from '@/lib/auth'

const ANAF_URL = 'https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva'

export async function GET(req: NextRequest) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const cui = req.nextUrl.searchParams.get('cui')?.trim()
  if (!cui || !/^\d{2,10}$/.test(cui)) {
    return NextResponse.json(
      { error: 'CUI invalid — trebuie să fie numeric, 2–10 cifre.' },
      { status: 400 }
    )
  }

  const today = new Date().toISOString().split('T')[0]

  try {
    const anafRes = await fetch(ANAF_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ cui: parseInt(cui, 10), data: today }]),
      signal: AbortSignal.timeout(8000),
    })

    if (!anafRes.ok) {
      return NextResponse.json(
        { error: `ANAF a returnat eroare HTTP ${anafRes.status}.` },
        { status: 502 }
      )
    }

    // v9 quirk: parse defensively — field order and types may differ from docs.
    const raw = await anafRes.json()
    const found = raw?.found?.[0]

    if (!found) {
      return NextResponse.json(
        { error: 'CUI negăsit în registrul ANAF.' },
        { status: 404 }
      )
    }

    const dg = (found.date_generale ?? {}) as Record<string, unknown>
    const tva = (found.inregistrare_scop_Tva ?? {}) as Record<string, unknown>
    const inactiv = (found.stare_inactiv ?? {}) as Record<string, unknown>

    return NextResponse.json({
      cui: String(dg.cui ?? cui),
      denumire: String(dg.denumire ?? ''),
      adresa: String(dg.adresa ?? ''),
      nrRegCom: String(dg.nrRegCom ?? ''),
      codCaen: String(dg.cod_CAEN ?? ''),
      telefon: String(dg.telefon ?? ''),
      codPostal: String(dg.codPostal ?? ''),
      platitorTva: tva.scpTVA === true,
      inactiv: inactiv.statusInactivi === true,
      eFactura: found.statusRO_e_Factura === true,
    })
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      return NextResponse.json(
        { error: 'ANAF nu a răspuns în timp util. Încearcă din nou.' },
        { status: 504 }
      )
    }
    console.error('[ANAF] fetch error:', err)
    return NextResponse.json(
      { error: 'Eroare la interogarea ANAF. Încearcă din nou.' },
      { status: 500 }
    )
  }
}
