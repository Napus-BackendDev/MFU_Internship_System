import type { AuthenticatedActor } from '@internship/shared-types'
import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import type { Model } from 'mongoose'

import { scopeFilter } from '../common/scope.js'
import { DeliveryRecord } from '../correspondence/correspondence.schema.js'
import { GeneratedDocumentRecord } from '../documents/document.schema.js'
import { EvaluationAssignmentRecord } from '../evaluations/evaluation.schema.js'
import { StudentRecord } from '../members/members.schema.js'

@Injectable()
export class ReportsService {
  public constructor(
    @InjectModel(EvaluationAssignmentRecord.name)
    private readonly assignments: Model<EvaluationAssignmentRecord>,
    @InjectModel(StudentRecord.name)
    private readonly students: Model<StudentRecord>,
    @InjectModel(DeliveryRecord.name)
    private readonly deliveries: Model<DeliveryRecord>,
    @InjectModel(GeneratedDocumentRecord.name)
    private readonly documents: Model<GeneratedDocumentRecord>
  ) {}

  public async overview(actor: AuthenticatedActor): Promise<unknown> {
    let assignmentFilter: Record<string, unknown> =
      scopeFilter<EvaluationAssignmentRecord>(actor)
    if (actor.scope.studentId) {
      const student = await this.students
        .findOne({ studentId: actor.scope.studentId })
        .select('_id')
        .exec()
      const studentIdMatch = [actor.scope.studentId]
      if (student?._id) studentIdMatch.push(student._id.toString())
      assignmentFilter = { studentId: { $in: studentIdMatch } }
    }
    const studentFilter = actor.scope.studentId
      ? { studentId: actor.scope.studentId }
      : scopeFilter<StudentRecord>(actor)
    const scopedStudents = await this.students
      .find(studentFilter)
      .select('_id studentId')
      .lean()
      .exec()
    const scopedStudentIds = scopedStudents.flatMap((student) => [
      student._id.toString(),
      student.studentId
    ])
    const scopedAssignments = await this.assignments
      .find(assignmentFilter)
      .select('_id')
      .lean()
      .exec()
    const scopedAssignmentIds = scopedAssignments.map((item) =>
      item._id.toString()
    )
    const [assignmentStates, failedDeliveries, readyDocuments] =
      await Promise.all([
        this.assignments.aggregate<{ _id: string; count: number }>([
          { $match: assignmentFilter },
          { $group: { _id: '$status', count: { $sum: 1 } } }
        ]),
        this.deliveries.countDocuments({
          assignmentId: { $in: scopedAssignmentIds },
          status: { $in: ['failed', 'uncertain'] }
        }),
        this.documents.countDocuments({
          studentId: { $in: scopedStudentIds },
          status: 'ready'
        })
      ])
    const assignments = Object.fromEntries(
      assignmentStates.map((state) => [state._id, state.count])
    )
    return {
      students: scopedStudents.length,
      assignments,
      failedDeliveries,
      readyDocuments,
      generatedAt: new Date().toISOString()
    }
  }

  public programs(actor: AuthenticatedActor): Promise<unknown> {
    return this.assignments.aggregate([
      { $match: scopeFilter<EvaluationAssignmentRecord>(actor) },
      {
        $group: {
          _id: { programId: '$programId', status: '$status' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.programId': 1, '_id.status': 1 } }
    ])
  }
}
