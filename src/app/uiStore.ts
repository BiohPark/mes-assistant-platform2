import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ID, StepKey, TaskStatus } from '@/domain/types'

export type BoardView = 'list' | 'workflow'

export interface BoardFilters {
  stepKey?: StepKey | 'DONE'
  search: string
  assigneeId?: ID
  templateId?: ID
  status?: TaskStatus
}

interface UiState {
  boardView: BoardView
  boardFilters: BoardFilters
  assistantOpen: boolean
  setBoardView: (v: BoardView) => void
  setBoardFilters: (patch: Partial<BoardFilters>) => void
  toggleStepFilter: (key: StepKey | 'DONE') => void
  resetBoardFilters: () => void
  setAssistantOpen: (open: boolean) => void
}

const EMPTY_FILTERS: BoardFilters = { search: '' }

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      boardView: 'workflow',
      boardFilters: EMPTY_FILTERS,
      assistantOpen: false,
      setBoardView: (boardView) => set({ boardView }),
      setBoardFilters: (patch) => set((s) => ({ boardFilters: { ...s.boardFilters, ...patch } })),
      toggleStepFilter: (key) =>
        set((s) => ({ boardFilters: { ...s.boardFilters, stepKey: s.boardFilters.stepKey === key ? undefined : key } })),
      resetBoardFilters: () => set({ boardFilters: EMPTY_FILTERS }),
      setAssistantOpen: (assistantOpen) => set({ assistantOpen }),
    }),
    { name: 'mes-ui', partialize: (s) => ({ boardView: s.boardView, boardFilters: s.boardFilters }) },
  ),
)
