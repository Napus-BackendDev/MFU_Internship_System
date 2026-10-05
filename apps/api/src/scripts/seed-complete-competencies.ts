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

  // 1. Fetch all schools to map schoolCode -> schoolId
  const schools = await database.collection('schools').find().toArray()
  const schoolMap = new Map<string, string>()
  for (const s of schools) {
    schoolMap.set(s.schoolCode, s._id.toString())
  }

  console.log(`Found ${schoolMap.size} schools in database:`, Array.from(schoolMap.keys()).join(', '))

  // 2. Ensure DEV-COMP competency set exists
  const existingSet = await database.collection('competencySets').findOne({ code: 'DEV-COMP' })
  let competencySetId: string
  if (existingSet) {
    competencySetId = existingSet._id.toString()
  } else {
    const res = await database.collection('competencySets').insertOne({
      code: 'DEV-COMP',
      name: {
        th: 'แบบประเมินสมรรถนะการฝึกงานมาตรฐาน มฟล.',
        en: 'MFU Standard Internship Competency Evaluation'
      },
      status: 'active',
      createdAt: now,
      updatedAt: now
    })
    competencySetId = res.insertedId.toString()
  }

  // 3. Define the 16 standard sections:
  // - 1 General core section (Soft skills)
  // - 14 School specialized sections (Hard skills for each school)
  // - 1 Suggestion section (Feedback & recommendations)

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

  // Update existing version 1 (or insert if not exists)
  const existingVersion = await database.collection('competencySetVersions').findOne({
    competencySetId,
    versionNumber: 1
  })

  if (existingVersion) {
    await database.collection('competencySetVersions').updateOne(
      { _id: existingVersion._id },
      {
        $set: {
          sections,
          status: 'published',
          publishedAt: existingVersion.publishedAt || now,
          publishedBy: existingVersion.publishedBy || 'seed-complete-competencies',
          updatedAt: now
        }
      }
    )
    console.log(`Updated competencySetVersion ${existingVersion._id.toString()} with ${sections.length} sections.`)
  } else {
    const res = await database.collection('competencySetVersions').insertOne({
      competencySetId,
      versionNumber: 1,
      status: 'published',
      sections,
      publishedAt: now,
      publishedBy: 'seed-complete-competencies',
      createdAt: now,
      updatedAt: now
    })
    console.log(`Created new competencySetVersion ${res.insertedId.toString()} with ${sections.length} sections.`)
  }

  console.log('Successfully seeded all 14 school competencies + general + suggestion sections!')
} finally {
  await client.close()
}
