/**
 * Upload API — separate endpoint for image uploads on Vercel.
 * Frontend POSTs to /api/upload → handled here.
 */
import { put } from '@vercel/blob'

export const config = { runtime: 'nodejs' }

export async function POST(request) {
  try {
    const formData = await request.formData()
    const files = formData.getAll('images')

    if (!files || files.length === 0) {
      return Response.json({ error: 'No files received' }, { status: 400 })
    }

    const uploaded = []

    for (const file of files) {
      const ext = file.name.split('.').pop() || 'jpg'
      const name = file.name.replace(`.${ext}`, '').replace(/[^a-zA-Z0-9_-]/g, '_')
      const key = `uploads/${name}_${Date.now()}.${ext}`

      const blob = await put(key, file, {
        access: 'public',
        addRandomSuffix: false,
      })

      uploaded.push({
        filename: blob.pathname.replace('uploads/', ''),
        url: blob.url,
      })
    }

    return Response.json({ uploaded, count: uploaded.length })
  } catch (err) {
    console.error('Upload error:', err)
    return Response.json({ error: err.message || 'Upload failed' }, { status: 500 })
  }
}
