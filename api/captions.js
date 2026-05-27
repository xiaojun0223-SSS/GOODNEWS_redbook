/**
 * Caption Library API — Vercel serverless + local compatible.
 *
 * On Vercel: reads/writes via Vercel Blob (list + fetch for read, put for write).
 * Seeds from git-tracked data/captions.json on first deploy.
 * On local dev: the Express server handles these endpoints instead.
 */
import { put, list } from '@vercel/blob'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CAPTIONS_KEY = 'data/captions.json'
const LOCAL_FILE = path.join(__dirname, '..', 'data', 'captions.json')

export const config = { runtime: 'nodejs' }

// ─── Read captions (Blob → local seed → empty) ──────────────

async function readCaptions() {
  // 1. Try to read from Blob storage
  try {
    const { blobs } = await list({ prefix: CAPTIONS_KEY })
    if (blobs.length > 0) {
      const res = await fetch(blobs[0].url)
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data) && data.length > 0) return data
      }
    }
  } catch (e) {
    console.log('[captions] Blob read failed, trying local:', e.message)
  }

  // 2. Fallback: seed from local JSON file (committed to git)
  try {
    if (fs.existsSync(LOCAL_FILE)) {
      const text = fs.readFileSync(LOCAL_FILE, 'utf-8')
      const data = JSON.parse(text)
      if (Array.isArray(data) && data.length > 0) {
        // Persist to Blob for future reads
        try { await writeCaptions(data) } catch {}
        return data
      }
    }
  } catch (e) {
    console.log('[captions] Local seed failed:', e.message)
  }

  return []
}

// ─── Write captions to Blob ──────────────────────────────────

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
  try {
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
  } catch (err) {
    console.error('[captions] POST error:', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}

// ─── PUT /api/captions[/:id] — update ────────────────────────

export async function PUT(request) {
  try {
    const id = extractId(request.url)
    if (!id) return Response.json({ error: 'id required' }, { status: 400 })

    const body = await request.json()
    const captions = await readCaptions()
    const idx = captions.findIndex(c => c.id === id)
    if (idx === -1) return Response.json({ error: 'Not found' }, { status: 404 })

    captions[idx] = { ...captions[idx], ...body, id }
    await writeCaptions(captions)
    return Response.json(captions[idx])
  } catch (err) {
    console.error('[captions] PUT error:', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}

// ─── DELETE /api/captions[/:id] — delete ─────────────────────

export async function DELETE(request) {
  try {
    const id = extractId(request.url)
    if (!id) return Response.json({ error: 'id required' }, { status: 400 })

    let captions = await readCaptions()
    captions = captions.filter(c => c.id !== id)
    await writeCaptions(captions)
    return Response.json({ success: true })
  } catch (err) {
    console.error('[captions] DELETE error:', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}

/** Extract ID from /api/captions/123 or /api/captions?id=123 */
function extractId(urlStr) {
  const url = new URL(urlStr)
  const fromQuery = parseInt(url.searchParams.get('id'))
  if (fromQuery) return fromQuery
  const parts = url.pathname.split('/')
  const last = parts[parts.length - 1]
  const fromPath = parseInt(last)
  if (!isNaN(fromPath) && fromPath > 0) return fromPath
  return null
}
