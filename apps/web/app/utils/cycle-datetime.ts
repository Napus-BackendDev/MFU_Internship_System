const bangkokDateTimeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
})

export function formatBangkokDateTimeInput(date: Date): string {
  const parts = Object.fromEntries(
    bangkokDateTimeFormatter
      .formatToParts(date)
      .map(({ type, value }) => [type, value])
  )
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

export function bangkokDateTimeInputToIso(value: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(value)) return undefined
  const date = new Date(`${value}:00+07:00`)
  if (Number.isNaN(date.getTime())) return undefined
  return formatBangkokDateTimeInput(date) === value
    ? date.toISOString()
    : undefined
}
