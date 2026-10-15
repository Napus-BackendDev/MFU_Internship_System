import { afterAll, describe, expect, it } from 'vitest'
import { createConnection } from 'mongoose'
import { createModels } from '../src/runtime/models.js'

const connection = createConnection()
const Student = createModels(connection).Student
afterAll(async () => connection.close())

describe('Worker reads names persisted by the Student API and legacy seed', () => {
  it.each([
    'นักศึกษา ทดสอบ Workflow',
    { th: 'นักศึกษาทดสอบ', en: 'Test Student' },
    { en: 'English Student' }
  ])(
    'preserves stored student name %j when hydrating a database record',
    (name) => {
      const student = Student.hydrate({ studentId: 'qa-student', name })
      expect(student.name).toEqual(name)
    }
  )
})
