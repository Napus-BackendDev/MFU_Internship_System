import { describe, expect, it } from 'vitest'
import { Types } from 'mongoose'

import { studentReferenceFilter } from '../src/runtime/student-reference.js'

describe('worker student reference filters', () => {
  it('uses student number only when the reference is not an ObjectId', () => {
    expect(studentReferenceFilter('student-1001')).toEqual({
      $or: [{ studentId: 'student-1001' }]
    })
  })

  it('supports canonical MongoDB IDs without invalid casting', () => {
    expect(studentReferenceFilter('507f1f77bcf86cd799439011')).toEqual({
      $or: [
        { studentId: '507f1f77bcf86cd799439011' },
        { _id: new Types.ObjectId('507f1f77bcf86cd799439011') }
      ]
    })
  })
})
