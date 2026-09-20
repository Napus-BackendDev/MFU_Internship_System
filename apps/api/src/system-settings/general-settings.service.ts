import {
  BadRequestException,
  Injectable,
  NotFoundException,
  type OnModuleInit
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import type { Model, QueryFilter } from 'mongoose'

import { boundedSearch } from '../common/search.js'

import {
  GeneralConfigRecord,
  ProvinceRecord
} from './general-settings.schema.js'

export const THAI_PROVINCES_SEED = [
  // ภาคเหนือ (Northern - 9)
  {
    code: 'TH-50',
    nameTh: 'เชียงใหม่',
    nameEn: 'Chiang Mai',
    region: 'ภาคเหนือ'
  },
  {
    code: 'TH-57',
    nameTh: 'เชียงราย',
    nameEn: 'Chiang Rai',
    region: 'ภาคเหนือ'
  },
  { code: 'TH-55', nameTh: 'น่าน', nameEn: 'Nan', region: 'ภาคเหนือ' },
  { code: 'TH-56', nameTh: 'พะเยา', nameEn: 'Phayao', region: 'ภาคเหนือ' },
  { code: 'TH-54', nameTh: 'แพร่', nameEn: 'Phrae', region: 'ภาคเหนือ' },
  {
    code: 'TH-58',
    nameTh: 'แม่ฮ่องสอน',
    nameEn: 'Mae Hong Son',
    region: 'ภาคเหนือ'
  },
  { code: 'TH-52', nameTh: 'ลำปาง', nameEn: 'Lampang', region: 'ภาคเหนือ' },
  { code: 'TH-51', nameTh: 'ลำพูน', nameEn: 'Lamphun', region: 'ภาคเหนือ' },
  {
    code: 'TH-53',
    nameTh: 'อุตรดิตถ์',
    nameEn: 'Uttaradit',
    region: 'ภาคเหนือ'
  },

  // ภาคกลาง (Central - 22)
  {
    code: 'TH-10',
    nameTh: 'กรุงเทพมหานคร',
    nameEn: 'Bangkok',
    region: 'ภาคกลาง'
  },
  {
    code: 'TH-62',
    nameTh: 'กำแพงเพชร',
    nameEn: 'Kamphaeng Phet',
    region: 'ภาคกลาง'
  },
  { code: 'TH-18', nameTh: 'ชัยนาท', nameEn: 'Chai Nat', region: 'ภาคกลาง' },
  {
    code: 'TH-26',
    nameTh: 'นครนายก',
    nameEn: 'Nakhon Nayok',
    region: 'ภาคกลาง'
  },
  {
    code: 'TH-73',
    nameTh: 'นครปฐม',
    nameEn: 'Nakhon Pathom',
    region: 'ภาคกลาง'
  },
  {
    code: 'TH-60',
    nameTh: 'นครสวรรค์',
    nameEn: 'Nakhon Sawan',
    region: 'ภาคกลาง'
  },
  { code: 'TH-12', nameTh: 'นนทบุรี', nameEn: 'Nonthaburi', region: 'ภาคกลาง' },
  {
    code: 'TH-13',
    nameTh: 'ปทุมธานี',
    nameEn: 'Pathum Thani',
    region: 'ภาคกลาง'
  },
  {
    code: 'TH-14',
    nameTh: 'พระนครศรีอยุธยา',
    nameEn: 'Phra Nakhon Si Ayutthaya',
    region: 'ภาคกลาง'
  },
  { code: 'TH-66', nameTh: 'พิจิตร', nameEn: 'Phichit', region: 'ภาคกลาง' },
  {
    code: 'TH-65',
    nameTh: 'พิษณุโลก',
    nameEn: 'Phitsanulok',
    region: 'ภาคกลาง'
  },
  {
    code: 'TH-67',
    nameTh: 'เพชรบูรณ์',
    nameEn: 'Phetchabun',
    region: 'ภาคกลาง'
  },
  { code: 'TH-16', nameTh: 'ลพบุรี', nameEn: 'Lop Buri', region: 'ภาคกลาง' },
  {
    code: 'TH-11',
    nameTh: 'สมุทรปราการ',
    nameEn: 'Samut Prakan',
    region: 'ภาคกลาง'
  },
  {
    code: 'TH-75',
    nameTh: 'สมุทรสงคราม',
    nameEn: 'Samut Songkhram',
    region: 'ภาคกลาง'
  },
  {
    code: 'TH-74',
    nameTh: 'สมุทรสาคร',
    nameEn: 'Samut Sakhon',
    region: 'ภาคกลาง'
  },
  { code: 'TH-19', nameTh: 'สระบุรี', nameEn: 'Saraburi', region: 'ภาคกลาง' },
  {
    code: 'TH-17',
    nameTh: 'สิงห์บุรี',
    nameEn: 'Sing Buri',
    region: 'ภาคกลาง'
  },
  { code: 'TH-64', nameTh: 'สุโขทัย', nameEn: 'Sukhothai', region: 'ภาคกลาง' },
  {
    code: 'TH-72',
    nameTh: 'สุพรรณบุรี',
    nameEn: 'Suphan Buri',
    region: 'ภาคกลาง'
  },
  { code: 'TH-15', nameTh: 'อ่างทอง', nameEn: 'Ang Thong', region: 'ภาคกลาง' },
  {
    code: 'TH-61',
    nameTh: 'อุทัยธานี',
    nameEn: 'Uthai Thani',
    region: 'ภาคกลาง'
  },

  // ภาคตะวันออกเฉียงเหนือ (Northeastern - 20)
  {
    code: 'TH-46',
    nameTh: 'กาฬสินธุ์',
    nameEn: 'Kalasin',
    region: 'ภาคตะวันออกเฉียงเหนือ'
  },
  {
    code: 'TH-40',
    nameTh: 'ขอนแก่น',
    nameEn: 'Khon Kaen',
    region: 'ภาคตะวันออกเฉียงเหนือ'
  },
  {
    code: 'TH-36',
    nameTh: 'ชัยภูมิ',
    nameEn: 'Chaiyaphum',
    region: 'ภาคตะวันออกเฉียงเหนือ'
  },
  {
    code: 'TH-48',
    nameTh: 'นครพนม',
    nameEn: 'Nakhon Phanom',
    region: 'ภาคตะวันออกเฉียงเหนือ'
  },
  {
    code: 'TH-30',
    nameTh: 'นครราชสีมา',
    nameEn: 'Nakhon Ratchasima',
    region: 'ภาคตะวันออกเฉียงเหนือ'
  },
  {
    code: 'TH-38',
    nameTh: 'บึงกาฬ',
    nameEn: 'Bueng Kan',
    region: 'ภาคตะวันออกเฉียงเหนือ'
  },
  {
    code: 'TH-31',
    nameTh: 'บุรีรัมย์',
    nameEn: 'Buri Ram',
    region: 'ภาคตะวันออกเฉียงเหนือ'
  },
  {
    code: 'TH-44',
    nameTh: 'มหาสารคาม',
    nameEn: 'Maha Sarakham',
    region: 'ภาคตะวันออกเฉียงเหนือ'
  },
  {
    code: 'TH-49',
    nameTh: 'มุกดาหาร',
    nameEn: 'Mukdahan',
    region: 'ภาคตะวันออกเฉียงเหนือ'
  },
  {
    code: 'TH-35',
    nameTh: 'ยโสธร',
    nameEn: 'Yasothon',
    region: 'ภาคตะวันออกเฉียงเหนือ'
  },
  {
    code: 'TH-45',
    nameTh: 'ร้อยเอ็ด',
    nameEn: 'Roi Et',
    region: 'ภาคตะวันออกเฉียงเหนือ'
  },
  {
    code: 'TH-42',
    nameTh: 'เลย',
    nameEn: 'Loei',
    region: 'ภาคตะวันออกเฉียงเหนือ'
  },
  {
    code: 'TH-33',
    nameTh: 'ศรีสะเกษ',
    nameEn: 'Si Sa Ket',
    region: 'ภาคตะวันออกเฉียงเหนือ'
  },
  {
    code: 'TH-47',
    nameTh: 'สกลนคร',
    nameEn: 'Sakon Nakhon',
    region: 'ภาคตะวันออกเฉียงเหนือ'
  },
  {
    code: 'TH-32',
    nameTh: 'สุรินทร์',
    nameEn: 'Surin',
    region: 'ภาคตะวันออกเฉียงเหนือ'
  },
  {
    code: 'TH-43',
    nameTh: 'หนองคาย',
    nameEn: 'Nong Khai',
    region: 'ภาคตะวันออกเฉียงเหนือ'
  },
  {
    code: 'TH-39',
    nameTh: 'หนองบัวลำภู',
    nameEn: 'Nong Bua Lam Phu',
    region: 'ภาคตะวันออกเฉียงเหนือ'
  },
  {
    code: 'TH-37',
    nameTh: 'อำนาจเจริญ',
    nameEn: 'Amnat Charoen',
    region: 'ภาคตะวันออกเฉียงเหนือ'
  },
  {
    code: 'TH-41',
    nameTh: 'อุดรธานี',
    nameEn: 'Udon Thani',
    region: 'ภาคตะวันออกเฉียงเหนือ'
  },
  {
    code: 'TH-34',
    nameTh: 'อุบลราชธานี',
    nameEn: 'Ubon Ratchathani',
    region: 'ภาคตะวันออกเฉียงเหนือ'
  },

  // ภาคใต้ (Southern - 14)
  { code: 'TH-81', nameTh: 'กระบี่', nameEn: 'Krabi', region: 'ภาคใต้' },
  { code: 'TH-86', nameTh: 'ชุมพร', nameEn: 'Chumphon', region: 'ภาคใต้' },
  { code: 'TH-92', nameTh: 'ตรัง', nameEn: 'Trang', region: 'ภาคใต้' },
  {
    code: 'TH-80',
    nameTh: 'นครศรีธรรมราช',
    nameEn: 'Nakhon Si Thammarat',
    region: 'ภาคใต้'
  },
  { code: 'TH-96', nameTh: 'นราธิวาส', nameEn: 'Narathiwat', region: 'ภาคใต้' },
  { code: 'TH-94', nameTh: 'ปัตตานี', nameEn: 'Pattani', region: 'ภาคใต้' },
  { code: 'TH-82', nameTh: 'พังงา', nameEn: 'Phang-nga', region: 'ภาคใต้' },
  { code: 'TH-93', nameTh: 'พัทลุง', nameEn: 'Phatthalung', region: 'ภาคใต้' },
  { code: 'TH-83', nameTh: 'ภูเก็ต', nameEn: 'Phuket', region: 'ภาคใต้' },
  { code: 'TH-95', nameTh: 'ยะลา', nameEn: 'Yala', region: 'ภาคใต้' },
  { code: 'TH-85', nameTh: 'ระนอง', nameEn: 'Ranong', region: 'ภาคใต้' },
  { code: 'TH-90', nameTh: 'สงขลา', nameEn: 'Songkhla', region: 'ภาคใต้' },
  { code: 'TH-91', nameTh: 'สตูล', nameEn: 'Satun', region: 'ภาคใต้' },
  {
    code: 'TH-84',
    nameTh: 'สุราษฎร์ธานี',
    nameEn: 'Surat Thani',
    region: 'ภาคใต้'
  },

  // ภาคตะวันออก (Eastern - 7)
  {
    code: 'TH-22',
    nameTh: 'จันทบุรี',
    nameEn: 'Chanthaburi',
    region: 'ภาคตะวันออก'
  },
  {
    code: 'TH-24',
    nameTh: 'ฉะเชิงเทรา',
    nameEn: 'Chachoengsao',
    region: 'ภาคตะวันออก'
  },
  {
    code: 'TH-20',
    nameTh: 'ชลบุรี',
    nameEn: 'Chon Buri',
    region: 'ภาคตะวันออก'
  },
  { code: 'TH-23', nameTh: 'ตราด', nameEn: 'Trat', region: 'ภาคตะวันออก' },
  {
    code: 'TH-25',
    nameTh: 'ปราจีนบุรี',
    nameEn: 'Prachin Buri',
    region: 'ภาคตะวันออก'
  },
  { code: 'TH-21', nameTh: 'ระยอง', nameEn: 'Rayong', region: 'ภาคตะวันออก' },
  {
    code: 'TH-27',
    nameTh: 'สระแก้ว',
    nameEn: 'Sa Kaeo',
    region: 'ภาคตะวันออก'
  },

  // ภาคตะวันตก (Western - 5)
  {
    code: 'TH-71',
    nameTh: 'กาญจนบุรี',
    nameEn: 'Kanchanaburi',
    region: 'ภาคตะวันตก'
  },
  { code: 'TH-63', nameTh: 'ตาก', nameEn: 'Tak', region: 'ภาคตะวันตก' },
  {
    code: 'TH-77',
    nameTh: 'ประจวบคีรีขันธ์',
    nameEn: 'Prachuap Khiri Khan',
    region: 'ภาคตะวันตก'
  },
  {
    code: 'TH-76',
    nameTh: 'เพชรบุรี',
    nameEn: 'Phetchaburi',
    region: 'ภาคตะวันตก'
  },
  {
    code: 'TH-70',
    nameTh: 'ราชบุรี',
    nameEn: 'Ratchaburi',
    region: 'ภาคตะวันตก'
  }
]

@Injectable()
export class GeneralSettingsService implements OnModuleInit {
  public constructor(
    @InjectModel(ProvinceRecord.name)
    private readonly provinceModel: Model<ProvinceRecord>,
    @InjectModel(GeneralConfigRecord.name)
    private readonly configModel: Model<GeneralConfigRecord>
  ) {}

  public async onModuleInit(): Promise<void> {
    await this.ensureSeedData()
  }

  public async ensureSeedData(): Promise<void> {
    const provinceCount = await this.provinceModel.countDocuments().exec()
    if (provinceCount === 0) {
      await this.resetProvinces()
    }

    const config = await this.configModel.findOne({ key: 'general' }).exec()
    if (!config) {
      await this.configModel.create({ key: 'general' })
    }
  }

  public async listProvinces(input: {
    readonly search?: string
    readonly region?: string
    readonly status?: string
  }): Promise<{
    items: ProvinceRecord[]
    total: number
    stats: { total: number; active: number; inactive: number }
  }> {
    const filter: QueryFilter<ProvinceRecord> = {}

    if (input.region && input.region !== 'all') {
      filter.region = input.region
    }

    if (input.status && input.status !== 'all') {
      filter.status = input.status as 'active' | 'inactive'
    }

    if (input.search) {
      const search = boundedSearch(input.search)
      filter.$or = [
        { nameTh: { $regex: search, $options: 'i' } },
        { nameEn: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } }
      ]
    }

    const [items, totalAll, activeTotal, inactiveTotal] = await Promise.all([
      this.provinceModel.find(filter).sort({ region: 1, nameTh: 1 }).exec(),
      this.provinceModel.countDocuments().exec(),
      this.provinceModel.countDocuments({ status: 'active' }).exec(),
      this.provinceModel.countDocuments({ status: 'inactive' }).exec()
    ])

    return {
      items,
      total: items.length,
      stats: {
        total: totalAll,
        active: activeTotal,
        inactive: inactiveTotal
      }
    }
  }

  public async createProvince(input: {
    readonly code: string
    readonly nameTh: string
    readonly nameEn: string
    readonly region: string
    readonly status?: 'active' | 'inactive'
  }): Promise<ProvinceRecord> {
    const existing = await this.provinceModel
      .findOne({ code: input.code })
      .exec()
    if (existing) {
      throw new BadRequestException(
        `รหัสจังหวัด ${input.code} มีอยู่ในระบบแล้ว`
      )
    }

    return this.provinceModel.create({
      code: input.code.trim().toUpperCase(),
      nameTh: input.nameTh.trim(),
      nameEn: input.nameEn.trim(),
      region: input.region.trim(),
      status: input.status || 'active',
      isCustom: true
    })
  }

  public async updateProvince(
    id: string,
    input: Partial<{
      readonly code: string
      readonly nameTh: string
      readonly nameEn: string
      readonly region: string
      readonly status: 'active' | 'inactive'
    }>
  ): Promise<ProvinceRecord> {
    const province = await this.provinceModel.findById(id).exec()
    if (!province) {
      throw new NotFoundException(`ไม่พบข้อมูลจังหวัดรหัส ${id}`)
    }

    if (input.code && input.code !== province.code) {
      const existing = await this.provinceModel
        .findOne({ code: input.code })
        .exec()
      if (existing) {
        throw new BadRequestException(
          `รหัสจังหวัด ${input.code} มีอยู่ในระบบแล้ว`
        )
      }
      province.code = input.code.trim().toUpperCase()
    }

    if (input.nameTh) province.nameTh = input.nameTh.trim()
    if (input.nameEn) province.nameEn = input.nameEn.trim()
    if (input.region) province.region = input.region.trim()
    if (input.status) province.status = input.status

    return province.save()
  }

  public async deleteProvince(id: string): Promise<{ success: boolean }> {
    const province = await this.provinceModel.findById(id).exec()
    if (!province) {
      throw new NotFoundException(`ไม่พบข้อมูลจังหวัดรหัส ${id}`)
    }

    await this.provinceModel.findByIdAndDelete(id).exec()
    return { success: true }
  }

  public async resetProvinces(): Promise<{ count: number }> {
    await this.provinceModel.deleteMany({}).exec()
    const docs = THAI_PROVINCES_SEED.map((p) => ({
      ...p,
      status: 'active' as const,
      isCustom: false
    }))
    await this.provinceModel.insertMany(docs)
    return { count: docs.length }
  }

  public async getGeneralConfig(): Promise<GeneralConfigRecord> {
    let config = await this.configModel.findOne({ key: 'general' }).exec()
    if (!config) {
      config = await this.configModel.create({ key: 'general' })
    }
    return config
  }

  public async updateGeneralConfig(
    input: Partial<Omit<GeneralConfigRecord, 'key'>>
  ): Promise<GeneralConfigRecord> {
    let config = await this.configModel.findOne({ key: 'general' }).exec()
    if (!config) {
      config = new this.configModel({ key: 'general' })
    }

    Object.assign(config, input)
    return config.save()
  }
}
