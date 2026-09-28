import { describe, expect, it, vi } from 'vitest'

import { persistStudentRows } from '../app/utils/student-import-outcomes'

describe('student onboarding persistence outcomes', () => {
  it('counts only confirmed API successes and retains failed rows for correction', async () => {
    const rows = [
      { tempId: 'row-created' },
      { tempId: 'row-conflict' },
      { tempId: 'row-created-2' }
    ]
    const persist = vi.fn(async (row: (typeof rows)[number]) => {
      if (row.tempId === 'row-conflict') throw new Error('duplicate student')
    })

    const result = await persistStudentRows(rows, persist)

    expect(result.saved.map((row) => row.tempId)).toEqual([
      'row-created',
      'row-created-2'
    ])
    expect(result.failed).toEqual([rows[1]])
    expect(persist).toHaveBeenCalledTimes(3)
  })
})
