/**
 * Image API — Vercel serverless compatible.
 * Uses Vercel Blob for image storage.
 *
 * In local dev mode, the Express server handles these endpoints instead.
 * This file is ONLY used when deployed on Vercel.
 */
import { put, list, del } from '@vercel/blob'

export const config = {
  runtime: 'nodejs',
}

// ─── GET /api/images — list all images ───────────────────────
// Supports ?random=1&n=6 for random selection
export async function GET(request) {
  try {
    const url = new URL(request.url)
    const isRandom = url.searchParams.has('random')

    const { blobs } = await list({ prefix: 'uploads/' })
    let images = blobs
      .filter(b => /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(b.pathname))
      .map((b, i) => ({
        id: i + 1,
        filename: b.pathname.replace('uploads/', ''),
        url: b.url,
        size: b.size,
        sizeFormatted: formatSize(b.size),
        modified: b.uploadedAt,
      }))
      .reverse()

    if (isRandom) {
      const n = Math.min(parseInt(url.searchParams.get('n')) || 1, images.length)
      const shuffled = [...images].sort(() => Math.random() - 0.5)
      images = shuffled.slice(0, n)
      return Response.json({ images, total: images.length })
    }

    return Response.json({ images, total: images.length })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

// ─── POST /api/images — upload images ───────────────────────
export async function POST(request) {
  try {
    const formData = await request.formData()
    const files = formData.getAll('images')
    const uploaded = []

    for (const file of files) {
      const ext = file.name.split('.').pop()
      const name = file.name.replace(`.${ext}`, '')
      const key = `uploads/${name}_${Date.now()}.${ext}`

      const blob = await put(key, file, {
        access: 'public',
        contentType: file.type,
      })

      uploaded.push({
        filename: blob.pathname.replace('uploads/', ''),
        url: blob.url,
      })
    }

    return Response.json({ uploaded, count: uploaded.length })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

// ─── DELETE /api/images?filename=xxx — delete an image ──────
export async function DELETE(request) {
  try {
    const url = new URL(request.url)
    const filename = url.searchParams.get('filename')
    if (!filename) {
      return Response.json({ error: 'filename required' }, { status: 400 })
    }
    await del(`uploads/${filename}`)
    return Response.json({ success: true })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
