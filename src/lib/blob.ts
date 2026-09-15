/** Blob 읽기 헬퍼. jsdom 등 Blob.arrayBuffer 미지원 환경은 FileReader로 대체한다. */
export function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(blob)
  })
}

export async function blobToText(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function') return blob.text()
  const buf = await blobToArrayBuffer(blob)
  return new TextDecoder().decode(buf)
}
