/**
 * Day boundaries in the cabinet's wall-clock time zone (Europe/Bucharest).
 *
 * The rest of the dashboard computes "today" with setUTCHours, which is wrong
 * for Romania: an exam scheduled at 23:30 Bucharest time (21:30 UTC in summer)
 * is still *today* for the doctor, but a UTC day-end of 23:59:59Z would place
 * it correctly only by luck, and a 00:30 Bucharest exam would wrongly land on
 * the previous UTC day. The agenda must use the civil day the user sees.
 *
 * We avoid a date library: Intl gives us both the civil Y-M-D in the zone and
 * the zone's offset at a given instant, which is enough to pin the two UTC
 * instants that bound the Bucharest day (DST-correct, since the offset is read
 * at the computed midnight rather than assumed).
 */

export const BUCHAREST_TZ = 'Europe/Bucharest'

/** Offset (localTime − UTC) in ms for `date` in `tz`. */
function tzOffsetMs(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = dtf.formatToParts(date)
  const map: Record<string, number> = {}
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = Number(p.value)
  }
  const asUtc = Date.UTC(map.year, map.month - 1, map.day, map.hour, map.minute, map.second)
  return asUtc - date.getTime()
}

/** The civil Y-M-D (1-based month) in Bucharest for the instant `now`. */
export function bucharestYmd(now: Date = new Date()): { y: number; m: number; d: number } {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUCHAREST_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  const [y, m, d] = ymd.split('-').map(Number)
  return { y, m, d }
}

/**
 * The UTC instant of local midnight (00:00:00.000 Bucharest) for the given
 * civil date. `month` is 1-based. Correct through DST (the offset is read at
 * the computed midnight; DST changes never happen at local midnight here).
 */
export function bucharestMidnightUtc(year: number, month: number, day: number): Date {
  const guess = Date.UTC(year, month - 1, day, 0, 0, 0, 0)
  const offset = tzOffsetMs(new Date(guess), BUCHAREST_TZ)
  return new Date(guess - offset)
}

/**
 * Returns the UTC instants that bound the Bucharest civil day containing
 * `now`: `start` is 00:00:00.000 and `end` is 23:59:59.999 local time.
 */
export function bucharestDayBounds(now: Date = new Date()): { start: Date; end: Date } {
  const { y, m, d } = bucharestYmd(now)
  const start = bucharestMidnightUtc(y, m, d)
  return {
    start,
    end: new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1),
  }
}

/** HH:mm of `date` in Bucharest time. */
export function bucharestTime(date: Date): string {
  return new Intl.DateTimeFormat('ro-RO', {
    timeZone: BUCHAREST_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date)
}
