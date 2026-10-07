import { loadEnvironment } from '@internship/config'
import { MongoClient, ObjectId, type Db } from 'mongodb'
import { createDevelopmentPinCredential } from './development-pin.js'

if (!process.env.NODE_ENV) process.env.NODE_ENV = 'development'
try {
  process.loadEnvFile('../../.env.development')
} catch {
  // Explicit environment variables remain authoritative.
}

const environment = loadEnvironment(process.env)
if (environment.NODE_ENV !== 'development') {
  throw new Error('Development seed is disabled outside NODE_ENV=development.')
}

const client = new MongoClient(environment.MONGODB_URI)
await client.connect()

try {
  const database = client.db()
  const now = new Date()
  const past = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
  const future = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000)

  // 1. Schools and Programs (14 Schools, 36 Programs from Mae Fah Luang University)
  const schoolsData = [
    {
      schoolCode: 'LA',
      name: {
        th: 'สำนักวิชาศิลปศาสตร์',
        en: 'School of Liberal Arts'
      },
      programs: [
        {
          programCode: 'ENG',
          name: { th: 'ภาษาอังกฤษ', en: 'English' },
          course: {
            code: '1001491',
            name: { th: 'การฝึกงานด้านภาษาอังกฤษ', en: 'English Internship' }
          }
        },
        {
          programCode: 'TLC',
          name: {
            th: 'ภาษาและวัฒนธรรมไทยสำหรับชาวต่างประเทศ',
            en: 'Thai Language and Culture for Foreigners'
          },
          course: {
            code: '1001492',
            name: {
              th: 'การฝึกงานภาษาและวัฒนธรรมไทยสำหรับชาวต่างประเทศ',
              en: 'Thai Language and Culture for Foreigners Internship'
            }
          }
        }
      ]
    },
    {
      schoolCode: 'SCI',
      name: {
        th: 'สำนักวิชาวิทยาศาสตร์',
        en: 'School of Science'
      },
      programs: [
        {
          programCode: 'AC',
          name: { th: 'เคมีประยุกต์', en: 'Applied Chemistry' },
          course: {
            code: '1101491',
            name: {
              th: 'การฝึกงานเคมีประยุกต์',
              en: 'Applied Chemistry Internship'
            }
          }
        },
        {
          programCode: 'BIO',
          name: { th: 'วิทยาศาสตร์ชีวภาพ', en: 'Biosciences' },
          course: {
            code: '1101492',
            name: {
              th: 'การฝึกงานวิทยาศาสตร์ชีวภาพ',
              en: 'Biosciences Internship'
            }
          }
        },
        {
          programCode: 'MATE',
          name: { th: 'วิศวกรรมวัสดุ', en: 'Materials Engineering' },
          course: {
            code: '1101493',
            name: {
              th: 'การฝึกงานวิศวกรรมวัสดุ',
              en: 'Materials Engineering Internship'
            }
          }
        }
      ]
    },
    {
      schoolCode: 'MGT',
      name: {
        th: 'สำนักวิชาการจัดการ',
        en: 'School of Management'
      },
      programs: [
        {
          programCode: 'BA',
          name: { th: 'บริหารธุรกิจ', en: 'Business Administration' },
          course: {
            code: '1201491',
            name: {
              th: 'การฝึกงานด้านการบริหารธุรกิจ',
              en: 'Business Administration Internship'
            }
          }
        },
        {
          programCode: 'ECON',
          name: { th: 'เศรษฐศาสตร์', en: 'Economics' },
          course: {
            code: '1201492',
            name: { th: 'การฝึกงานด้านเศรษฐศาสตร์', en: 'Economics Internship' }
          }
        },
        {
          programCode: 'ACC',
          name: { th: 'บัญชี', en: 'Accounting' },
          course: {
            code: '1201493',
            name: { th: 'การฝึกงานทางการบัญชี', en: 'Accounting Internship' }
          }
        },
        {
          programCode: 'TBE',
          name: {
            th: 'การจัดการการท่องเที่ยวและอีเวนต์',
            en: 'Tourism Business and Events'
          },
          course: {
            code: '1201494',
            name: {
              th: 'การฝึกงานการจัดการการท่องเที่ยวและอีเวนต์',
              en: 'Tourism Business and Events Internship'
            }
          }
        },
        {
          programCode: 'HBM',
          name: {
            th: 'การจัดการธุรกิจบริการ',
            en: 'Hospitality Business Management'
          },
          course: {
            code: '1201495',
            name: {
              th: 'การฝึกงานการจัดการธุรกิจบริการ',
              en: 'Hospitality Business Management Internship'
            }
          }
        }
      ]
    },
    {
      schoolCode: 'IT',
      name: {
        th: 'สำนักวิชาเทคโนโลยีดิจิทัลประยุกต์',
        en: 'School of Applied Digital Technology'
      },
      programs: [
        {
          programCode: 'CPE',
          name: { th: 'วิศวกรรมคอมพิวเตอร์', en: 'Computer Engineering' },
          course: {
            code: '1301491',
            name: {
              th: 'การฝึกงานวิศวกรรมคอมพิวเตอร์',
              en: 'Computer Engineering Internship'
            }
          }
        },
        {
          programCode: 'DCE',
          name: {
            th: 'วิศวกรรมดิจิทัลและการสื่อสาร',
            en: 'Digital and Communication Engineering'
          },
          course: {
            code: '1301492',
            name: {
              th: 'การฝึกงานวิศวกรรมดิจิทัลและการสื่อสาร',
              en: 'Digital & Communication Engineering Internship'
            }
          }
        },
        {
          programCode: 'SE',
          name: { th: 'วิศวกรรมซอฟต์แวร์', en: 'Software Engineering' },
          course: {
            code: '1301493',
            name: {
              th: 'การฝึกงานด้านวิศวกรรมซอฟต์แวร์',
              en: 'Software Engineering Internship'
            }
          }
        },
        {
          programCode: 'DBI',
          name: {
            th: 'เทคโนโลยีดิจิทัลเพื่อนวัตกรรมทางธุรกิจ',
            en: 'Digital Technology for Business Innovation'
          },
          course: {
            code: '1301494',
            name: {
              th: 'การฝึกงานเทคโนโลยีดิจิทัลเพื่อนวัตกรรมทางธุรกิจ',
              en: 'Digital Technology for Business Innovation Internship'
            }
          }
        },
        {
          programCode: 'MTA',
          name: {
            th: 'เทคโนโลยีมัลติมีเดียและการสร้างภาพเคลื่อนไหว',
            en: 'Multimedia Technology and Animation'
          },
          course: {
            code: '1301495',
            name: {
              th: 'การฝึกงานเทคโนโลยีมัลติมีเดียและการสร้างภาพเคลื่อนไหว',
              en: 'Multimedia Technology and Animation Internship'
            }
          }
        }
      ]
    },
    {
      schoolCode: 'AI',
      name: {
        th: 'สำนักวิชาอุตสาหกรรมเกษตร',
        en: 'School of Agro-Industry'
      },
      programs: [
        {
          programCode: 'FST',
          name: {
            th: 'นวัตกรรมวิทยาศาสตร์และเทคโนโลยีอาหาร',
            en: 'Innovative Food Science and Technology'
          },
          course: {
            code: '1401491',
            name: {
              th: 'การฝึกงานนวัตกรรมวิทยาศาสตร์และเทคโนโลยีอาหาร',
              en: 'Innovative Food Science & Technology Internship'
            }
          }
        },
        {
          programCode: 'AFL',
          name: { th: 'โลจิสติกส์เกษตรและอาหาร', en: 'Agri-Food Logistics' },
          course: {
            code: '1401492',
            name: {
              th: 'การฝึกงานโลจิสติกส์เกษตรและอาหาร',
              en: 'Agri-Food Logistics Internship'
            }
          }
        }
      ]
    },
    {
      schoolCode: 'LAW',
      name: {
        th: 'สำนักวิชานิติศาสตร์',
        en: 'School of Law'
      },
      programs: [
        {
          programCode: 'LLB',
          name: { th: 'นิติศาสตรบัณฑิต', en: 'Bachelor of Laws' },
          course: {
            code: '1601491',
            name: {
              th: 'การฝึกงานทางวิชาชีพกฎหมาย',
              en: 'Legal Professional Internship'
            }
          }
        },
        {
          programCode: 'BLC',
          name: {
            th: 'กฎหมายธุรกิจและการสื่อสารด้วยภาษาจีน',
            en: 'Business Law and Chinese Communication'
          },
          course: {
            code: '1601492',
            name: {
              th: 'การฝึกงานกฎหมายธุรกิจและการสื่อสารด้วยภาษาจีน',
              en: 'Business Law and Chinese Communication Internship'
            }
          }
        }
      ]
    },
    {
      schoolCode: 'COS',
      name: {
        th: 'สำนักวิชาวิทยาศาสตร์เครื่องสำอาง',
        en: 'School of Cosmetic Science'
      },
      programs: [
        {
          programCode: 'CSB',
          name: { th: 'วิทยาศาสตร์เครื่องสำอาง', en: 'Cosmetic Science' },
          course: {
            code: '1701491',
            name: {
              th: 'การฝึกงานวิทยาศาสตร์เครื่องสำอาง',
              en: 'Cosmetic Science Internship'
            }
          }
        },
        {
          programCode: 'BT',
          name: { th: 'เทคโนโลยีความงาม', en: 'Beauty Technology' },
          course: {
            code: '1701492',
            name: {
              th: 'การฝึกงานเทคโนโลยีความงาม',
              en: 'Beauty Technology Internship'
            }
          }
        }
      ]
    },
    {
      schoolCode: 'HS',
      name: {
        th: 'สำนักวิชาวิทยาศาสตร์สุขภาพ',
        en: 'School of Health Science'
      },
      programs: [
        {
          programCode: 'PH',
          name: { th: 'สาธารณสุขศาสตร์', en: 'Public Health' },
          course: {
            code: '1801491',
            name: {
              th: 'การฝึกงานสาธารณสุขศาสตร์',
              en: 'Public Health Internship'
            }
          }
        },
        {
          programCode: 'SHS',
          name: {
            th: 'วิทยาศาสตร์การกีฬาและสุขภาพ',
            en: 'Sports and Health Science'
          },
          course: {
            code: '1801492',
            name: {
              th: 'การฝึกงานวิทยาศาสตร์การกีฬาและสุขภาพ',
              en: 'Sports and Health Science Internship'
            }
          }
        },
        {
          programCode: 'ENV',
          name: { th: 'อนามัยสิ่งแวดล้อม', en: 'Environmental Health' },
          course: {
            code: '1801493',
            name: {
              th: 'การฝึกงานอนามัยสิ่งแวดล้อม',
              en: 'Environmental Health Internship'
            }
          }
        },
        {
          programCode: 'OHS',
          name: {
            th: 'อาชีวอนามัยและความปลอดภัย',
            en: 'Occupational Health and Safety'
          },
          course: {
            code: '1801494',
            name: {
              th: 'การฝึกงานอาชีวอนามัยและความปลอดภัย',
              en: 'Occupational Health & Safety Internship'
            }
          }
        }
      ]
    },
    {
      schoolCode: 'NS',
      name: {
        th: 'สำนักวิชาพยาบาลศาสตร์',
        en: 'School of Nursing'
      },
      programs: [
        {
          programCode: 'NSB',
          name: { th: 'พยาบาลศาสตรบัณฑิต', en: 'Bachelor of Nursing Science' },
          course: {
            code: '1501491',
            name: {
              th: 'การฝึกปฏิบัติการพยาบาลวิชาชีพ',
              en: 'Professional Nursing Practicum'
            }
          }
        }
      ]
    },
    {
      schoolCode: 'MED',
      name: {
        th: 'สำนักวิชาแพทยศาสตร์',
        en: 'School of Medicine'
      },
      programs: [
        {
          programCode: 'MD',
          name: { th: 'แพทยศาสตร์', en: 'Doctor of Medicine' },
          course: {
            code: '1901491',
            name: {
              th: 'การฝึกปฏิบัติงานคลินิกแพทยศาสตร์',
              en: 'Medical Clinical Practicum'
            }
          }
        }
      ]
    },
    {
      schoolCode: 'DENT',
      name: {
        th: 'สำนักวิชาทันตแพทยศาสตร์',
        en: 'School of Dentistry'
      },
      programs: [
        {
          programCode: 'DDS',
          name: { th: 'ทันตแพทยศาสตร์', en: 'Doctor of Dental Surgery' },
          course: {
            code: '2001491',
            name: {
              th: 'การฝึกปฏิบัติงานทันตกรรมคลินิก',
              en: 'Dental Clinical Practicum'
            }
          }
        }
      ]
    },
    {
      schoolCode: 'SOC',
      name: {
        th: 'สำนักวิชานวัตกรรมสังคม',
        en: 'School of Social Innovation'
      },
      programs: [
        {
          programCode: 'ID',
          name: {
            th: 'การพัฒนาระหว่างประเทศ',
            en: 'International Development'
          },
          course: {
            code: '2101491',
            name: {
              th: 'การฝึกงานการพัฒนาระหว่างประเทศ',
              en: 'International Development Internship'
            }
          }
        }
      ]
    },
    {
      schoolCode: 'SIN',
      name: {
        th: 'สำนักวิชาจีนวิทยา',
        en: 'School of Sinology'
      },
      programs: [
        {
          programCode: 'CS',
          name: { th: 'จีนศึกษา', en: 'Chinese Studies' },
          course: {
            code: '2201491',
            name: { th: 'การฝึกงานจีนศึกษา', en: 'Chinese Studies Internship' }
          }
        },
        {
          programCode: 'BC',
          name: { th: 'ภาษาจีนธุรกิจ', en: 'Business Chinese' },
          course: {
            code: '2201492',
            name: {
              th: 'การฝึกงานภาษาจีนธุรกิจ',
              en: 'Business Chinese Internship'
            }
          }
        },
        {
          programCode: 'CLC',
          name: {
            th: 'ภาษาและวัฒนธรรมจีน',
            en: 'Chinese Language and Culture'
          },
          course: {
            code: '2201493',
            name: {
              th: 'การฝึกงานภาษาและวัฒนธรรมจีน',
              en: 'Chinese Language and Culture Internship'
            }
          }
        },
        {
          programCode: 'TCL',
          name: { th: 'การสอนภาษาจีน', en: 'Teaching Chinese Language' },
          course: {
            code: '2201494',
            name: {
              th: 'การฝึกปฏิบัติการสอนภาษาจีน',
              en: 'Teaching Chinese Language Practicum'
            }
          }
        }
      ]
    },
    {
      schoolCode: 'IM',
      name: {
        th: 'สำนักวิชาการแพทย์บูรณาการ',
        en: 'School of Integrative Medicine'
      },
      programs: [
        {
          programCode: 'ATM',
          name: {
            th: 'การแพทย์แผนไทยประยุกต์',
            en: 'Applied Thai Traditional Medicine'
          },
          course: {
            code: '2301491',
            name: {
              th: 'การฝึกงานการแพทย์แผนไทยประยุกต์',
              en: 'Applied Thai Traditional Medicine Internship'
            }
          }
        },
        {
          programCode: 'PT',
          name: { th: 'กายภาพบำบัดบัณฑิต', en: 'Physical Therapy' },
          course: {
            code: '2301492',
            name: {
              th: 'การฝึกปฏิบัติการกายภาพบำบัด',
              en: 'Physical Therapy Practicum'
            }
          }
        },
        {
          programCode: 'TCM',
          name: {
            th: 'การแพทย์แผนจีนบัณฑิต',
            en: 'Traditional Chinese Medicine'
          },
          course: {
            code: '2301493',
            name: {
              th: 'การฝึกงานการแพทย์แผนจีน',
              en: 'Traditional Chinese Medicine Internship'
            }
          }
        }
      ]
    }
  ]

  const schoolMap = new Map<string, string>() // code -> id
  const programMap = new Map<string, string>() // `${schoolCode}:${programCode}` -> id
  const courseMap = new Map<string, string>() // code -> id

  for (const s of schoolsData) {
    const sId = await upsertId(
      database,
      'schools',
      { schoolCode: s.schoolCode },
      {
        schoolCode: s.schoolCode,
        name: s.name,
        status: 'active',
        createdAt: now,
        updatedAt: now
      }
    )
    schoolMap.set(s.schoolCode, sId)

    for (const p of s.programs) {
      const pId = await upsertId(
        database,
        'programs',
        { schoolId: sId, programCode: p.programCode },
        {
          schoolId: sId,
          programCode: p.programCode,
          name: p.name,
          status: 'active',
          createdAt: now,
          updatedAt: now
        }
      )
      programMap.set(`${s.schoolCode}:${p.programCode}`, pId)

      // Course for program
      const cId = await upsertId(
        database,
        'courses',
        { courseCode: p.course.code },
        {
          courseCode: p.course.code,
          name: p.course.name,
          programIds: [pId],
          credits: 6,
          status: 'active',
          createdAt: now,
          updatedAt: now
        }
      )
      courseMap.set(p.course.code, cId)
    }
  }

  // Common Cooperative Education course (COOP101) linked to all programs
  const allProgramIds = Array.from(programMap.values())
  const coopId = await upsertId(
    database,
    'courses',
    { courseCode: 'COOP101' },
    {
      courseCode: 'COOP101',
      name: { th: 'สหกิจศึกษา', en: 'Cooperative Education' },
      programIds: allProgramIds,
      credits: 6,
      status: 'active',
      createdAt: now,
      updatedAt: now
    }
  )
  courseMap.set('COOP101', coopId)

  // Remove stale schools, programs, and courses that are not in the authoritative schoolsData
  const activeSchoolCodes = schoolsData.map((s) => s.schoolCode)
  await database
    .collection('schools')
    .deleteMany({ schoolCode: { $nin: activeSchoolCodes } })
  const validProgramIds = Array.from(programMap.values()).map(
    (id) => new ObjectId(id)
  )
  await database
    .collection('programs')
    .deleteMany({ _id: { $nin: validProgramIds } })
  const validCourseIds = Array.from(courseMap.values()).map(
    (id) => new ObjectId(id)
  )
  await database
    .collection('courses')
    .deleteMany({ _id: { $nin: validCourseIds } })

  // 2. Academic Terms
  const termId = await upsertId(
    database,
    'academicTerms',
    { code: 'DEV-2026-1' },
    {
      code: 'DEV-2026-1',
      academicYear: 2026,
      semester: '1',
      startsAt: now,
      endsAt: future,
      timezone: 'Asia/Bangkok',
      status: 'open',
      createdAt: now,
      updatedAt: now
    }
  )

  await upsertId(
    database,
    'academicTerms',
    { code: 'DEV-2025-2' },
    {
      code: 'DEV-2025-2',
      academicYear: 2025,
      semester: '2',
      startsAt: past,
      endsAt: now,
      timezone: 'Asia/Bangkok',
      status: 'closed',
      createdAt: past,
      updatedAt: now
    }
  )

  await upsertId(
    database,
    'academicTerms',
    { code: 'DEV-2025-1' },
    {
      code: 'DEV-2025-1',
      academicYear: 2025,
      semester: '1',
      startsAt: past,
      endsAt: now,
      timezone: 'Asia/Bangkok',
      status: 'closed',
      createdAt: past,
      updatedAt: now
    }
  )

  // 3. Organizations (No mock organizations seeded)
  const organizationsData: Array<{
    code: string
    name: { th: string; en: string }
    email: string
    province: string
  }> = []

  const orgMap = new Map<string, string>()
  for (const org of organizationsData) {
    const oId = await upsertId(
      database,
      'organizations',
      { organizationCode: org.code },
      {
        organizationCode: org.code,
        name: org.name,
        contactEmail: org.email,
        address: { province: org.province },
        status: 'active',
        createdAt: now,
        updatedAt: now
      }
    )
    orgMap.set(org.code, oId)
  }

  // 4. Evaluators (No mock evaluators seeded)
  const evaluatorsData: Array<{
    orgCode: string
    email: string
    name: { th: string; en: string }
    position: { th: string; en: string }
  }> = []

  const evaluatorMap = new Map<string, string>()
  for (const ev of evaluatorsData) {
    const orgId = orgMap.get(ev.orgCode)!
    const evId = await upsertId(
      database,
      'evaluators',
      { organizationId: orgId, email: ev.email },
      {
        organizationId: orgId,
        email: ev.email,
        name: ev.name,
        position: ev.position,
        status: 'active',
        createdAt: now,
        updatedAt: now
      }
    )
    evaluatorMap.set(ev.orgCode, evId)
  }

  // 5. Students (No mock students seeded)
  const studentsData: Array<{
    studentId: string
    name: { th: string; en: string }
    email: string
    personalEmail: string
    school: string
    program: string
    course: string
    org: string
    status: 'pending' | 'inProgress' | 'submitted'
  }> = []

  // 6. Competency Sets & Versions
  const competencySetId = await upsertId(
    database,
    'competencySets',
    { code: 'DEV-COMP' },
    {
      code: 'DEV-COMP',
      name: {
        th: 'แบบประเมินสมรรถนะการฝึกงานมาตรฐาน มฟล.',
        en: 'MFU Standard Internship Competency Evaluation'
      },
      status: 'active',
      createdAt: now,
      updatedAt: now
    }
  )

  const sections = [
    // หมวดที่ 1: ทักษะทั่วไปและความประพฤติ (Soft Skills)
    {
      id: 'general-conduct',
      title: {
        th: 'หมวด 1: ทักษะทั่วไปและความประพฤติ (Soft Skills)',
        en: 'Section 1: General Skills & Professional Conduct'
      },
      category: 'general',
      questions: [
        {
          id: 'punctuality',
          label: {
            th: 'ความตรงต่อเวลาและการปฏิบัติตามกฎระเบียบขององค์กร',
            en: 'Punctuality and Compliance with Workplace Regulations'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 1
        },
        {
          id: 'teamwork',
          label: {
            th: 'การทำงานร่วมกับผู้อื่นและการสื่อสารในทีม',
            en: 'Teamwork and Workplace Communication'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 1
        },
        {
          id: 'responsibility',
          label: {
            th: 'ความรับผิดชอบต่องานและความกระตือรือร้นในการเรียนรู้',
            en: 'Task Responsibility and Learning Enthusiasm'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 1
        },
        {
          id: 'problem-solving-general',
          label: {
            th: 'การปรับตัวและการแก้ปัญหาเฉพาะหน้าในการทำงาน',
            en: 'Adaptability and Practical Problem Solving'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 1
        }
      ]
    },

    // 14 Specialized Sections (หมวด 2 เฉพาะทางสำหรับ 14 สำนักวิชา)
    // 1. LA: ศิลปศาสตร์
    {
      id: 'spec-la',
      title: {
        th: 'ทักษะเฉพาะทาง: สำนักวิชาศิลปศาสตร์ (ภาษาและการสื่อสารสากล)',
        en: 'Specialized Skills: School of Liberal Arts'
      },
      category: 'special',
      schoolId: schoolMap.get('LA'),
      questions: [
        {
          id: 'la-lang-proficiency',
          label: {
            th: 'ทักษะการใช้ภาษาเพื่อการสื่อสารระดับมืออาชีพ ทั้งการฟัง พูด อ่าน และเขียน',
            en: 'Professional Language Proficiency (Listening, Speaking, Reading & Writing)'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 2
        },
        {
          id: 'la-translation',
          label: {
            th: 'ทักษะการแปล การล่าม และการเรียบเรียงเนื้อหาข้ามภาษา',
            en: 'Translation, Interpretation & Multilingual Content Adaptation'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 2
        },
        {
          id: 'la-intercultural',
          label: {
            th: 'ความเข้าใจในบริบทความหลากหลายทางวัฒนธรรมและการทำงานร่วมกับชาวต่างชาติ',
            en: 'Intercultural Awareness and International Workplace Adaptability'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 1
        },
        {
          id: 'la-critical-thinking',
          label: {
            th: 'การค้นคว้าข้อมูล การคิดเชิงวิพากษ์ และการสังเคราะห์เนื้อหา',
            en: 'Information Research, Critical Thinking & Content Synthesis'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 1
        }
      ]
    },

    // 2. SCI: วิทยาศาสตร์
    {
      id: 'spec-sci',
      title: {
        th: 'ทักษะเฉพาะทาง: สำนักวิชาวิทยาศาสตร์ (การวิจัยและปฏิบัติการวิทยาศาสตร์)',
        en: 'Specialized Skills: School of Science'
      },
      category: 'special',
      schoolId: schoolMap.get('SCI'),
      questions: [
        {
          id: 'sci-lab-safety',
          label: {
            th: 'ทักษะการใช้เครื่องมือและการปฏิบัติการทางวิทยาศาสตร์ตามมาตรฐานความปลอดภัย',
            en: 'Scientific Equipment Operation & Laboratory Safety Standards'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 2
        },
        {
          id: 'sci-data-analysis',
          label: {
            th: 'การวิเคราะห์ข้อมูล การทดลอง และการตีความผลเชิงวิทยาศาสตร์',
            en: 'Scientific Experimentation, Data Analysis & Result Interpretation'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 2
        },
        {
          id: 'sci-reporting',
          label: {
            th: 'การค้นคว้าทางวิชาการและการจัดทำรายงานเชิงวิทยาศาสตร์',
            en: 'Academic Literature Research & Technical Scientific Reporting'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 1
        },
        {
          id: 'sci-reasoning',
          label: {
            th: 'การคิดเชิงเหตุและผลและการประยุกต์ใช้องค์ความรู้ทางวิทยาศาสตร์',
            en: 'Logical Scientific Reasoning & Practical Knowledge Application'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 1
        }
      ]
    },

    // 3. MGT: การจัดการ
    {
      id: 'spec-mgt',
      title: {
        th: 'ทักษะเฉพาะทาง: สำนักวิชาการจัดการ (บริหารธุรกิจ บัญชี เศรษฐศาสตร์)',
        en: 'Specialized Skills: School of Management'
      },
      category: 'special',
      schoolId: schoolMap.get('MGT'),
      questions: [
        {
          id: 'mgt-business-analysis',
          label: {
            th: 'การวิเคราะห์ข้อมูลทางธุรกิจ การเงิน และการวางแผนกลยุทธ์',
            en: 'Business & Financial Analysis, Strategic Planning'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 2
        },
        {
          id: 'mgt-communication',
          label: {
            th: 'การสื่อสารทางธุรกิจ การนำเสนอผลงาน และการเจรจาต่อรอง',
            en: 'Business Communication, Professional Presentation & Negotiation'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 2
        },
        {
          id: 'mgt-project-mgmt',
          label: {
            th: 'ความเข้าใจในกระบวนการทำงาน การจัดการโครงการ และการแก้ปัญหาเฉพาะหน้า',
            en: 'Process & Project Management, Practical Problem Solving'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 1
        },
        {
          id: 'mgt-digital-tools',
          label: {
            th: 'การประยุกต์ใช้เทคโนโลยีดิจิทัลและซอฟต์แวร์ในการทำงานธุรกิจ',
            en: 'Digital Business Tools and Enterprise Software Application'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 1
        }
      ]
    },

    // 4. IT: เทคโนโลยีสารสนเทศ
    {
      id: 'spec-it',
      title: {
        th: 'ทักษะเฉพาะทาง: สำนักวิชาเทคโนโลยีสารสนเทศ (ซอฟต์แวร์และเทคโนโลยีดิจิทัล)',
        en: 'Specialized Skills: School of Information Technology'
      },
      category: 'special',
      schoolId: schoolMap.get('IT'),
      questions: [
        {
          id: 'it-software-dev',
          label: {
            th: 'ทักษะการพัฒนาซอฟต์แวร์ การเขียนโปรแกรม และการออกแบบตรรกะระบบ',
            en: 'Software Development, Coding & System Logic Design'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 2
        },
        {
          id: 'it-database',
          label: {
            th: 'การออกแบบ จัดการ และสืบค้นฐานข้อมูล',
            en: 'Database Design, Management & Querying'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 2
        },
        {
          id: 'it-debugging',
          label: {
            th: 'การวิเคราะห์ปัญหา การค้นหาข้อผิดพลาด และการทดสอบระบบ',
            en: 'System Analysis, Debugging & Quality Testing'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 1
        },
        {
          id: 'it-security',
          label: {
            th: 'การปฏิบัติตามมาตรฐานความปลอดภัยของข้อมูลและระบบสารสนเทศ',
            en: 'Information Security Standards and Best Practices'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 1
        }
      ]
    },

    // 5. AI: อุตสาหกรรมเกษตร
    {
      id: 'spec-ai',
      title: {
        th: 'ทักษะเฉพาะทาง: สำนักวิชาอุตสาหกรรมเกษตร (เทคโนโลยีอาหารและหลังการเก็บเกี่ยว)',
        en: 'Specialized Skills: School of Agro-Industry'
      },
      category: 'special',
      schoolId: schoolMap.get('AI'),
      questions: [
        {
          id: 'ai-qa-standards',
          label: {
            th: 'การควบคุมคุณภาพและความปลอดภัยของอาหารตามมาตรฐานสากล (GMP / HACCP / ISO)',
            en: 'Food Safety & Quality Assurance Standards (GMP / HACCP / ISO)'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 2
        },
        {
          id: 'ai-lab-analysis',
          label: {
            th: 'ทักษะการวิเคราะห์และทดสอบในห้องปฏิบัติการทางวิทยาศาสตร์อาหาร',
            en: 'Laboratory Testing & Food Analysis Competencies'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 2
        },
        {
          id: 'ai-processing',
          label: {
            th: 'ความเข้าใจในกระบวนการแปรรูปและสายการผลิตอุตสาหกรรมเกษตร',
            en: 'Food Processing Operations & Agro-Industrial Production Lines'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 1
        },
        {
          id: 'ai-product-dev',
          label: {
            th: 'การวิจัยพัฒนาผลิตภัณฑ์อาหารและการจัดการห่วงโซ่อุปทาน',
            en: 'Food Product Development & Supply Chain Management'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 1
        }
      ]
    },

    // 6. LAW: นิติศาสตร์
    {
      id: 'spec-law',
      title: {
        th: 'ทักษะเฉพาะทาง: สำนักวิชานิติศาสตร์ (การปฏิบัติงานทางกฎหมาย)',
        en: 'Specialized Skills: School of Law'
      },
      category: 'special',
      schoolId: schoolMap.get('LAW'),
      questions: [
        {
          id: 'law-research',
          label: {
            th: 'การค้นคว้า รวบรวมข้อเท็จจริง และสืบค้นตัวบทกฎหมายและคำพิพากษา',
            en: 'Legal Research & Case Law Fact-Finding'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 2
        },
        {
          id: 'law-drafting',
          label: {
            th: 'ทักษะการร่างเอกสารทางกฎหมาย นิติกรรม และสัญญา',
            en: 'Legal Drafting, Contracts & Instruments'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 2
        },
        {
          id: 'law-reasoning',
          label: {
            th: 'การคิดวิเคราะห์ ตีความ และปรับบทกฎหมายเข้ากับข้อเท็จจริง',
            en: 'Legal Reasoning & Statutory Interpretation'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 2
        },
        {
          id: 'law-ethics',
          label: {
            th: 'การยึดมั่นในจรรยาบรรณวิชาชีพกฎหมายและความซื่อสัตย์สุจริต',
            en: 'Legal Professional Ethics & Integrity'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 1
        }
      ]
    },

    // 7. COS: วิทยาศาสตร์เครื่องสำอาง
    {
      id: 'spec-cos',
      title: {
        th: 'ทักษะเฉพาะทาง: สำนักวิชาวิทยาศาสตร์เครื่องสำอาง',
        en: 'Specialized Skills: School of Cosmetic Science'
      },
      category: 'special',
      schoolId: schoolMap.get('COS'),
      questions: [
        {
          id: 'cos-formulation',
          label: {
            th: 'การพัฒนาและตั้งตำรับผลิตภัณฑ์เครื่องสำอาง',
            en: 'Cosmetic Formulation & Product Development'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 2
        },
        {
          id: 'cos-safety-testing',
          label: {
            th: 'การทดสอบความคงตัว ความปลอดภัย และประสิทธิภาพของผลิตภัณฑ์',
            en: 'Stability, Safety & Efficacy Testing'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 2
        },
        {
          id: 'cos-regulatory',
          label: {
            th: 'การควบคุมคุณภาพและการปฏิบัติตามกฎหมายเครื่องสำอางสากล',
            en: 'Quality Control & Cosmetic Regulatory Compliance'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 1
        },
        {
          id: 'cos-trends',
          label: {
            th: 'ความเข้าใจแนวโน้มตลาดเครื่องสำอางและการตอบสนองความต้องการผู้บริโภค',
            en: 'Cosmetic Industry Trends & Consumer Demand Adaptation'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 1
        }
      ]
    },

    // 8. HS: วิทยาศาสตร์สุขภาพ
    {
      id: 'spec-hs',
      title: {
        th: 'ทักษะเฉพาะทาง: สำนักวิชาวิทยาศาสตร์สุขภาพ (สาธารณสุขและอาชีวอนามัย)',
        en: 'Specialized Skills: School of Health Science'
      },
      category: 'special',
      schoolId: schoolMap.get('HS'),
      questions: [
        {
          id: 'hs-risk-assessment',
          label: {
            th: 'การประเมินความเสี่ยงด้านสุขภาพ อาชีวอนามัย และสิ่งแวดล้อม',
            en: 'Health Risk, Occupational & Environmental Assessment'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 2
        },
        {
          id: 'hs-health-promotion',
          label: {
            th: 'การวางแผนและการจัดทำโครงการส่งเสริมสุขภาพในสถานประกอบการ/ชุมชน',
            en: 'Health Promotion Project Planning & Execution'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 2
        },
        {
          id: 'hs-safety-standards',
          label: {
            th: 'การปฏิบัติตามกฎหมายและมาตรฐานความปลอดภัยในการทำงาน',
            en: 'Safety Standards & Occupational Regulatory Compliance'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 1
        },
        {
          id: 'hs-epidemiology',
          label: {
            th: 'ทักษะการเฝ้าระวังและการเก็บข้อมูลทางสุขภาพเชิงระบาดวิทยา',
            en: 'Health Surveillance & Epidemiological Data Collection'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 1
        }
      ]
    },

    // 9. NS: พยาบาลศาสตร์
    {
      id: 'spec-ns',
      title: {
        th: 'ทักษะเฉพาะทาง: สำนักวิชาพยาบาลศาสตร์ (การบริบาลผู้ป่วยและการพยาบาล)',
        en: 'Specialized Skills: School of Nursing'
      },
      category: 'special',
      schoolId: schoolMap.get('NS'),
      questions: [
        {
          id: 'ns-assessment',
          label: {
            th: 'ทักษะการประเมินสภาพผู้ป่วยและการวินิจฉัยทางการพยาบาล',
            en: 'Patient Health Assessment & Nursing Diagnosis'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 2
        },
        {
          id: 'ns-safety-infection',
          label: {
            th: 'การปฏิบัติการพยาบาลตามมาตรฐานความปลอดภัยและการควบคุมการติดเชื้อ',
            en: 'Nursing Clinical Practice, Safety & Infection Control'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 2
        },
        {
          id: 'ns-therapeutic-comm',
          label: {
            th: 'การสื่อสารเพื่อการบำบัดและการสร้างสัมพันธภาพกับผู้ป่วยและญาติ',
            en: 'Therapeutic Communication with Patients & Families'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 2
        },
        {
          id: 'ns-ethics',
          label: {
            th: 'จรรยาบรรณวิชาชีพการพยาบาลและการเคารพสิทธิผู้ป่วย',
            en: 'Professional Nursing Ethics & Patient Rights Respect'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 1
        }
      ]
    },

    // 10. MED: แพทยศาสตร์
    {
      id: 'spec-med',
      title: {
        th: 'ทักษะเฉพาะทาง: สำนักวิชาแพทยศาสตร์ (เวชปฏิบัติและการดูแลรักษา)',
        en: 'Specialized Skills: School of Medicine'
      },
      category: 'special',
      schoolId: schoolMap.get('MED'),
      questions: [
        {
          id: 'med-diagnosis',
          label: {
            th: 'ทักษะการซักประวัติ ตรวจร่างกาย และการวิเคราะห์วินิจฉัยโรค',
            en: 'History Taking, Physical Exam & Clinical Diagnosis'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 2
        },
        {
          id: 'med-management-plan',
          label: {
            th: 'การเลือกใช้และแปลผลการตรวจทางห้องปฏิบัติการและการวางแผนการรักษา',
            en: 'Laboratory Investigation & Management Plan Formulation'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 2
        },
        {
          id: 'med-communication',
          label: {
            th: 'การสื่อสารทางการแพทย์ การให้ข้อมูลแก่ผู้ป่วยและญาติอย่างเห็นอกเห็นใจ',
            en: 'Medical Communication & Empathic Patient Engagement'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 1
        },
        {
          id: 'med-ethics-safety',
          label: {
            th: 'จริยธรรมทางการแพทย์และความตระหนักในความปลอดภัยของผู้ป่วย',
            en: 'Medical Ethics, Confidentiality & Patient Safety'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 1
        }
      ]
    },

    // 11. DENT: ทันตแพทยศาสตร์
    {
      id: 'spec-dent',
      title: {
        th: 'ทักษะเฉพาะทาง: สำนักวิชาทันตแพทยศาสตร์ (การบริบาลทางทันตกรรม)',
        en: 'Specialized Skills: School of Dentistry'
      },
      category: 'special',
      schoolId: schoolMap.get('DENT'),
      questions: [
        {
          id: 'dent-assessment',
          label: {
            th: 'การตรวจประเมิน วินิจฉัย และวางแผนการรักษาทางทันตกรรม',
            en: 'Dental Assessment, Diagnosis & Treatment Planning'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 2
        },
        {
          id: 'dent-procedures',
          label: {
            th: 'ทักษะการทำหัตถการทางทันตกรรมและการควบคุมการติดเชื้อ',
            en: 'Clinical Dental Procedures & Infection Control'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 2
        },
        {
          id: 'dent-patient-comm',
          label: {
            th: 'การสื่อสาร สร้างสัมพันธภาพ และการให้คำแนะนำแก่ผู้ป่วยทันตกรรม',
            en: 'Dental Patient Communication & Oral Health Education'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 1
        },
        {
          id: 'dent-ethics',
          label: {
            th: 'จรรยาบรรณวิชาชีพทันตแพทย์และมาตรฐานความปลอดภัยของผู้ป่วย',
            en: 'Dental Professional Ethics & Patient Safety Standards'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 1
        }
      ]
    },

    // 12. SOC: นวัตกรรมสังคม
    {
      id: 'spec-soc',
      title: {
        th: 'ทักษะเฉพาะทาง: สำนักวิชานวัตกรรมสังคม (การพัฒนาชุมชนและนวัตกรรมสังคม)',
        en: 'Specialized Skills: School of Social Innovation'
      },
      category: 'special',
      schoolId: schoolMap.get('SOC'),
      questions: [
        {
          id: 'soc-needs-assessment',
          label: {
            th: 'การสำรวจความต้องการ การวิเคราะห์ปัญหาชุมชนและบริบทสังคม',
            en: 'Social Needs Assessment & Community Problem Analysis'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 2
        },
        {
          id: 'soc-innovation-design',
          label: {
            th: 'การออกแบบโครงการและการร่วมสร้างสรรค์นวัตกรรมเพื่อแก้ไขปัญหาสังคม',
            en: 'Social Project Design & Collaborative Innovation Co-Creation'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 2
        },
        {
          id: 'soc-stakeholders',
          label: {
            th: 'ทักษะการประสานงาน การมีส่วนร่วม และการสื่อสารกับผู้มีส่วนได้ส่วนเสีย',
            en: 'Stakeholder Engagement, Facilitation & Community Outreach'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 1
        },
        {
          id: 'soc-impact-eval',
          label: {
            th: 'การติดตามและประเมินผลกระทบทางสังคมของโครงการ',
            en: 'Social Impact Measurement, Monitoring & Evaluation'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 1
        }
      ]
    },

    // 13. SIN: จีนวิทยา
    {
      id: 'spec-sin',
      title: {
        th: 'ทักษะเฉพาะทาง: สำนักวิชาจีนวิทยา (ภาษาจีนและการสื่อสารธุรกิจจีน)',
        en: 'Specialized Skills: School of Sinology'
      },
      category: 'special',
      schoolId: schoolMap.get('SIN'),
      questions: [
        {
          id: 'sin-language-mastery',
          label: {
            th: 'ทักษะการใช้ภาษาจีนระดับสูงเพื่อการสื่อสารและการทำงานอย่างมืออาชีพ',
            en: 'Advanced Chinese Proficiency for Workplace & Professional Communication'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 2
        },
        {
          id: 'sin-translation-negotiation',
          label: {
            th: 'ทักษะการแปล ล่าม และการเจรจาต่อรองในบริบทธุรกิจจีน',
            en: 'Chinese Translation, Interpretation & Business Negotiation'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 2
        },
        {
          id: 'sin-contextual-understanding',
          label: {
            th: 'ความเข้าใจในบริบทเศรษฐกิจ สังคม และวัฒนธรรมจีนร่วมสมัย',
            en: 'Understanding of Contemporary Chinese Socio-Economic & Cultural Context'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 1
        },
        {
          id: 'sin-collaboration',
          label: {
            th: 'มนุษยสัมพันธ์และการประสานงานกับองค์กรหรือคู่ค้าชาวจีน',
            en: 'Interpersonal & Organizational Liaison Skills with Chinese Partners'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 1
        }
      ]
    },

    // 14. IM: การแพทย์บูรณาการ
    {
      id: 'spec-im',
      title: {
        th: 'ทักษะเฉพาะทาง: สำนักวิชาการแพทย์บูรณาการ (แพทย์แผนไทยประยุกต์ / กายภาพบำบัด / แพทย์แผนจีน)',
        en: 'Specialized Skills: School of Integrative Medicine'
      },
      category: 'special',
      schoolId: schoolMap.get('IM'),
      questions: [
        {
          id: 'im-clinical-eval',
          label: {
            th: 'การตรวจวินิจฉัยและประเมินสภาพร่างกายตามหลักวิชาชีพเฉพาะทาง',
            en: 'Specialized Clinical Diagnostic & Physical Assessment'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 2
        },
        {
          id: 'im-therapeutic-skills',
          label: {
            th: 'ทักษะการรักษา การทำหัตถการ และการฟื้นฟูสมรรถภาพ',
            en: 'Therapeutic Treatment, Clinical Procedures & Rehabilitation Skills'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 2
        },
        {
          id: 'im-patient-counseling',
          label: {
            th: 'การสื่อสารและการให้คำแนะนำในการดูแลส่งเสริมสุขภาพแบบองค์รวม',
            en: 'Holistic Health Guidance & Patient Counseling'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 1
        },
        {
          id: 'im-ethics-safety',
          label: {
            th: 'จรรยาบรรณวิชาชีพการแพทย์บูรณาการและการคำนึงถึงความปลอดภัยของผู้รับบริการ',
            en: 'Integrative Healthcare Ethics & Patient Safety Assurance'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 1
        }
      ]
    },

    // หมวดที่ 3: ข้อเสนอแนะและข้อคิดเห็นเพิ่มเติม (Suggestion Section)
    {
      id: 'feedback-section',
      title: {
        th: 'หมวด 3: ข้อคิดเห็นและข้อเสนอแนะเพิ่มเติมสำหรับนักศึกษา',
        en: 'Section 3: Feedback, Strengths & Recommendations'
      },
      category: 'suggestion',
      questions: [
        {
          id: 'strengths',
          label: {
            th: 'จุดเด่นและข้อดีของนักศึกษาที่น่าชื่นชม (Strengths)',
            en: 'Student Strengths and Commendable Professional Qualities'
          },
          type: 'text',
          required: false
        },
        {
          id: 'areas-for-improvement',
          label: {
            th: 'จุดที่ควรพัฒนาและข้อเสนอแนะสำหรับการทำงานในอนาคต (Areas for Improvement)',
            en: 'Areas for Improvement and Guidance for Future Career Growth'
          },
          type: 'text',
          required: false
        }
      ]
    }
  ]

  const versionId = await upsertId(
    database,
    'competencySetVersions',
    { competencySetId, versionNumber: 1 },
    {
      competencySetId,
      versionNumber: 1,
      status: 'published',
      sections,
      publishedAt: now,
      publishedBy: 'development-seed',
      createdAt: now,
      updatedAt: now
    }
  )

  // 7. Evaluation Cycle (No mock cycles seeded)
  const cycleId: string | undefined = undefined

  // 8. Seed students, placements, and evaluation assignments
  const createdStudentIds: string[] = []
  for (const stu of studentsData) {
    const sId = schoolMap.get(stu.school)!
    const pId = programMap.get(`${stu.school}:${stu.program}`)!
    const cId = courseMap.get(stu.course)
    const oId = orgMap.get(stu.org)!
    const evId = evaluatorMap.get(stu.org)!

    const studentObjectId = await upsertId(
      database,
      'students',
      { studentId: stu.studentId },
      {
        studentId: stu.studentId,
        name: stu.name,
        email: stu.email,
        schoolId: sId,
        programId: pId,
        courseId: cId,
        academicTermId: termId,
        semester: '1',
        company: organizationsData.find((o) => o.code === stu.org)?.name.th,
        province: organizationsData.find((o) => o.code === stu.org)?.province,
        admissionYear: 2565,
        status: 'active',
        createdAt: now,
        updatedAt: now
      }
    )
    createdStudentIds.push(studentObjectId)

    const placementId = await upsertId(
      database,
      'placements',
      { studentId: studentObjectId, academicTermId: termId },
      {
        studentId: studentObjectId,
        organizationId: oId,
        academicTermId: termId,
        schoolId: sId,
        programId: pId,
        positionTitle: { th: 'นักศึกษาฝึกงาน', en: 'Intern' },
        startsAt: past,
        endsAt: future,
        status: stu.status === 'submitted' ? 'completed' : 'active',
        createdAt: now,
        updatedAt: now
      }
    )

    // Only create evaluationAssignments if the student has been sent an evaluation (inProgress or submitted)
    // Students with 'pending' represent "รอระบุผู้ประเมิน" (ยังไม่มีผู้ประเมิน / ยังไม่ถูกส่งประเมิน)
    if (stu.status !== 'pending') {
      const assignmentFilter = { cycleId, placementId, evaluatorId: evId }
      const existingAssignment = await database
        .collection('evaluationAssignments')
        .findOne(assignmentFilter, { projection: { accessPinHash: 1 } })
      const pinCredential = createDevelopmentPinCredential(
        environment.INVITATION_TOKEN_PEPPER,
        typeof existingAssignment?.accessPinHash === 'string'
          ? existingAssignment.accessPinHash
          : undefined
      )

      await upsertId(
        database,
        'evaluationAssignments',
        assignmentFilter,
        {
          cycleId,
          placementId,
          evaluatorId: evId,
          studentId: studentObjectId,
          schoolId: sId,
          programId: pId,
          questionSnapshot: sections,
          competencySetVersionId: versionId,
          deadlineAt: future,
          status: stu.status,
          evaluationVersion: 1,
          ...pinCredential,
          createdAt: now,
          updatedAt: now
        },
        ['accessPin']
      )
    } else {
      await database
        .collection('evaluationAssignments')
        .deleteMany({ placementId })
    }
  }

  // 9. Document Assets, Template & Generated Document
  await upsertId(
    database,
    'documentAssets',
    { key: 'approved-fonts/tahoma.ttf' },
    {
      key: 'approved-fonts/tahoma.ttf',
      assetType: 'font',
      originalName: 'tahoma.ttf',
      fontFamily: 'Tahoma',
      contentType: 'font/ttf',
      size: 919260,
      sha256:
        '9af03d4ad44a3b413d92f7de48b94aa7cc8a1471a75d498406eae837f62ee1d1',
      rightsBasis: 'System Standard Font',
      rightsConfirmedBy: 'system',
      rightsConfirmedAt: now,
      status: 'active',
      createdAt: now,
      updatedAt: now
    }
  )

  const docTemplateId = await upsertId(
    database,
    'documentTemplates',
    { code: 'CERT-MFU-2026' },
    {
      code: 'CERT-MFU-2026',
      name: 'หนังสือรับรองและทรานสคริปต์การฝึกงาน (MFU Internship Transcript)',
      documentType: 'certificate',
      status: 'active',
      createdAt: now,
      updatedAt: now
    }
  )

  const docVersionId = await upsertId(
    database,
    'documentTemplateVersions',
    { templateId: docTemplateId, versionNumber: 1 },
    {
      templateId: docTemplateId,
      versionNumber: 1,
      status: 'published',
      schemaVersion: 2,
      revision: 1,
      canonicalJson: {
        width: 1024,
        height: 724,
        editorMetadata: {
          nameTh: 'ใบประกาศนียบัตรรับรองการฝึกงาน (Certificate of Completion)',
          nameEn: 'Certificate of Professional Internship Completion',
          description:
            'เกียรติบัตรรับรองการผ่านการฝึกงานอย่างเป็นทางการ (A4 แนวนอน)',
          backgroundType: 'certificate_pattern',
          bgOpacity: 15
        },
        elements: [
          {
            id: 'el-cr-emblem',
            type: 'emblem',
            content: 'GOLD-AWARD',
            x: 476,
            y: 45,
            width: 72,
            height: 72,
            fontSize: 16,
            fontWeight: 'normal',
            color: '#b45309',
            textAlign: 'center'
          },
          {
            id: 'el-cr-univ',
            type: 'text',
            content: 'มหาวิทยาลัยแม่ฟ้าหลวง • MAE FAH LUANG UNIVERSITY',
            x: 0,
            y: 128,
            width: 1024,
            fontSize: 13,
            fontWeight: 'bold',
            color: '#b45309',
            textAlign: 'center'
          },
          {
            id: 'el-cr-title-th',
            type: 'heading',
            content: 'ใบประกาศนียบัตรรับรองการฝึกงาน',
            x: 0,
            y: 156,
            width: 1024,
            fontSize: 34,
            fontWeight: 'bold',
            color: '#0f172a',
            textAlign: 'center'
          },
          {
            id: 'el-cr-title-en',
            type: 'text',
            content: 'CERTIFICATE OF INTERNSHIP COMPLETION',
            x: 0,
            y: 202,
            width: 1024,
            fontSize: 13,
            fontWeight: 'bold',
            color: '#64748b',
            textAlign: 'center'
          },
          {
            id: 'el-cr-std-name-th',
            type: 'variable',
            variableKey: 'student_name_th',
            content: '{{student_name_th}}',
            x: 0,
            y: 270,
            width: 1024,
            fontSize: 34,
            fontWeight: 'bold',
            color: '#78350f',
            textAlign: 'center'
          }
        ]
      },
      placeholders: ['student_name_th'],
      fontAssetKeys: [],
      publishedAt: now,
      createdAt: now,
      updatedAt: now
    }
  )

  // 9.2 Referral Letter Template & Generated Referral Letter
  const referralTemplateId = await upsertId(
    database,
    'documentTemplates',
    { code: 'DOC-RF-001' },
    {
      code: 'DOC-RF-001',
      name: 'หนังสือส่งตัวนักศึกษาเข้าฝึกงาน (Official Internship Referral Letter)',
      documentType: 'transcript',
      status: 'active',
      createdAt: now,
      updatedAt: now
    }
  )

  const referralVersionId = await upsertId(
    database,
    'documentTemplateVersions',
    { templateId: referralTemplateId, versionNumber: 1 },
    {
      templateId: referralTemplateId,
      versionNumber: 1,
      status: 'published',
      schemaVersion: 2,
      revision: 1,
      canonicalJson: {
        width: 794,
        height: 1040,
        editorMetadata: {
          nameTh:
            'หนังสือส่งตัวนักศึกษาเข้าฝึกงาน (Official Internship Referral Letter)',
          nameEn: 'Official Internship Referral Letter',
          description: 'เอกสารหนังสือส่งตัวนักศึกษาเข้าฝึกงาน (A4 แนวตั้ง)',
          backgroundType: 'watermark',
          bgOpacity: 12
        },
        elements: [
          {
            id: 'el-rf-header',
            type: 'text',
            content: 'หนังสือส่งตัวนักศึกษาเข้าฝึกงาน',
            x: 0,
            y: 80,
            width: 794,
            fontSize: 20,
            fontWeight: 'bold',
            color: '#0f172a',
            textAlign: 'center'
          },
          {
            id: 'el-rf-std-name-th',
            type: 'variable',
            variableKey: 'student_name_th',
            content: 'ชื่อนักศึกษา: {{student_name_th}}',
            x: 75,
            y: 200,
            width: 640,
            fontSize: 14,
            fontWeight: 'normal',
            color: '#0f172a',
            textAlign: 'left'
          }
        ]
      },
      placeholders: ['student_name_th'],
      fontAssetKeys: [],
      publishedAt: now,
      createdAt: now,
      updatedAt: now
    }
  )

  // Seed ready documents for submitted students (Certification + Referral letter from admin)
  if (createdStudentIds.length > 0) {
    // 1. Certification
    await upsertId(
      database,
      'generatedDocuments',
      { idempotencyKey: `dev-doc-cert-${createdStudentIds[0]}` },
      {
        studentId: createdStudentIds[0],
        templateVersionId: docVersionId,
        evaluationIds: [],
        requestedBy: 'dev:admin@localhost',
        idempotencyKey: `dev-doc-cert-${createdStudentIds[0]}`,
        status: 'ready',
        objectKey: 'documents/2026/dev-cert-6531501001.pdf',
        createdAt: now,
        updatedAt: now
      }
    )

    // 2. Official Referral letter from administrator
    await upsertId(
      database,
      'generatedDocuments',
      { idempotencyKey: `dev-doc-referral-${createdStudentIds[0]}` },
      {
        studentId: createdStudentIds[0],
        templateVersionId: referralVersionId,
        evaluationIds: [],
        requestedBy: 'dev:admin@localhost',
        idempotencyKey: `dev-doc-referral-${createdStudentIds[0]}`,
        status: 'ready',
        objectKey: 'documents/2026/dev-referral-6531501001.pdf',
        createdAt: now,
        updatedAt: now
      }
    )

    if (createdStudentIds.length > 2) {
      await upsertId(
        database,
        'generatedDocuments',
        { idempotencyKey: `dev-doc-${createdStudentIds[2]}` },
        {
          studentId: createdStudentIds[2],
          templateVersionId: docVersionId,
          evaluationIds: [],
          requestedBy: 'dev:admin@localhost',
          idempotencyKey: `dev-doc-${createdStudentIds[2]}`,
          status: 'ready',
          objectKey: 'documents/2026/dev-cert-6531502015.pdf',
          createdAt: now,
          updatedAt: now
        }
      )
    }
  }

  // 10. Email Template
  const emailTemplateId = await upsertId(
    database,
    'emailTemplates',
    { code: 'DEV-INVITATION' },
    {
      code: 'DEV-INVITATION',
      audience: 'evaluator',
      status: 'active',
      createdAt: now,
      updatedAt: now
    }
  )
  await upsertId(
    database,
    'emailTemplateVersions',
    { templateId: emailTemplateId, versionNumber: 1 },
    {
      templateId: emailTemplateId,
      versionNumber: 1,
      status: 'published',
      subject:
        'แบบประเมินสมรรถนะการฝึกงาน มหาวิทยาลัยแม่ฟ้าหลวง {{student_name}}',
      html: '<p>เรียน {{evaluator_name}}</p><p>ขอเชิญประเมินผลการฝึกงานของนักศึกษา <a href="{{invitation_url}}">เปิดแบบประเมิน</a></p><p>กำหนดส่งภายใน {{deadline}}</p>',
      text: 'เรียน {{evaluator_name}} เปิดแบบประเมิน: {{invitation_url}} ภายใน {{deadline}}',
      placeholders: [
        'student_name',
        'evaluator_name',
        'invitation_url',
        'deadline'
      ],
      publishedAt: now,
      createdAt: now,
      updatedAt: now
    }
  )

  // 11. Audit Logs
  const auditLogs = [
    {
      requestId: 'req_seed_1',
      actorId: 'dev:admin@localhost',
      actorEmail: 'admin@localhost',
      action: 'LOGIN',
      route: '/api/v2/auth/dev/login',
      method: 'POST',
      outcome: 'success',
      metadata: { role: 'systemAdmin' },
      createdAt: past
    },
    {
      requestId: 'req_seed_2',
      actorId: 'dev:admin@localhost',
      actorEmail: 'admin@localhost',
      action: 'CREATE_COMPETENCY_SET',
      route: '/api/v2/competency-sets',
      method: 'POST',
      outcome: 'success',
      metadata: { code: 'DEV-COMP' },
      createdAt: past
    }
  ]

  for (const log of auditLogs) {
    await database
      .collection('auditLogs')
      .updateOne(
        { requestId: log.requestId },
        { $set: log, $setOnInsert: { _id: new ObjectId() } },
        { upsert: true }
      )
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        schoolsCount: schoolsData.length,
        programsCount: schoolsData.reduce(
          (acc, s) => acc + s.programs.length,
          0
        ),
        coursesCount: courseMap.size,
        studentsCount: studentsData.length,
        organizationsCount: organizationsData.length,
        evaluatorsCount: evaluatorsData.length,
        cycleId
      },
      null,
      2
    )}\n`
  )
} finally {
  await client.close()
}

async function upsertId(
  database: Db,
  collection: string,
  filter: Readonly<Record<string, unknown>>,
  document: Readonly<Record<string, unknown>>,
  unsetFields: readonly string[] = []
): Promise<string> {
  const update = {
    $set: document,
    $setOnInsert: { _id: new ObjectId() },
    ...(unsetFields.length > 0
      ? { $unset: Object.fromEntries(unsetFields.map((field) => [field, ''])) }
      : {})
  }
  const result = await database
    .collection(collection)
    .findOneAndUpdate(filter, update, { upsert: true, returnDocument: 'after' })
  if (!result) throw new Error(`Failed to seed ${collection}.`)
  return result._id.toString()
}
