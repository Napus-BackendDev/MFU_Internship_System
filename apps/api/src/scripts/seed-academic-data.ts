import { MongoClient, ObjectId, type Collection, type Document } from 'mongodb'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// 14 Schools and 36 Programs from Mae Fah Luang University
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

async function upsertRecord(
  collection: Collection<Document>,
  filter: Record<string, unknown>,
  doc: Record<string, unknown>
): Promise<string> {
  const existing = await collection.findOne(filter)
  if (existing) {
    await collection.updateOne(filter, { $set: doc })
    return existing._id.toString()
  } else {
    const newId = new ObjectId()
    await collection.insertOne({ _id: newId, ...doc })
    return newId.toString()
  }
}

async function main(): Promise<void> {
  let mongoUri = process.env.MONGODB_URI
  if (!mongoUri) {
    // Read from .env.production
    const envProdPath = resolve(process.cwd(), '../../.env.production')
    try {
      const content = readFileSync(envProdPath, 'utf8')
      const match = content.match(/^MONGODB_URI=(.+)$/m)
      if (match) {
        mongoUri = match[1].trim()
      }
    } catch (err) {
      console.error('Failed to read .env.production:', err)
    }
  }

  if (!mongoUri) {
    throw new Error('MONGODB_URI is required.')
  }

  const client = new MongoClient(mongoUri)
  await client.connect()
  console.log('Connected to MongoDB cluster.')

  try {
    const db = client.db('internship-app')
    console.log(`Using database: ${db.databaseName}`)

    const now = new Date()
    const schoolMap = new Map<string, string>()
    const programMap = new Map<string, string>()
    let coursesCount = 0

    for (const s of schoolsData) {
      const sId = await upsertRecord(
        db.collection('schools'),
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
        const pId = await upsertRecord(
          db.collection('programs'),
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
        await upsertRecord(
          db.collection('courses'),
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
        coursesCount++
      }
    }

    // Common Cooperative Education course (COOP101)
    const allProgramIds = Array.from(programMap.values())
    await upsertRecord(
      db.collection('courses'),
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
    coursesCount++

    console.log(
      `Successfully seeded ${schoolMap.size} Schools, ${programMap.size} Programs, and ${coursesCount} Courses into ${db.databaseName}.`
    )
  } finally {
    await client.close()
    console.log('MongoDB connection closed.')
  }
}

main().catch((err) => {
  console.error('Seed error:', err)
  process.exit(1)
})
