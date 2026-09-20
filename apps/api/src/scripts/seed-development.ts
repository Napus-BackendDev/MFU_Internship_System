import { loadEnvironment } from '@internship/config'
import { MongoClient, ObjectId, type Db } from 'mongodb'

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

  // 1. Schools and Programs (14 Schools, 34 Programs from Mae Fah Luang University)
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

  // 3. Organizations
  const organizationsData = [
    {
      code: 'DEVCO',
      name: {
        th: 'บริษัท ดิจิทัล โซลูชั่นส์ จำกัด',
        en: 'Digital Solutions Co., Ltd.'
      },
      email: 'hr@devco.com',
      province: 'เชียงใหม่'
    },
    {
      code: 'BAKER',
      name: {
        th: 'สำนักงานกฎหมาย เบเกอร์ แอนด์ แอสโซซิเอทส์',
        en: 'Baker & Associates Law Office'
      },
      email: 'contact@bakerlaw.com',
      province: 'กรุงเทพมหานคร'
    },
    {
      code: 'BGHOSP',
      name: {
        th: 'โรงพยาบาลกรุงเทพ เชียงราย',
        en: 'Bangkok Hospital Chiang Rai'
      },
      email: 'hr@bghosp.com',
      province: 'เชียงราย'
    },
    {
      code: 'CPFOOD',
      name: {
        th: 'บริษัท ซีพีเอฟ ฟู้ด แอนด์ เบฟเวอเรจ จำกัด',
        en: 'CPF Food & Beverage Co., Ltd.'
      },
      email: 'internship@cpfood.com',
      province: 'เชียงใหม่'
    },
    {
      code: 'MILOTT',
      name: {
        th: 'บริษัท ไมลอทท์ แลบบอราทอรีส์ จำกัด',
        en: 'Milott Laboratories Co., Ltd.'
      },
      email: 'hr@milott.com',
      province: 'สมุทรปราการ'
    },
    {
      code: 'SCG',
      name: {
        th: 'บริษัท ปูนซิเมนต์ไทย จำกัด (มหาชน)',
        en: 'Siam Cement Group Public Company Limited'
      },
      email: 'careers@scg.com',
      province: 'สระบุรี'
    },
    {
      code: 'PTTOR',
      name: {
        th: 'บริษัท ปตท. น้ำมันและการค้าปลีก จำกัด (มหาชน)',
        en: 'PTT Oil and Retail Business Public Company Limited'
      },
      email: 'internship@pttor.com',
      province: 'กรุงเทพมหานคร'
    },
    {
      code: 'KASIKORN',
      name: {
        th: 'ธนาคารกสิกรไทย จำกัด (มหาชน)',
        en: 'Kasikornbank Public Company Limited'
      },
      email: 'hr@kasikornbank.com',
      province: 'กรุงเทพมหานคร'
    }
  ]

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

  // 4. Evaluators
  const evaluatorsData = [
    {
      orgCode: 'DEVCO',
      email: 'evaluator.it@devco.com',
      name: { th: 'นายพงศกร เทคทิม', en: 'Pongsakorn Techteam' },
      position: { th: 'หัวหน้าทีมพัฒนาซอฟต์แวร์', en: 'Lead Developer' }
    },
    {
      orgCode: 'BAKER',
      email: 'evaluator.law@bakerlaw.com',
      name: { th: 'นายธนิต นิติกรรม', en: 'Thanit Nitikarn' },
      position: { th: 'ทนายความหุ้นส่วนอาวุโส', en: 'Senior Partner' }
    },
    {
      orgCode: 'BGHOSP',
      email: 'evaluator.nurse@bghosp.com',
      name: { th: 'นางสาวอรัญญา บริบาล', en: 'Aranya Boriban' },
      position: { th: 'หัวหน้าฝ่ายการพยาบาล', en: 'Head Nurse' }
    },
    {
      orgCode: 'CPFOOD',
      email: 'evaluator.food@cpfood.com',
      name: { th: 'นายวิชัย ควบคุมคุณภาพ', en: 'Wichai Quality' },
      position: { th: 'ผู้จัดการฝ่ายประกันคุณภาพ', en: 'QA Manager' }
    },
    {
      orgCode: 'MILOTT',
      email: 'evaluator.cos@milott.com',
      name: { th: 'ดร.สุดาพร คิดค้น', en: 'Dr. Sudaporn R&D' },
      position: { th: 'ผู้เชี่ยวชาญวิจัยและพัฒนา', en: 'R&D Specialist' }
    },
    {
      orgCode: 'SCG',
      email: 'evaluator.eng@scg.com',
      name: { th: 'นายเกียรติศักดิ์ วิศวกรรม', en: 'Kiattisak Engineering' },
      position: {
        th: 'ผู้จัดการฝ่ายวิศวกรรมการผลิต',
        en: 'Engineering Manager'
      }
    },
    {
      orgCode: 'PTTOR',
      email: 'evaluator.hr@pttor.com',
      name: { th: 'นางสาวศิริพร พัฒนาองค์กร', en: 'Siriporn OrgDev' },
      position: {
        th: 'ผู้จัดการฝ่ายพัฒนาทรัพยากรบุคคล',
        en: 'HR Development Manager'
      }
    },
    {
      orgCode: 'KASIKORN',
      email: 'evaluator.fin@kasikornbank.com',
      name: { th: 'นายธีรเดช การเงิน', en: 'Theeradech Finance' },
      position: {
        th: 'ผู้อำนวยการฝ่ายการเงินและธุรกิจ',
        en: 'Director of Finance'
      }
    }
  ]

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

  // 5. Students across schools (70 students)
  const studentsData = [
    {
      studentId: '6531501001',
      name: { th: 'นายสมชาย วิศวกร', en: 'Somchai Witsawakan' },
      email: '6531501001@lamduan.mfu.ac.th',
      personalEmail: 'somchai.dev@gmail.com',
      school: 'IT',
      program: 'SE',
      course: '1301493',
      org: 'DEVCO',
      status: 'submitted' as const
    },
    {
      studentId: '6531501002',
      name: { th: 'นายอนันต์ โค้ดเดอร์', en: 'Anan Coder' },
      email: '6531501002@lamduan.mfu.ac.th',
      personalEmail: 'anan.coder@gmail.com',
      school: 'IT',
      program: 'CPE',
      course: '1301491',
      org: 'DEVCO',
      status: 'inProgress' as const
    },
    {
      studentId: '6531502015',
      name: { th: 'นางสาวกิตติมา ยุติธรรม', en: 'Kittima Yuttitham' },
      email: '6531502015@lamduan.mfu.ac.th',
      personalEmail: 'kittima.law@gmail.com',
      school: 'LAW',
      program: 'LLB',
      course: '1601491',
      org: 'BAKER',
      status: 'submitted' as const
    },
    {
      studentId: '6531503022',
      name: { th: 'นายวรเมธ การค้า', en: 'Worameth Kanka' },
      email: '6531503022@lamduan.mfu.ac.th',
      personalEmail: 'worameth.biz@gmail.com',
      school: 'MGT',
      program: 'BA',
      course: '1201491',
      org: 'KASIKORN',
      status: 'pending' as const
    },
    {
      studentId: '6531504008',
      name: { th: 'นางสาวพิมพาภรณ์ เมตตา', en: 'Pimpaporn Metta' },
      email: '6531504008@lamduan.mfu.ac.th',
      personalEmail: 'pimpaporn.nurse@gmail.com',
      school: 'NS',
      program: 'NSB',
      course: '1501491',
      org: 'BGHOSP',
      status: 'submitted' as const
    },
    {
      studentId: '6531505012',
      name: { th: 'นายภัทรดนัย เกษตรกร', en: 'Phatradanai Kaset' },
      email: '6531505012@lamduan.mfu.ac.th',
      personalEmail: 'phatradanai.agro@gmail.com',
      school: 'AI',
      program: 'FST',
      course: '1401491',
      org: 'CPFOOD',
      status: 'inProgress' as const
    },
    {
      studentId: '6531506005',
      name: { th: 'นางสาวณัฐธิดา สวยงาม', en: 'Natthida Suayngam' },
      email: '6531506005@lamduan.mfu.ac.th',
      personalEmail: 'natthida.cos@gmail.com',
      school: 'COS',
      program: 'CSB',
      course: '1701491',
      org: 'MILOTT',
      status: 'submitted' as const
    },
    {
      studentId: '6531507019',
      name: { th: 'นายธนากร สุขภาพ', en: 'Thanakorn Sukapap' },
      email: '6531507019@lamduan.mfu.ac.th',
      personalEmail: 'thanakorn.health@gmail.com',
      school: 'HS',
      program: 'OHS',
      course: '1801494',
      org: 'CPFOOD',
      status: 'pending' as const
    },
    {
      studentId: '6531501009',
      name: { th: 'นางสาวชญานุช ปัญญาดี', en: 'Chayanuch Panyadee' },
      email: '6531501009@lamduan.mfu.ac.th',
      personalEmail: 'chayanuch.ai@gmail.com',
      school: 'IT',
      program: 'DCE',
      course: '1301492',
      org: 'DEVCO',
      status: 'submitted' as const
    },
    {
      studentId: '6531503045',
      name: { th: 'นายชยพล การเงิน', en: 'Chayapol Kanngern' },
      email: '6531503045@lamduan.mfu.ac.th',
      personalEmail: 'chayapol.fin@gmail.com',
      school: 'MGT',
      program: 'ACC',
      course: '1201493',
      org: 'KASIKORN',
      status: 'inProgress' as const
    },
    {
      studentId: '6531501033',
      name: { th: 'นายพีรพัฒน์ โปรแกรมเมอร์', en: 'Peerapat Programmer' },
      email: '6531501033@lamduan.mfu.ac.th',
      personalEmail: 'peerapat.dev@gmail.com',
      school: 'IT',
      program: 'SE',
      course: '1301493',
      org: 'DEVCO',
      status: 'pending' as const
    },
    {
      studentId: '6531502048',
      name: { th: 'นายศรัณย์ ความยุติธรรม', en: 'Saran Khwamyuttitham' },
      email: '6531502048@lamduan.mfu.ac.th',
      personalEmail: 'saran.justice@gmail.com',
      school: 'LAW',
      program: 'LLB',
      course: '1601491',
      org: 'BAKER',
      status: 'inProgress' as const
    },
    {
      studentId: '6531508003',
      name: { th: 'นางสาวมินตรา อักษรศาสตร์', en: 'Mintra Aksornsart' },
      email: '6531508003@lamduan.mfu.ac.th',
      personalEmail: 'mintra.arts@gmail.com',
      school: 'LA',
      program: 'ENG',
      course: '1001491',
      org: 'PTTOR',
      status: 'submitted' as const
    },
    {
      studentId: '6531508027',
      name: { th: 'นายชานนท์ ภาษาไทย', en: 'Chanon Phasathai' },
      email: '6531508027@lamduan.mfu.ac.th',
      personalEmail: 'chanon.thai@gmail.com',
      school: 'LA',
      program: 'TLC',
      course: '1001492',
      org: 'PTTOR',
      status: 'pending' as const
    },
    {
      studentId: '6531509014',
      name: { th: 'นายธนกฤต วิทยาเคมี', en: 'Thanakrit Wittayakhemi' },
      email: '6531509014@lamduan.mfu.ac.th',
      personalEmail: 'thanakrit.chem@gmail.com',
      school: 'SCI',
      program: 'AC',
      course: '1101491',
      org: 'SCG',
      status: 'submitted' as const
    },
    {
      studentId: '6531509038',
      name: { th: 'นางสาวกัญญาณัฐ ชีววิทยา', en: 'Kanyanat Cheewawitthaya' },
      email: '6531509038@lamduan.mfu.ac.th',
      personalEmail: 'kanyanat.bio@gmail.com',
      school: 'SCI',
      program: 'BIO',
      course: '1101492',
      org: 'SCG',
      status: 'inProgress' as const
    },
    {
      studentId: '6531503088',
      name: { th: 'นายปวริศ เศรษฐการ', en: 'Pawaris Setthakarn' },
      email: '6531503088@lamduan.mfu.ac.th',
      personalEmail: 'pawaris.econ@gmail.com',
      school: 'MGT',
      program: 'ECON',
      course: '1201492',
      org: 'KASIKORN',
      status: 'submitted' as const
    },
    {
      studentId: '6531510011',
      name: {
        th: 'นางสาวศศิธร สังคมนวัตกรรม',
        en: 'Sasithorn Sangkhomnawattacham'
      },
      email: '6531510011@lamduan.mfu.ac.th',
      personalEmail: 'sasithorn.soc@gmail.com',
      school: 'SOC',
      program: 'ID',
      course: '2101491',
      org: 'PTTOR',
      status: 'pending' as const
    },
    {
      studentId: '6531511025',
      name: { th: 'นายเจียรนัย จีนศึกษา', en: 'Jiaranai Jeensuksa' },
      email: '6531511025@lamduan.mfu.ac.th',
      personalEmail: 'jiaranai.chinese@gmail.com',
      school: 'SIN',
      program: 'CS',
      course: '2201491',
      org: 'PTTOR',
      status: 'inProgress' as const
    },
    {
      studentId: '6531512007',
      name: { th: 'นางสาวอารยา การแพทย์ไทย', en: 'Araya Karnphaetthai' },
      email: '6531512007@lamduan.mfu.ac.th',
      personalEmail: 'araya.med@gmail.com',
      school: 'IM',
      program: 'ATM',
      course: '2301491',
      org: 'BGHOSP',
      status: 'submitted' as const
    },
    {
      studentId: '6531501041',
      name: { th: 'นายกฤษณะ ธนทรัพย์', en: 'Kritsana Thanasap' },
      email: '6531501041@lamduan.mfu.ac.th',
      personalEmail: 'kritsana.net@gmail.com',
      school: 'IT',
      program: 'DCE',
      course: '1301492',
      org: 'DEVCO',
      status: 'inProgress' as const
    },
    {
      studentId: '6531501042',
      name: { th: 'นายธีรภัทร ชัยมงคล', en: 'Theerapat Chaimongkol' },
      email: '6531501042@lamduan.mfu.ac.th',
      personalEmail: 'theerapat.biz@gmail.com',
      school: 'IT',
      program: 'DBI',
      course: '1301494',
      org: 'DEVCO',
      status: 'submitted' as const
    },
    {
      studentId: '6531501043',
      name: { th: 'นางสาววราภรณ์ มัลติมีเดีย', en: 'Waraporn Multimedia' },
      email: '6531501043@lamduan.mfu.ac.th',
      personalEmail: 'waraporn.media@gmail.com',
      school: 'IT',
      program: 'MTA',
      course: '1301495',
      org: 'DEVCO',
      status: 'pending' as const
    },
    {
      studentId: '6531501044',
      name: { th: 'นายอัครเดช ดิจิทัล', en: 'Akkaradech Digital' },
      email: '6531501044@lamduan.mfu.ac.th',
      personalEmail: 'akkaradech.dev@gmail.com',
      school: 'IT',
      program: 'SE',
      course: '1301493',
      org: 'SCG',
      status: 'submitted' as const
    },
    {
      studentId: '6531501045',
      name: {
        th: 'นายรัชชานนท์ ปัญญาเครือข่าย',
        en: 'Ratchanon Panyakhrueakhai'
      },
      email: '6531501045@lamduan.mfu.ac.th',
      personalEmail: 'ratchanon.cpe@gmail.com',
      school: 'IT',
      program: 'CPE',
      course: '1301491',
      org: 'PTTOR',
      status: 'inProgress' as const
    },
    {
      studentId: '6531502051',
      name: { th: 'นายพงศ์พิสุทธิ์ นิติวิทย์', en: 'Pongpisut Nitiwit' },
      email: '6531502051@lamduan.mfu.ac.th',
      personalEmail: 'pongpisut.law@gmail.com',
      school: 'LAW',
      program: 'BLC',
      course: '1601492',
      org: 'BAKER',
      status: 'submitted' as const
    },
    {
      studentId: '6531502052',
      name: {
        th: 'นางสาวณัฐภัสสร กฎหมายสากล',
        en: 'Natthaphatsorn Kodmaisaakon'
      },
      email: '6531502052@lamduan.mfu.ac.th',
      personalEmail: 'natthaphatsorn.law@gmail.com',
      school: 'LAW',
      program: 'LLB',
      course: '1601491',
      org: 'BAKER',
      status: 'pending' as const
    },
    {
      studentId: '6531502053',
      name: { th: 'นายสหรัฐ นิติธรรมการ', en: 'Saharat Nitithamkarn' },
      email: '6531502053@lamduan.mfu.ac.th',
      personalEmail: 'saharat.law@gmail.com',
      school: 'LAW',
      program: 'BLC',
      course: '1601492',
      org: 'KASIKORN',
      status: 'inProgress' as const
    },
    {
      studentId: '6531503051',
      name: { th: 'นางสาวชลธิชา บริหารสุข', en: 'Chonthicha Borihansuk' },
      email: '6531503051@lamduan.mfu.ac.th',
      personalEmail: 'chonthicha.mgt@gmail.com',
      school: 'MGT',
      program: 'BA',
      course: '1201491',
      org: 'KASIKORN',
      status: 'submitted' as const
    },
    {
      studentId: '6531503052',
      name: { th: 'นายภัทรพล ทรัพยากร', en: 'Phattaraphon Sapphayakon' },
      email: '6531503052@lamduan.mfu.ac.th',
      personalEmail: 'phattaraphon.hr@gmail.com',
      school: 'MGT',
      program: 'BA',
      course: '1201491',
      org: 'PTTOR',
      status: 'inProgress' as const
    },
    {
      studentId: '6531503053',
      name: {
        th: 'นายศุภชัย วิเคราะห์เศรษฐกิจ',
        en: 'Suphachai Wikhrosetthakit'
      },
      email: '6531503053@lamduan.mfu.ac.th',
      personalEmail: 'suphachai.econ@gmail.com',
      school: 'MGT',
      program: 'ECON',
      course: '1201492',
      org: 'KASIKORN',
      status: 'pending' as const
    },
    {
      studentId: '6531503054',
      name: {
        th: 'นางสาวพิมพ์วลัญช์ ตรวจสอบบัญชี',
        en: 'Pimwalun Truatsobbanchi'
      },
      email: '6531503054@lamduan.mfu.ac.th',
      personalEmail: 'pimwalun.acc@gmail.com',
      school: 'MGT',
      program: 'ACC',
      course: '1201493',
      org: 'SCG',
      status: 'submitted' as const
    },
    {
      studentId: '6531503055',
      name: { th: 'นายณภัทร ธุรกิจนำเข้า', en: 'Naphat Thurakitnamkhao' },
      email: '6531503055@lamduan.mfu.ac.th',
      personalEmail: 'naphat.trade@gmail.com',
      school: 'MGT',
      program: 'BA',
      course: '1201491',
      org: 'SCG',
      status: 'inProgress' as const
    },
    {
      studentId: '6531504011',
      name: {
        th: 'นางสาวเบญญาภา พยาบาลเชี่ยวชาญ',
        en: 'Benyapha Phayabancheochan'
      },
      email: '6531504011@lamduan.mfu.ac.th',
      personalEmail: 'benyapha.nurse@gmail.com',
      school: 'NS',
      program: 'NSB',
      course: '1501491',
      org: 'BGHOSP',
      status: 'submitted' as const
    },
    {
      studentId: '6531504012',
      name: { th: 'นางสาววริศรา บริรักษ์', en: 'Waritsara Borirak' },
      email: '6531504012@lamduan.mfu.ac.th',
      personalEmail: 'waritsara.nurse@gmail.com',
      school: 'NS',
      program: 'NSB',
      course: '1501491',
      org: 'BGHOSP',
      status: 'inProgress' as const
    },
    {
      studentId: '6531504013',
      name: { th: 'นายภัทรดนัย ดูแลผู้ป่วย', en: 'Phatradanai Dulaephuphuai' },
      email: '6531504013@lamduan.mfu.ac.th',
      personalEmail: 'phatradanai.nurse@gmail.com',
      school: 'NS',
      program: 'NSB',
      course: '1501491',
      org: 'BGHOSP',
      status: 'pending' as const
    },
    {
      studentId: '6531505021',
      name: { th: 'นายกิตติศักดิ์ พัฒนาอาหาร', en: 'Kittisak Phattanaahan' },
      email: '6531505021@lamduan.mfu.ac.th',
      personalEmail: 'kittisak.food@gmail.com',
      school: 'AI',
      program: 'FST',
      course: '1401491',
      org: 'CPFOOD',
      status: 'submitted' as const
    },
    {
      studentId: '6531505022',
      name: {
        th: 'นางสาวชนัญชิดา ห่วงโซ่อุปทาน',
        en: 'Chananchida Huangso-uppathan'
      },
      email: '6531505022@lamduan.mfu.ac.th',
      personalEmail: 'chananchida.log@gmail.com',
      school: 'AI',
      program: 'AFL',
      course: '1401492',
      org: 'CPFOOD',
      status: 'inProgress' as const
    },
    {
      studentId: '6531505023',
      name: {
        th: 'นายภูริช โลจิสติกส์การเกษตร',
        en: 'Phurich Logisticskankaset'
      },
      email: '6531505023@lamduan.mfu.ac.th',
      personalEmail: 'phurich.agri@gmail.com',
      school: 'AI',
      program: 'AFL',
      course: '1401492',
      org: 'SCG',
      status: 'pending' as const
    },
    {
      studentId: '6531506011',
      name: { th: 'นางสาวกฤติยา พัฒนาสูตร', en: 'Krittiya Phattanasut' },
      email: '6531506011@lamduan.mfu.ac.th',
      personalEmail: 'krittiya.cos@gmail.com',
      school: 'COS',
      program: 'CSB',
      course: '1701491',
      org: 'MILOTT',
      status: 'submitted' as const
    },
    {
      studentId: '6531506012',
      name: {
        th: 'นางสาวปัณฑิตา ความงามนวัตกรรม',
        en: 'Panthita Khwamngamnawattacham'
      },
      email: '6531506012@lamduan.mfu.ac.th',
      personalEmail: 'panthita.beauty@gmail.com',
      school: 'COS',
      program: 'BT',
      course: '1701492',
      org: 'MILOTT',
      status: 'inProgress' as const
    },
    {
      studentId: '6531506013',
      name: { th: 'นางสาวธนัชชา เวชสำอาง', en: 'Thanatcha Wetchasamang' },
      email: '6531506013@lamduan.mfu.ac.th',
      personalEmail: 'thanatcha.cos@gmail.com',
      school: 'COS',
      program: 'CSB',
      course: '1701491',
      org: 'MILOTT',
      status: 'pending' as const
    },
    {
      studentId: '6531507021',
      name: {
        th: 'นายกฤษฎา ปลอดภัยสิ่งแวดล้อม',
        en: 'Kritsada Plotphaisingwaetlom'
      },
      email: '6531507021@lamduan.mfu.ac.th',
      personalEmail: 'kritsada.env@gmail.com',
      school: 'HS',
      program: 'ENV',
      course: '1801493',
      org: 'SCG',
      status: 'submitted' as const
    },
    {
      studentId: '6531507022',
      name: {
        th: 'นางสาวพัชรีพร อนามัยชุมชน',
        en: 'Patchareeporn Anamaichumchon'
      },
      email: '6531507022@lamduan.mfu.ac.th',
      personalEmail: 'patchareeporn.ph@gmail.com',
      school: 'HS',
      program: 'PH',
      course: '1801491',
      org: 'BGHOSP',
      status: 'inProgress' as const
    },
    {
      studentId: '6531507023',
      name: {
        th: 'นายเมธัส กีฬาและเวชศาสตร์',
        en: 'Methas Kila-lae-wetchasat'
      },
      email: '6531507023@lamduan.mfu.ac.th',
      personalEmail: 'methas.sport@gmail.com',
      school: 'HS',
      program: 'SHS',
      course: '1801492',
      org: 'BGHOSP',
      status: 'pending' as const
    },
    {
      studentId: '6531507024',
      name: {
        th: 'นางสาวปรียานุช ควบคุมอาชีวอนามัย',
        en: 'Preeyanuch Khuapkhumachilwa'
      },
      email: '6531507024@lamduan.mfu.ac.th',
      personalEmail: 'preeyanuch.ohs@gmail.com',
      school: 'HS',
      program: 'OHS',
      course: '1801494',
      org: 'PTTOR',
      status: 'submitted' as const
    },
    {
      studentId: '6531508031',
      name: { th: 'นายวรัญญู สื่อสารอังกฤษ', en: 'Waranyoo Suesanangrit' },
      email: '6531508031@lamduan.mfu.ac.th',
      personalEmail: 'waranyoo.eng@gmail.com',
      school: 'LA',
      program: 'ENG',
      course: '1001491',
      org: 'PTTOR',
      status: 'inProgress' as const
    },
    {
      studentId: '6531508032',
      name: {
        th: 'นางสาวสโรชา วัฒนธรรมนานาชาติ',
        en: 'Sarocha Watthanathamnanachat'
      },
      email: '6531508032@lamduan.mfu.ac.th',
      personalEmail: 'sarocha.thai@gmail.com',
      school: 'LA',
      program: 'TLC',
      course: '1001492',
      org: 'DEVCO',
      status: 'pending' as const
    },
    {
      studentId: '6531508033',
      name: { th: 'นายทรงกลด ล่ามภาษา', en: 'Songklod Lamphasa' },
      email: '6531508033@lamduan.mfu.ac.th',
      personalEmail: 'songklod.inter@gmail.com',
      school: 'LA',
      program: 'ENG',
      course: '1001491',
      org: 'BAKER',
      status: 'submitted' as const
    },
    {
      studentId: '6531509041',
      name: { th: 'นายกฤษณพงศ์ โพลิเมอร์แล็บ', en: 'Kritsanaphong Polymerlab' },
      email: '6531509041@lamduan.mfu.ac.th',
      personalEmail: 'kritsanaphong.mat@gmail.com',
      school: 'SCI',
      program: 'MATE',
      course: '1101493',
      org: 'SCG',
      status: 'inProgress' as const
    },
    {
      studentId: '6531509042',
      name: {
        th: 'นางสาวนภัสสร จุลชีววิทยา',
        en: 'Naphatsorn Junlacheewawitthaya'
      },
      email: '6531509042@lamduan.mfu.ac.th',
      personalEmail: 'naphatsorn.bio@gmail.com',
      school: 'SCI',
      program: 'BIO',
      course: '1101492',
      org: 'CPFOOD',
      status: 'submitted' as const
    },
    {
      studentId: '6531509043',
      name: { th: 'นางสาวสุธิมา วิเคราะห์สาร', en: 'Suthima Wikhrohsan' },
      email: '6531509043@lamduan.mfu.ac.th',
      personalEmail: 'suthima.chem@gmail.com',
      school: 'SCI',
      program: 'AC',
      course: '1101491',
      org: 'MILOTT',
      status: 'pending' as const
    },
    {
      studentId: '6531510021',
      name: {
        th: 'นายปรัชญา พัฒนาสังคมยั่งยืน',
        en: 'Pratchaya Phattanasangkhomyangyuen'
      },
      email: '6531510021@lamduan.mfu.ac.th',
      personalEmail: 'pratchaya.soc@gmail.com',
      school: 'SOC',
      program: 'ID',
      course: '2101491',
      org: 'PTTOR',
      status: 'inProgress' as const
    },
    {
      studentId: '6531510022',
      name: { th: 'นางสาวธนพร ชุมชนสากล', en: 'Thanaporn Chumchonsaakon' },
      email: '6531510022@lamduan.mfu.ac.th',
      personalEmail: 'thanaporn.dev@gmail.com',
      school: 'SOC',
      program: 'ID',
      course: '2101491',
      org: 'SCG',
      status: 'submitted' as const
    },
    {
      studentId: '6531511031',
      name: { th: 'นางสาวหทัยชนก ธุรกิจจีน', en: 'Hathaichanok Thurakitchin' },
      email: '6531511031@lamduan.mfu.ac.th',
      personalEmail: 'hathaichanok.sin@gmail.com',
      school: 'SIN',
      program: 'BC',
      course: '2201492',
      org: 'PTTOR',
      status: 'pending' as const
    },
    {
      studentId: '6531511032',
      name: {
        th: 'นายภาคิน วัฒนธรรมจีนสัมพันธ์',
        en: 'Phakin Watthanathamchin'
      },
      email: '6531511032@lamduan.mfu.ac.th',
      personalEmail: 'phakin.sin@gmail.com',
      school: 'SIN',
      program: 'CLC',
      course: '2201493',
      org: 'DEVCO',
      status: 'inProgress' as const
    },
    {
      studentId: '6531511033',
      name: {
        th: 'นายพิชญุตม์ ครูสอนภาษาจีน',
        en: 'Pitchayut Khrusonphasachin'
      },
      email: '6531511033@lamduan.mfu.ac.th',
      personalEmail: 'pitchayut.teach@gmail.com',
      school: 'SIN',
      program: 'TCL',
      course: '2201494',
      org: 'BAKER',
      status: 'submitted' as const
    },
    {
      studentId: '6531511034',
      name: {
        th: 'นางสาวกุลธิดา จีนศึกษาการทูต',
        en: 'Kultida Chinsuksakantuut'
      },
      email: '6531511034@lamduan.mfu.ac.th',
      personalEmail: 'kultida.diplo@gmail.com',
      school: 'SIN',
      program: 'CS',
      course: '2201491',
      org: 'KASIKORN',
      status: 'inProgress' as const
    },
    {
      studentId: '6531512011',
      name: {
        th: 'นายชลธิศ กายภาพบำบัดฟื้นฟู',
        en: 'Chonthit Kaiyaphabbambatfuenfu'
      },
      email: '6531512011@lamduan.mfu.ac.th',
      personalEmail: 'chonthit.pt@gmail.com',
      school: 'IM',
      program: 'PT',
      course: '2301492',
      org: 'BGHOSP',
      status: 'submitted' as const
    },
    {
      studentId: '6531512012',
      name: {
        th: 'นางสาวณิชกานต์ แพทย์แผนจีนสมุนไพร',
        en: 'Nichakan Phaetphaenchin'
      },
      email: '6531512012@lamduan.mfu.ac.th',
      personalEmail: 'nichakan.tcm@gmail.com',
      school: 'IM',
      program: 'TCM',
      course: '2301493',
      org: 'BGHOSP',
      status: 'pending' as const
    },
    {
      studentId: '6531512013',
      name: {
        th: 'นายธีรโชติ สมุนไพรไทยประยุกต์',
        en: 'Theerachot Samunphraithai'
      },
      email: '6531512013@lamduan.mfu.ac.th',
      personalEmail: 'theerachot.atm@gmail.com',
      school: 'IM',
      program: 'ATM',
      course: '2301491',
      org: 'BGHOSP',
      status: 'inProgress' as const
    },
    {
      studentId: '6531513001',
      name: { th: 'นายภูวดล คลินิกเวชกรรม', en: 'Phuwadol Khlinikwetchakam' },
      email: '6531513001@lamduan.mfu.ac.th',
      personalEmail: 'phuwadol.md@gmail.com',
      school: 'MED',
      program: 'MD',
      course: '1901491',
      org: 'BGHOSP',
      status: 'submitted' as const
    },
    {
      studentId: '6531513002',
      name: {
        th: 'นางสาวธวัลหทัย เวชปฏิบัติ',
        en: 'Thawanrhathai Wetchapatibat'
      },
      email: '6531513002@lamduan.mfu.ac.th',
      personalEmail: 'thawanrhathai.md@gmail.com',
      school: 'MED',
      program: 'MD',
      course: '1901491',
      org: 'BGHOSP',
      status: 'inProgress' as const
    },
    {
      studentId: '6531514001',
      name: { th: 'นายจิรภัทร ทันตกรรมบูรณะ', en: 'Jiraphat Thantakamburana' },
      email: '6531514001@lamduan.mfu.ac.th',
      personalEmail: 'jiraphat.dent@gmail.com',
      school: 'DENT',
      program: 'DDS',
      course: '2001491',
      org: 'BGHOSP',
      status: 'submitted' as const
    },
    {
      studentId: '6531514002',
      name: {
        th: 'นางสาววริยา ทันตกรรมหัตถการ',
        en: 'Wariya Thantakamhattakarn'
      },
      email: '6531514002@lamduan.mfu.ac.th',
      personalEmail: 'wariya.dent@gmail.com',
      school: 'DENT',
      program: 'DDS',
      course: '2001491',
      org: 'BGHOSP',
      status: 'pending' as const
    },
    {
      studentId: '6531501061',
      name: {
        th: 'นายอลงกรณ์ พัฒนาโมบายแอป',
        en: 'Alongkorn Phattanamobileapp'
      },
      email: '6531501061@lamduan.mfu.ac.th',
      personalEmail: 'alongkorn.app@gmail.com',
      school: 'IT',
      program: 'SE',
      course: '1301493',
      org: 'DEVCO',
      status: 'submitted' as const
    },
    {
      studentId: '6531501062',
      name: {
        th: 'นางสาวจันทกานต์ ฐานข้อมูลองค์กร',
        en: 'Chanthakan Thankhomun'
      },
      email: '6531501062@lamduan.mfu.ac.th',
      personalEmail: 'chanthakan.data@gmail.com',
      school: 'IT',
      program: 'DBI',
      course: '1301494',
      org: 'KASIKORN',
      status: 'inProgress' as const
    },
    {
      studentId: '6531502061',
      name: {
        th: 'นายภานุวัฒน์ นิติธรรมพาณิชย์',
        en: 'Phanuwat Nitithamphanit'
      },
      email: '6531502061@lamduan.mfu.ac.th',
      personalEmail: 'phanuwat.legal@gmail.com',
      school: 'LAW',
      program: 'LLB',
      course: '1601491',
      org: 'BAKER',
      status: 'submitted' as const
    },
    {
      studentId: '6531503061',
      name: {
        th: 'นายกษิดิศ เศรษฐศาสตร์ระหว่างประเทศ',
        en: 'Khasidit Setthasatrawangprathet'
      },
      email: '6531503061@lamduan.mfu.ac.th',
      personalEmail: 'khasidit.econ@gmail.com',
      school: 'MGT',
      program: 'ECON',
      course: '1201492',
      org: 'KASIKORN',
      status: 'inProgress' as const
    },
    {
      studentId: '6531506021',
      name: {
        th: 'นางสาวลลิตา วิทยาการเครื่องสำอางชั้นสูง',
        en: 'Lalita Wittayakankhrueangsamang'
      },
      email: '6531506021@lamduan.mfu.ac.th',
      personalEmail: 'lalita.cosmetic@gmail.com',
      school: 'COS',
      program: 'CSB',
      course: '1701491',
      org: 'MILOTT',
      status: 'submitted' as const
    }
  ]

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
        }
      ]
    },
    {
      id: 'technical-competency',
      title: {
        th: 'หมวด 2: ทักษะวิชาชีพเฉพาะทางตามสาขาวิชา (Hard Skills)',
        en: 'Section 2: Specialized Professional Competencies'
      },
      category: 'special',
      questions: [
        {
          id: 'technical-knowledge',
          label: {
            th: 'ความรู้ความสามารถทางวิชาการและทักษะเทคนิคในสายงาน',
            en: 'Technical and Academic Knowledge in the Field'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 2
        },
        {
          id: 'problem-solving',
          label: {
            th: 'การคิดวิเคราะห์ การแก้ปัญหา และการประยุกต์ใช้งานจริง',
            en: 'Analytical Thinking, Problem Solving & Practical Application'
          },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5,
          weight: 2
        }
      ]
    },
    {
      id: 'feedback-section',
      title: {
        th: 'หมวด 3: ข้อเสนอแนะและความคิดเห็นเพิ่มเติม',
        en: 'Section 3: Feedback & Remarks'
      },
      category: 'general',
      questions: [
        {
          id: 'strengths',
          label: {
            th: 'จุดเด่นและข้อดีของนักศึกษา',
            en: 'Student Strengths and Commendable Points'
          },
          type: 'text',
          required: false
        },
        {
          id: 'areas-for-improvement',
          label: {
            th: 'จุดที่ควรพัฒนาและข้อเสนอแนะสำหรับการทำงานในอนาคต',
            en: 'Areas for Improvement & Recommendations'
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

  // 7. Evaluation Cycle
  const cycleId = await upsertId(
    database,
    'evaluationCycles',
    { code: 'DEV-CYCLE-2026' },
    {
      code: 'DEV-CYCLE-2026',
      name: {
        th: 'รอบการประเมินการฝึกงาน ภาคการศึกษาที่ 1/2569',
        en: 'Internship Evaluation Cycle 1/2026'
      },
      competencySetVersionId: versionId,
      academicTermId: termId,
      opensAt: past,
      closesAt: future,
      status: 'active',
      createdAt: now,
      updatedAt: now
    }
  )

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
        personalEmail: stu.personalEmail,
        schoolId: sId,
        programId: pId,
        courseId: cId,
        academicTermId: termId,
        semester: '1',
        company: organizationsData.find((o) => o.code === stu.org)?.name.th,
        province: organizationsData.find((o) => o.code === stu.org)?.province,
        admissionYear: 2565,
        status: 'active',
        evaluationStatus:
          stu.status === 'submitted'
            ? 'submitted'
            : stu.status === 'inProgress'
              ? 'awaiting_response'
              : 'awaiting_evaluator',
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

    // 16-character PIN formatted as 2026-XXXX-XXXX-XXXX
    const rawPin =
      `2026${stu.studentId.slice(0, 8)}${stu.studentId.slice(8).padStart(4, '0')}`.slice(
        0,
        16
      )

    // Only create evaluationAssignments if the student has been sent an evaluation (inProgress or submitted)
    // Students with 'pending' represent "รอระบุผู้ประเมิน" (ยังไม่มีผู้ประเมิน / ยังไม่ถูกส่งประเมิน)
    if (stu.status !== 'pending') {
      await upsertId(
        database,
        'evaluationAssignments',
        { cycleId, placementId, evaluatorId: evId },
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
          accessPin: rawPin,
          createdAt: now,
          updatedAt: now
        }
      )
    } else {
      await database
        .collection('evaluationAssignments')
        .deleteMany({ placementId })
    }
  }

  // 9. Document Template & Generated Document
  const docTemplateId = await upsertId(
    database,
    'documentTemplates',
    { code: 'CERT-MFU-2026' },
    {
      code: 'CERT-MFU-2026',
      name: 'หนังสือรับรองและทรานสคริปต์การฝึกงาน (MFU Internship Transcript)',
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
      canonicalJson: {
        docType: 'certificate',
        title: 'Internship Transcript',
        elements: []
      },
      placeholders: [
        'student_name',
        'school_name',
        'program_name',
        'organization_name',
        'evaluation_score'
      ],
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
      canonicalJson: {
        docType: 'official_letter',
        title: 'หนังสือส่งตัวนักศึกษาฝึกงาน',
        elements: []
      },
      placeholders: [
        'student_name',
        'school_name',
        'organization_name',
        'training_period'
      ],
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
    },
    {
      requestId: 'req_seed_3',
      actorId: 'dev:admin@localhost',
      actorEmail: 'admin@localhost',
      action: 'PUBLISH_EVALUATION_CYCLE',
      route: '/api/v2/evaluation-cycles',
      method: 'POST',
      outcome: 'success',
      metadata: { code: 'DEV-CYCLE-2026' },
      createdAt: now
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
  document: Readonly<Record<string, unknown>>
): Promise<string> {
  const result = await database
    .collection(collection)
    .findOneAndUpdate(
      filter,
      { $set: document, $setOnInsert: { _id: new ObjectId() } },
      { upsert: true, returnDocument: 'after' }
    )
  if (!result) throw new Error(`Failed to seed ${collection}.`)
  return result._id.toString()
}
