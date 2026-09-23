import { describe, expect, it } from 'vitest'
import { Types } from 'mongoose'

import { studentReferenceFilter } from '../src/members/student-reference.js'

describe('student reference filters', () => {
  it('does not cast a business student number to MongoDB ObjectId', () => {
    expect(studentReferenceFilter('student-1001')).toEqual({
      $or: [{ studentId: 'student-1001' }]
    })
  })

  it('matches both the canonical MongoDB ID and a legacy student number', () => {
    expect(studentReferenceFilter('507f1f77bcf86cd799439011')).toEqual({
      $or: [
        { studentId: '507f1f77bcf86cd799439011' },
        { _id: new Types.ObjectId('507f1f77bcf86cd799439011') }
      ]
    })
  })
})
