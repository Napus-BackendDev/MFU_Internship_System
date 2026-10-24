import type { Ref } from 'vue'

export interface ReferenceSchool {
  readonly id: string
  readonly schoolCode: string
  readonly name: { readonly th: string; readonly en: string }
  readonly status?: string
}

export interface ReferenceProgram {
  readonly id: string
  readonly schoolId: string
  readonly programCode: string
  readonly name: { readonly th: string; readonly en: string }
  readonly status?: string
}

export interface ReferenceCourse {
  readonly id: string
  readonly courseCode: string
  readonly name: { readonly th: string; readonly en: string }
  readonly credits?: number
  readonly status?: string
}

export interface ReferenceTerm {
  readonly id: string
  readonly academicYear: number
  readonly semester: string
  readonly status: 'active' | 'archived'
}

export interface ReferenceProvince {
  readonly id: string
  readonly code?: string
  readonly nameTh: string
  readonly nameEn: string
  readonly region?: string
  readonly status?: string
}

export interface ReferenceCompetencySet {
  readonly id: string
  readonly code: string
  readonly name: { readonly th: string; readonly en: string }
  readonly status: 'active' | 'archived'
}

export interface ReferenceCacheState {
  schools: ReferenceSchool[] | null
  programs: ReferenceProgram[] | null
  courses: ReferenceCourse[] | null
  terms: ReferenceTerm[] | null
  provinces: ReferenceProvince[] | null
  competencySets: ReferenceCompetencySet[] | null
}

export interface UseReferenceDataReturn {
  cache: Ref<ReferenceCacheState>
  getSchools: (forceRefresh?: boolean) => Promise<ReferenceSchool[]>
  getPrograms: (schoolId?: string, forceRefresh?: boolean) => Promise<ReferenceProgram[]>
  getCourses: (forceRefresh?: boolean) => Promise<ReferenceCourse[]>
  getTerms: (forceRefresh?: boolean) => Promise<ReferenceTerm[]>
  getProvinces: (forceRefresh?: boolean) => Promise<ReferenceProvince[]>
  getCompetencySets: (forceRefresh?: boolean) => Promise<ReferenceCompetencySet[]>
  invalidateReferenceData: (
    type?:
      | 'schools'
      | 'programs'
      | 'courses'
      | 'terms'
      | 'provinces'
      | 'competencySets'
      | 'all'
  ) => void
}

const inFlight = new Map<string, Promise<unknown>>()

export function useReferenceData(): UseReferenceDataReturn {
  const api = useApi()

  const cache = useState<ReferenceCacheState>('app-reference-data-cache', () => ({
    schools: null,
    programs: null,
    courses: null,
    terms: null,
    provinces: null,
    competencySets: null
  }))

  async function deduplicatedFetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    if (inFlight.has(key)) {
      return inFlight.get(key) as Promise<T>
    }
    const promise = fetcher().finally(() => {
      inFlight.delete(key)
    })
    inFlight.set(key, promise)
    return promise
  }

  async function getSchools(forceRefresh = false): Promise<ReferenceSchool[]> {
    if (!forceRefresh && cache.value.schools) {
      return cache.value.schools
    }
    return deduplicatedFetch('schools', async () => {
      try {
        const res = await api<{ items: ReferenceSchool[] }>('/academic/schools', {
          query: { page: 1, pageSize: 200, archived: false }
        })
        const items = res.items || []
        cache.value.schools = items
        return items
      } catch (err) {
        if (cache.value.schools) return cache.value.schools
        throw err
      }
    })
  }

  async function getPrograms(
    schoolId?: string,
    forceRefresh = false
  ): Promise<ReferenceProgram[]> {
    if (!forceRefresh && cache.value.programs) {
      if (schoolId && schoolId !== 'all') {
        return cache.value.programs.filter((p) => p.schoolId === schoolId)
      }
      return cache.value.programs
    }
    const allPrograms = await deduplicatedFetch('programs', async () => {
      try {
        const res = await api<{ items: ReferenceProgram[] }>('/academic/programs', {
          query: { page: 1, pageSize: 500, archived: false }
        })
        const items = res.items || []
        cache.value.programs = items
        return items
      } catch (err) {
        if (cache.value.programs) return cache.value.programs
        throw err
      }
    })
    if (schoolId && schoolId !== 'all') {
      return allPrograms.filter((p) => p.schoolId === schoolId)
    }
    return allPrograms
  }

  async function getCourses(forceRefresh = false): Promise<ReferenceCourse[]> {
    if (!forceRefresh && cache.value.courses) {
      return cache.value.courses
    }
    return deduplicatedFetch('courses', async () => {
      try {
        const res = await api<{ items: ReferenceCourse[] }>('/academic/courses', {
          query: { page: 1, pageSize: 500, archived: false }
        })
        const items = res.items || []
        cache.value.courses = items
        return items
      } catch (err) {
        if (cache.value.courses) return cache.value.courses
        throw err
      }
    })
  }

  async function getTerms(forceRefresh = false): Promise<ReferenceTerm[]> {
    if (!forceRefresh && cache.value.terms) {
      return cache.value.terms
    }
    return deduplicatedFetch('terms', async () => {
      try {
        const res = await api<{ items: ReferenceTerm[] }>('/academic/terms', {
          query: { page: 1, pageSize: 200, archived: false }
        })
        const items = res.items || []
        cache.value.terms = items
        return items
      } catch (err) {
        if (cache.value.terms) return cache.value.terms
        throw err
      }
    })
  }

  async function getProvinces(forceRefresh = false): Promise<ReferenceProvince[]> {
    if (!forceRefresh && cache.value.provinces) {
      return cache.value.provinces
    }
    return deduplicatedFetch('provinces', async () => {
      try {
        const res = await api<{ items: ReferenceProvince[] }>('/system-settings/provinces', {
          query: { status: 'active' }
        })
        const items = res.items || []
        cache.value.provinces = items
        return items
      } catch (err) {
        if (cache.value.provinces) return cache.value.provinces
        throw err
      }
    })
  }

  async function getCompetencySets(
    forceRefresh = false
  ): Promise<ReferenceCompetencySet[]> {
    if (!forceRefresh && cache.value.competencySets) {
      return cache.value.competencySets
    }
    return deduplicatedFetch('competencySets', async () => {
      try {
        const res = await api<{ items: ReferenceCompetencySet[] }>(
          '/competency-sets',
          {
            query: { page: 1, pageSize: 200 }
          }
        )
        const items = res.items || []
        cache.value.competencySets = items
        return items
      } catch (err) {
        if (cache.value.competencySets) return cache.value.competencySets
        throw err
      }
    })
  }

  function invalidateReferenceData(
    type?:
      | 'schools'
      | 'programs'
      | 'courses'
      | 'terms'
      | 'provinces'
      | 'competencySets'
      | 'all'
  ): void {
    if (!type || type === 'all') {
      cache.value.schools = null
      cache.value.programs = null
      cache.value.courses = null
      cache.value.terms = null
      cache.value.provinces = null
      cache.value.competencySets = null
    } else {
      cache.value[type] = null
    }
  }

  return {
    cache,
    getSchools,
    getPrograms,
    getCourses,
    getTerms,
    getProvinces,
    getCompetencySets,
    invalidateReferenceData
  }
}
