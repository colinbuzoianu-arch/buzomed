export type Horizon = 'overdue' | 'thisWeek' | 'thisMonth' | 'next3Months' | 'all'

export const VALID_HORIZONS: Horizon[] = ['overdue', 'thisWeek', 'thisMonth', 'next3Months', 'all']

export function getHorizonRange(horizon: Horizon): {
  from: Date | null
  to: Date | null
} {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  switch (horizon) {
    case 'overdue':
      return { from: null, to: today }
    case 'thisWeek': {
      const end = new Date(today)
      end.setUTCDate(today.getUTCDate() + 7)
      return { from: today, to: end }
    }
    case 'thisMonth': {
      const end = new Date(today)
      end.setUTCDate(today.getUTCDate() + 30)
      return { from: today, to: end }
    }
    case 'next3Months': {
      const end = new Date(today)
      end.setUTCDate(today.getUTCDate() + 90)
      return { from: today, to: end }
    }
    case 'all':
      return { from: null, to: null }
  }
}
