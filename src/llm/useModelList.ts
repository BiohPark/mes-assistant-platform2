import { useCallback, useEffect, useState } from 'react'
import { createProvider } from './index'
import type { LlmSettings } from '@/domain/types'

interface ModelListState {
  models: string[]
  loading: boolean
  reload: () => Promise<void>
}

/** 현재 LLM 설정 기준 사용 가능한 모델 목록. Live는 {baseUrl}/models, Mock은 예시 목록 */
export function useModelList(llm: LlmSettings | undefined, auto = true): ModelListState {
  const [models, setModels] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const key = llm ? `${llm.mode}|${llm.baseUrl}|${llm.apiKey}` : ''

  const reload = useCallback(async () => {
    if (!llm) return
    setLoading(true)
    try {
      setModels(await createProvider(llm).listModels())
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => {
    if (auto) void reload()
  }, [auto, reload])

  return { models, loading, reload }
}
