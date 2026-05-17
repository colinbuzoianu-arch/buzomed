'use client'

import { useState, useCallback, useRef } from 'react'

export interface AnafCompanyData {
  cui: string
  denumire: string
  adresa: string
  nrRegCom: string
  codCaen: string
  telefon: string
  codPostal: string
  platitorTva: boolean
  inactiv: boolean
  eFactura: boolean
}

export type AnafStatus = 'idle' | 'loading' | 'found' | 'inactive' | 'error'

export function useAnafLookup(
  onSuccess?: (data: AnafCompanyData) => void,
  debounceMs = 600
) {
  const [data, setData] = useState<AnafCompanyData | null>(null)
  const [status, setStatus] = useState<AnafStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const lookup = useCallback(
    (cui: string) => {
      if (timerRef.current) clearTimeout(timerRef.current)

      const clean = cui.replace(/\s/g, '')
      // Fire only when the CUI is plausibly complete (6–10 digits).
      if (!/^\d{6,10}$/.test(clean)) {
        setData(null)
        setStatus('idle')
        setError(null)
        return
      }

      timerRef.current = setTimeout(async () => {
        setStatus('loading')
        setError(null)
        setData(null)

        try {
          const res = await fetch(`/api/anaf?cui=${clean}`)
          const json = await res.json()

          if (!res.ok) {
            setError(json.error ?? 'Eroare necunoscută.')
            setStatus('error')
            return
          }

          setData(json)
          setStatus(json.inactiv ? 'inactive' : 'found')
          onSuccess?.(json)
        } catch {
          setError('Nu s-a putut conecta la ANAF.')
          setStatus('error')
        }
      }, debounceMs)
    },
    [onSuccess, debounceMs]
  )

  const reset = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setData(null)
    setStatus('idle')
    setError(null)
  }, [])

  return { lookup, data, status, error, reset }
}
