// Display text for the academic-term and internship-period email placeholders,
// shared by the API preview and the Worker that renders the real email.

const thaiDate = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Bangkok'
})

export function formatAcademicTerm(
  semester: string | undefined,
  academicYear: number | undefined
): string {
  const normalized = semester?.trim().toLowerCase()
  const term =
    normalized === '1' || normalized === 'first'
      ? 'ภาคการศึกษาต้น'
      : normalized === '2' || normalized === 'second'
        ? 'ภาคการศึกษาปลาย'
        : normalized === '3' || normalized === 'summer'
          ? 'ภาคการศึกษาฤดูร้อน'
          : semester?.trim()
  // Thai documents print Buddhist-era years.
  const year =
    typeof academicYear === 'number' && Number.isFinite(academicYear)
      ? academicYear < 2400
        ? academicYear + 543
        : academicYear
      : undefined
  const parts = [term, year ? `ปีการศึกษา ${year}` : undefined].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : '-'
}

export function formatInternshipPeriod(
  startsAt: Date | string | undefined,
  endsAt: Date | string | undefined
): string {
  const format = (value: Date | string | undefined): string | undefined => {
    if (!value) return undefined
    const date = new Date(value)
    return Number.isFinite(date.getTime()) ? thaiDate.format(date) : undefined
  }
  const start = format(startsAt)
  const end = format(endsAt)
  return start && end ? `${start} – ${end}` : (start ?? end ?? '-')
}
