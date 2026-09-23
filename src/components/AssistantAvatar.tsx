import { useEffect, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import { cn } from '@/lib/utils'
import { initialsOf } from '@/lib/colors'
import type { Assistant } from '@/domain/types'

const SIZE = {
  xs: 'size-6 text-[10px] rounded-md',
  sm: 'size-8 text-xs rounded-lg',
  md: 'size-12 text-base rounded-xl',
  lg: 'size-20 text-xl rounded-2xl',
  xl: 'aspect-square w-full text-4xl rounded-2xl',
} as const

interface AssistantAvatarProps {
  assistant: Pick<Assistant, 'name' | 'color' | 'imageId'>
  size?: keyof typeof SIZE
  className?: string
}

/** 어시스턴트 이미지가 있으면 이미지, 없으면 색 배경 위 이니셜 */
export function AssistantAvatar({ assistant, size = 'md', className }: AssistantAvatarProps) {
  const file = useLiveQuery(() => (assistant.imageId ? db.files.get(assistant.imageId) : undefined), [assistant.imageId])
  // objectURL은 blob이 바뀔 때만 새로 만들고, 교체/언마운트 시 해제한다
  const url = useMemo(() => (file ? URL.createObjectURL(file.blob) : undefined), [file])
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url)
  }, [url])

  if (url) return <img src={url} alt={assistant.name} className={cn('shrink-0 object-cover', SIZE[size], className)} />
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center font-semibold text-white', SIZE[size], className)}
      style={{ backgroundColor: assistant.color }}
    >
      {initialsOf(assistant.name)}
    </span>
  )
}
