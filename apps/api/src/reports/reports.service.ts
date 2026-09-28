import type { AuthenticatedActor } from '@internship/shared-types'
import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import type { Model } from 'mongoose'
import type { ClientSession } from 'mongoose'

import { scopeFilter } from '../common/scope.js'
import { DeliveryRecord } from '../correspondence/correspondence.schema.js'
import { GeneratedDocumentRecord } from '../documents/document.schema.js'
import {
  EvaluationAssignmentRecord,
  EvaluationCycleRecord
} from '../evaluations/evaluation.schema.js'
import { StudentRecord } from '../members/members.schema.js'
import { studentReferenceFilter } from '../members/student-reference.js'

export interface ReportFilters {
  readonly termId?: string
  readonly schoolId?: string
  readonly programId?: string
}

function isTenantWideReportReader(actor: AuthenticatedActor): boolean {
  if (actor.roles.includes('systemAdmin')) return true
  if (actor.roleScopes) {
    return actor.roleScopes.some(
      (scope) =>
        scope.role === 'internshipStaff' &&
        actor.roles.includes(scope.role) &&
        scope.tenant
    )
  }
  return (
    actor.roles.length === 1 &&
    actor.roles.includes('internshipStaff') &&
    actor.scope.tenant
  )
}

interface OverviewAggregateResult {
  readonly assignmentStates: readonly {
    readonly _id: string
    readonly count: number
  }[]
  readonly deliverySummary: readonly { readonly count: number }[]
  readonly studentSummary: readonly {
    readonly students: number
    readonly readyDocuments: number
  }[]
}

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
    private readonly documents: Model<GeneratedDocumentRecord>,
    @InjectModel(EvaluationCycleRecord.name)
    private readonly cycles: Model<EvaluationCycleRecord>
  ) {}

  public async overview(
    actor: AuthenticatedActor,
    filters: ReportFilters = {}
  ): Promise<unknown> {
    const assignmentFilter = await this.assignmentFilter(actor, filters)
    const requirePlacementScope = !isTenantWideReportReader(actor)
    const documentSnapshotConditions: Readonly<Record<string, unknown>>[] = []
    if (filters.termId) {
      documentSnapshotConditions.push({
        $eq: ['$sourceSnapshot.placement.academicTermId', filters.termId]
      })
    }
    if (filters.schoolId) {
      documentSnapshotConditions.push({
        $eq: ['$sourceSnapshot.placement.schoolId', filters.schoolId]
      })
    }
    if (filters.programId) {
      documentSnapshotConditions.push({
        $eq: ['$sourceSnapshot.placement.programId', filters.programId]
      })
    }
    const [summary] = await this.assignments
      .aggregate<OverviewAggregateResult>([
        { $match: assignmentFilter },
        {
          $facet: {
            assignmentStates: [
              { $group: { _id: '$status', count: { $sum: 1 } } }
            ],
            deliverySummary: [
              { $project: { assignmentId: { $toString: '$_id' } } },
              {
                $lookup: {
                  from: this.deliveries.collection.name,
                  let: { assignmentId: '$assignmentId' },
                  pipeline: [
                    {
                      $match: {
                        $expr: {
                          $and: [
                            { $eq: ['$assignmentId', '$$assignmentId'] },
                            { $in: ['$status', ['failed', 'uncertain']] }
                          ]
                        }
                      }
                    },
                    { $count: 'count' }
                  ],
                  as: 'matches'
                }
              },
              { $unwind: '$matches' },
              { $group: { _id: null, count: { $sum: '$matches.count' } } }
            ],
            studentSummary: [
              {
                $group: {
                  _id: '$studentId',
                  placementIds: { $addToSet: '$placementId' }
                }
              },
              {
                $lookup: {
                  from: this.students.collection.name,
                  let: { reference: '$_id' },
                  pipeline: [
                    {
                      $match: {
                        $expr: {
                          $or: [
                            { $eq: ['$studentId', '$$reference'] },
                            { $eq: [{ $toString: '$_id' }, '$$reference'] }
                          ]
                        }
                      }
                    },
                    { $project: { studentId: 1 } }
                  ],
                  as: 'student'
                }
              },
              {
                $addFields: {
                  canonicalStudentId: {
                    $ifNull: [
                      { $toString: { $arrayElemAt: ['$student._id', 0] } },
                      '$_id'
                    ]
                  },
                  studentNumber: { $arrayElemAt: ['$student.studentId', 0] }
                }
              },
              { $unwind: '$placementIds' },
              {
                $group: {
                  _id: '$canonicalStudentId',
                  studentNumber: { $first: '$studentNumber' },
                  placementIds: { $addToSet: '$placementIds' }
                }
              },
              {
                $lookup: {
                  from: this.documents.collection.name,
                  let: {
                    recordId: '$_id',
                    studentNumber: '$studentNumber',
                    placementIds: '$placementIds'
                  },
                  pipeline: [
                    {
                      $match: {
                        $expr: {
                          $and: [
                            { $eq: ['$status', 'ready'] },
                            {
                              $or: [
                                { $eq: ['$studentId', '$$recordId'] },
                                { $eq: ['$studentId', '$$studentNumber'] }
                              ]
                            },
                            ...(requirePlacementScope
                              ? [
                                  {
                                    $in: [
                                      '$sourceSnapshot.placement.id',
                                      '$$placementIds'
                                    ]
                                  }
                                ]
                              : []),
                            ...documentSnapshotConditions
                          ]
                        }
                      }
                    },
                    { $count: 'count' }
                  ],
                  as: 'documents'
                }
              },
              {
                $addFields: {
                  readyDocumentCount: {
                    $ifNull: [{ $arrayElemAt: ['$documents.count', 0] }, 0]
                  }
                }
              },
              {
                $group: {
                  _id: null,
                  students: { $sum: 1 },
                  readyDocuments: { $sum: '$readyDocumentCount' }
                }
              }
            ]
          }
        }
      ])
      .exec()
    const assignmentStates = summary?.assignmentStates ?? []
    const assignments = Object.fromEntries(
      assignmentStates.map((state) => [state._id, state.count])
    )
    return {
      students: summary?.studentSummary[0]?.students ?? 0,
      assignments,
      failedDeliveries: summary?.deliverySummary[0]?.count ?? 0,
      readyDocuments: summary?.studentSummary[0]?.readyDocuments ?? 0,
      generatedAt: new Date().toISOString()
    }
  }

  public async programs(
    actor: AuthenticatedActor,
    filters: ReportFilters = {}
  ): Promise<unknown> {
    return this.assignments.aggregate([
      { $match: await this.assignmentFilter(actor, filters) },
      {
        $group: {
          _id: { programId: '$programId', status: '$status' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.programId': 1, '_id.status': 1 } }
    ])
  }

  public async assignmentFilter(
    actor: AuthenticatedActor,
    filters: ReportFilters,
    session?: ClientSession
  ): Promise<Record<string, unknown>> {
    const conditions: Record<string, unknown>[] = []
    const authorizedScopes: Record<string, unknown>[] = [
      scopeFilter<EvaluationAssignmentRecord>(actor)
    ]
    if (actor.roles.includes('student') && actor.scope.studentId) {
      const student = await this.students
        .findOne(studentReferenceFilter(actor.scope.studentId))
        .select('_id studentId')
        .lean()
        .exec()
      const studentIds = [actor.scope.studentId]
      if (student?._id) studentIds.push(student._id.toString())
      if (student?.studentId) studentIds.push(student.studentId)
      authorizedScopes.push({ studentId: { $in: [...new Set(studentIds)] } })
    }
    conditions.push(
      authorizedScopes.length === 1
        ? authorizedScopes[0]!
        : { $or: authorizedScopes }
    )
    if (filters.schoolId) conditions.push({ schoolId: filters.schoolId })
    if (filters.programId) conditions.push({ programId: filters.programId })
    if (filters.termId) {
      const cycleQuery = this.cycles
        .find({ academicTermId: filters.termId })
        .select('_id')
      if (session) cycleQuery.session(session)
      const cycles = await cycleQuery.lean().exec()
      conditions.push({
        cycleId: { $in: cycles.map((cycle) => cycle._id.toString()) }
      })
    }
    return { $and: conditions }
  }
}
