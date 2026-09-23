import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import { tagSuggestions, type TagSuggestion } from '@/domain/tags'

/** TagInput 자동완성: 전체 대화 태그(빈도순) + 접수된 SR 코드 */
export function useTagSuggest(): (prefix: string, exclude: string[]) => TagSuggestion[] {
  const data = useLiveQuery(async () => {
    const [tasks, srs] = await Promise.all([db.tasks.toArray(), db.serviceRequests.toArray()])
    return { tasks, srCodes: srs.map((s) => s.code).filter(Boolean) }
  }, [])
  return (prefix, exclude) => (data ? tagSuggestions(data.tasks, data.srCodes, prefix, exclude) : [])
}
