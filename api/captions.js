/**
 * Caption Library API — Vercel serverless compatible.
 * Reads/writes to Vercel Blob. Seeds from git-tracked data/captions.json on first run.
 */
import { put, get, del } from '@vercel/blob'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CAPTIONS_KEY = 'data/captions.json'
const LOCAL_FILE = path.join(__dirname, '..', 'data', 'captions.json')

export const config = { runtime: 'nodejs' }

async function readCaptions() {
  // Try Blob first
  try {
    const blob = await get(CAPTIONS_KEY)
    if (blob) {
      const text = await blob.text()
      const data = JSON.parse(text)
      if (data.length > 0) return data // Blob has data
    }
  } catch {}

  // Blob empty or error — seed from local JSON file (committed to git)
  try {
    if (fs.existsSync(LOCAL_FILE)) {
      const text = fs.readFileSync(LOCAL_FILE, 'utf-8')
      const data = JSON.parse(text)
      if (data.length > 0) {
        // Write to Blob so subsequent reads use Blob
        await writeCaptions(data)
        return data
      }
    }
  } catch {}

  return []
}

async function writeCaptions(data) {
  await put(CAPTIONS_KEY, JSON.stringify(data, null, 2), {
    access: 'public',
    contentType: 'application/json',
  })
}

// ─── GET /api/captions — list all ───────────────────────────
export async function GET(request) {
  const url = new URL(request.url)
  const isRandom = url.searchParams.has('random')

  const captions = await readCaptions()

  if (isRandom) {
    const n = Math.min(parseInt(url.searchParams.get('n')) || 1, captions.length)
    if (captions.length === 0) return Response.json([])
    const shuffled = [...captions].sort(() => Math.random() - 0.5)
    return Response.json(shuffled.slice(0, n))
  }

  return Response.json(captions)
}

// ─── POST /api/captions — add new ───────────────────────────
export async function POST(request) {
  const body = await request.json()
  if (!body.title && !body.body) {
    return Response.json({ error: 'Title or body required' }, { status: 400 })
  }

  const captions = await readCaptions()
  const newCaption = {
    id: Date.now(),
    title: body.title || '',
    body: body.body || '',
    tags: body.tags || [],
  }
  captions.push(newCaption)
  await writeCaptions(captions)
  return Response.json(newCaption)
}

// ─── PUT /api/captions — update (uses ?id=) ─────────────────
export async function PUT(request) {
  const url = new URL(request.url)
  const id = parseInt(url.searchParams.get('id'))
  if (!id) return Response.json({ error: 'id required' }, { status: 400 })

  const body = await request.json()
  const captions = await readCaptions()
  const idx = captions.findIndex(c => c.id === id)
  if (idx === -1) return Response.json({ error: 'Not found' }, { status: 404 })

  captions[idx] = { ...captions[idx], ...body, id }
  await writeCaptions(captions)
  return Response.json(captions[idx])
}

// ─── DELETE /api/captions?id=xxx — delete ───────────────────
export async function DELETE(request) {
  const url = new URL(request.url)
  const id = parseInt(url.searchParams.get('id'))
  if (!id) return Response.json({ error: 'id required' }, { status: 400 })

  let captions = await readCaptions()
  captions = captions.filter(c => c.id !== id)
  await writeCaptions(captions)
  return Response.json({ success: true })
}
