import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import multer from 'multer'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const IMAGES_DIR = path.join(__dirname, '..', 'public', 'images')
const DIST_DIR = path.join(__dirname, '..', 'dist')

if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true })
}

const app = express()
app.use(cors())
app.use(express.json())

// Serve images statically
app.use('/images', express.static(IMAGES_DIR))

// In production, serve built frontend
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR))
}

const storage = multer.diskStorage({
  destination: IMAGES_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname)
    const name = path.basename(file.originalname, ext)
    const timestamp = Date.now()
    cb(null, `${name}_${timestamp}${ext}`)
  },
})
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|bmp)$/i
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true)
    } else {
      cb(new Error('Only image files are allowed'))
    }
  },
  limits: { fileSize: 20 * 1024 * 1024 },
})

app.get('/api/images', (req, res) => {
  try {
    const files = fs.readdirSync(IMAGES_DIR)
    const images = files
      .filter(f => /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(f))
      .map((f, i) => {
        const stat = fs.statSync(path.join(IMAGES_DIR, f))
        return {
          id: i + 1,
          filename: f,
          url: `/images/${encodeURIComponent(f)}`,
          size: stat.size,
          sizeFormatted: formatSize(stat.size),
          modified: stat.mtime.toISOString(),
          modifiedFormatted: stat.mtime.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
        }
      })
      .sort((a, b) => new Date(b.modified) - new Date(a.modified))
    res.json({ images, total: images.length })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/api/upload', upload.array('images', 20), (req, res) => {
  const uploaded = req.files.map(f => ({ filename: f.filename, url: `/images/${encodeURIComponent(f.filename)}` }))
  res.json({ uploaded, count: uploaded.length })
})

app.delete('/api/images/:filename', (req, res) => {
  try {
    const filepath = path.join(IMAGES_DIR, req.params.filename)
    if (fs.existsSync(filepath)) { fs.unlinkSync(filepath); res.json({ success: true }) }
    else res.status(404).json({ error: 'File not found' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/images/random', (req, res) => {
  try {
    const files = fs.readdirSync(IMAGES_DIR).filter(f => /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(f))
    const count = Math.min(parseInt(req.query.n) || 1, files.length)
    const shuffled = [...files].sort(() => Math.random() - 0.5)
    const selected = shuffled.slice(0, count)
    const images = selected.map((f, i) => {
      const stat = fs.statSync(path.join(IMAGES_DIR, f))
      return { id: i + 1, filename: f, url: `/images/${encodeURIComponent(f)}`, size: stat.size, sizeFormatted: formatSize(stat.size), modified: stat.mtime.toISOString() }
    })
    res.json({ images, total: images.length })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/api/generate-caption', express.json({ limit: '10mb' }), (req, res) => {
  res.json({ mode: 'stub', message: 'AI caption generation runs in the browser.' })
})

// Caption Library
const CAPTIONS_FILE = path.join(__dirname, '..', 'data', 'captions.json')
function readCaptions() { try { return JSON.parse(fs.readFileSync(CAPTIONS_FILE, 'utf-8')) } catch { return [] } }
function writeCaptions(data) { fs.mkdirSync(path.dirname(CAPTIONS_FILE), { recursive: true }); fs.writeFileSync(CAPTIONS_FILE, JSON.stringify(data, null, 2), 'utf-8') }

app.get('/api/captions', (req, res) => { res.json(readCaptions()) })
app.post('/api/captions', (req, res) => {
  const { title, body, tags } = req.body
  if (!title && !body) return res.status(400).json({ error: 'Title or body required' })
  const captions = readCaptions()
  const newCaption = { id: Date.now(), title: title || '', body: body || '', tags: tags || [] }
  captions.push(newCaption)
  writeCaptions(captions)
  res.json(newCaption)
})
app.put('/api/captions/:id', (req, res) => {
  const captions = readCaptions()
  const idx = captions.findIndex(c => c.id === Number(req.params.id))
  if (idx === -1) return res.status(404).json({ error: 'Not found' })
  captions[idx] = { ...captions[idx], ...req.body, id: captions[idx].id }
  writeCaptions(captions)
  res.json(captions[idx])
})
app.delete('/api/captions/:id', (req, res) => {
  let captions = readCaptions()
  captions = captions.filter(c => c.id !== Number(req.params.id))
  writeCaptions(captions)
  res.json({ success: true })
})
app.get('/api/captions/random', (req, res) => {
  const captions = readCaptions()
  const count = Math.min(parseInt(req.query.n) || 1, captions.length)
  if (captions.length === 0) return res.json([])
  const shuffled = [...captions].sort(() => Math.random() - 0.5)
  res.json(shuffled.slice(0, count))
})

// Publishing endpoints
app.get('/api/publish/status', async (req, res) => {
  try {
    const { getStatus, checkLoginStatus } = await import('./publisher.js')
    res.json({ ...getStatus(), ...checkLoginStatus() })
  } catch { res.json({ loggedIn: false, phase: 'idle' }) }
})
app.post('/api/publish/login', async (req, res) => {
  try { const { manualLogin } = await import('./publisher.js'); res.json(await manualLogin()) }
  catch (err) { res.status(500).json({ success: false, message: err.message }) }
})
app.post('/api/publish', express.json({ limit: '10mb' }), async (req, res) => {
  const { imageFilenames, imageUrls, title, body, tags, coverIndex, draft } = req.body
  if (!imageFilenames?.length && !imageUrls?.length) return res.status(400).json({ error: 'No images' })
  if (!title) return res.status(400).json({ error: 'No title' })
  res.json({ message: '已启动' })
  try {
    const { publishNote } = await import('./publisher.js')
    publishNote({ imageFilenames, imageUrls, title, body, tags: tags || [], coverIndex: coverIndex || 0, draft }).catch(() => {})
  } catch {}
})

app.post('/api/sync', express.json(), async (req, res) => {
  const { vercelUrl } = req.body
  if (!vercelUrl) return res.status(400).json({ error: 'vercelUrl required' })
  const base = vercelUrl.replace(/\/$/, '')
  const results = { images: 0, captions: false }
  try {
    const imgRes = await fetch(`${base}/api/images`)
    if (imgRes.ok) {
      const { images } = await imgRes.json()
      for (const img of images) {
        const filepath = path.join(IMAGES_DIR, img.filename)
        if (!fs.existsSync(filepath)) {
          const blobRes = await fetch(img.url)
          if (blobRes.ok) { fs.writeFileSync(filepath, Buffer.from(await blobRes.arrayBuffer())); results.images++ }
        }
      }
    }
    const capRes = await fetch(`${base}/api/captions`)
    if (capRes.ok) { writeCaptions(await capRes.json()); results.captions = true }
    res.json(results)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// SPA fallback
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR))
}
if (fs.existsSync(DIST_DIR)) {
  app.get('*', (req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'))
  })
}

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`📸 Redbook tool running at http://localhost:${PORT}`)
  console.log(`📁 Serving images from: ${IMAGES_DIR}`)
  if (fs.existsSync(DIST_DIR)) console.log(`🌐 Frontend: ${DIST_DIR}`)
})
