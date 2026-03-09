const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings'

export async function getEmbedding(text: string): Promise<number[]> {
  const res = await fetchWithRetry(VOYAGE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'voyage-4-lite',
      input: text,
      input_type: 'document',
    }),
  })

  const data = await res.json()
  return data.data[0].embedding
}

export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const res = await fetchWithRetry(VOYAGE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'voyage-4-lite',
      input: texts,
      input_type: 'document',
    }),
  })

  const data = await res.json()
  return data.data.map((d: { embedding: number[] }) => d.embedding)
}

export async function getQueryEmbedding(text: string): Promise<number[]> {
  const res = await fetchWithRetry(VOYAGE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'voyage-4-lite',
      input: text,
      input_type: 'query',
    }),
  })

  const data = await res.json()
  return data.data[0].embedding
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 3,
  delay = 1000
): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, options)
    if (res.ok) return res
    if (res.status === 429 && i < retries - 1) {
      await new Promise(r => setTimeout(r, delay * (i + 1)))
      continue
    }
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Voyage API error ${res.status}: ${body}`)
    }
  }
  throw new Error('Voyage API: max retries exceeded')
}
