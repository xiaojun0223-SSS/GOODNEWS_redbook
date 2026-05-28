import express from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import multer from 'multer'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const IMAGES_DIR = path.join(__dirname, '..', 'public', 'images')
const DIST_DIR = path.join(__dirname, '..', 'dist')
const CONFIG_FILE = path.join(__dirname, '..', 'data', 'cloud-config.json')
fs.mkdirSync(IMAGES_DIR, { recursive: true })

// Read cloud config
let cloudUrl = ''
try { const c = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); cloudUrl = c.url || '' } catch {}

const app = express()
app.use(express.json())
app.use('/images', express.static(IMAGES_DIR))
app.use('/images/qrcode_login.png', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate'); next()
})

const storage = multer.diskStorage({
  destination: IMAGES_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg'
    cb(null, Date.now() + '_' + Math.random().toString(36).slice(2, 8) + ext)
  }
})
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } })

// ─── Proxy helper ───────────────────────────────────────────

async function proxyFromCloud(endpoint) {
  if (!cloudUrl) return null
  try {
    const res = await fetch(`${cloudUrl}${endpoint}`)
    if (res.ok) return await res.json()
  } catch {}
  return null
}

// ─── API: Save cloud URL ───────────────────────────────────

app.post('/api/cloud-url', (req, res) => {
  const { url } = req.body
  if (!url) return res.status(400).json({ error: 'url required' })
  cloudUrl = url.replace(/\/$/, '')
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true })
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ url: cloudUrl }))
  res.json({ success: true, url: cloudUrl })
})

// ─── Images ─────────────────────────────────────────────────

app.get('/api/images', async (req, res) => {
  // Try cloud first
  const cloud = await proxyFromCloud('/api/images')
  if (cloud) return res.json(cloud)

  // Fallback to local
  try {
    const files = fs.readdirSync(IMAGES_DIR).filter(f => /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(f))
    const images = files.map((f, i) => {
      const stat = fs.statSync(path.join(IMAGES_DIR, f))
      return { id: i + 1, filename: f, url: `/images/${encodeURIComponent(f)}`, size: stat.size, sizeFormatted: (stat.size / 1024).toFixed(1) + ' KB', modified: stat.mtime.toISOString() }
    }).sort((a, b) => b.modified.localeCompare(a.modified))
    res.json({ images, total: images.length })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/images/random', async (req, res) => {
  const cloud = await proxyFromCloud(`/api/images/random?n=${req.query.n || 1}`)
  if (cloud) return res.json(cloud)
  const files = fs.readdirSync(IMAGES_DIR).filter(f => /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(f))
  const n = Math.min(parseInt(req.query.n) || 1, files.length)
  const selected = [...files].sort(() => Math.random() - 0.5).slice(0, n)
  res.json({ images: selected.map((f, i) => ({ id: i + 1, filename: f, url: `/images/${encodeURIComponent(f)}` })), total: n })
})

app.post('/api/upload', upload.array('images', 20), (req, res) => {
  const uploaded = req.files.map(f => ({ filename: f.filename, url: `/images/${encodeURIComponent(f.filename)}` }))
  res.json({ uploaded, count: uploaded.length })
})

// ─── Captions ───────────────────────────────────────────────

const CAPTIONS_FILE = path.join(__dirname, '..', 'data', 'captions.json')
function rc() { try { return JSON.parse(fs.readFileSync(CAPTIONS_FILE, 'utf8')) } catch { return [] } }
function wc(d) { fs.mkdirSync(path.dirname(CAPTIONS_FILE), { recursive: true }); fs.writeFileSync(CAPTIONS_FILE, JSON.stringify(d, null, 2)) }

app.get('/api/captions', async (req, res) => {
  const cloud = await proxyFromCloud('/api/captions')
  if (cloud) { wc(cloud); return res.json(cloud) }
  res.json(rc())
})

app.get('/api/captions/random', async (req, res) => {
  const cloud = await proxyFromCloud(`/api/captions/random?n=${req.query.n || 1}`)
  if (cloud) return res.json(cloud)
  const c = rc(); const n = Math.min(parseInt(req.query.n) || 1, c.length)
  res.json(c.length ? [...c].sort(() => Math.random() - 0.5).slice(0, n) : [])
})

app.post('/api/captions', (req, res) => {
  const { title, body, tags } = req.body
  if (!title && !body) return res.status(400).json({ error: 'required' })
  const c = rc(); const n = { id: Date.now(), title: title || '', body: body || '', tags: tags || [] }
  c.push(n); wc(c); res.json(n)
})

app.put('/api/captions/:id', (req, res) => {
  const c = rc(); const idx = c.findIndex(x => x.id === Number(req.params.id))
  if (idx < 0) return res.status(404).json({ error: 'not found' })
  c[idx] = { ...c[idx], ...req.body, id: c[idx].id }; wc(c); res.json(c[idx])
})

app.delete('/api/captions/:id', (req, res) => {
  let c = rc(); c = c.filter(x => x.id !== Number(req.params.id)); wc(c); res.json({ success: true })
})

// ─── Publish ────────────────────────────────────────────────

app.get('/api/publish/status', async (req, res) => {
  try { const { getStatus, checkLoginStatus } = await import('./publisher.js'); res.json({ ...getStatus(), ...checkLoginStatus() }) }
  catch { res.json({ loggedIn: false, phase: 'idle' }) }
})

app.post('/api/publish/login', async (req, res) => {
  try {
    const { manualLogin } = await import('./publisher.js')
    manualLogin().catch(err => console.error('[Login] Background error:', err))
    res.json({ success: true, message: '登录已启动' })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

app.post('/api/publish', express.json({ limit: '10mb' }), async (req, res) => {
  const { imageFilenames, imageUrls, title, body, tags, coverIndex, draft } = req.body
  if (!imageFilenames?.length && !imageUrls?.length) return res.status(400).json({ error: 'No images' })
  if (!title) return res.status(400).json({ error: 'No title' })
  res.json({ message: '已启动' })
  try {
    const { publishNote } = await import('./publisher.js')
    // Use imageUrls from cloud for publishing, download to temp
    const urls = imageUrls?.length ? imageUrls : imageFilenames?.map(f => `${cloudUrl || ''}/images/${encodeURIComponent(f)}`)
    publishNote({ imageFilenames, imageUrls: urls, title, body, tags: tags || [], coverIndex: coverIndex || 0, draft }).catch(() => {})
  } catch {}
})

app.post('/api/sync', express.json(), async (req, res) => {
  const { vercelUrl } = req.body
  if (!vercelUrl) return res.status(400).json({ error: 'vercelUrl required' })
  try {
    const r = await fetch(`${vercelUrl}/api/images`); const { images } = await r.json()
    for (const img of images) {
      const p = path.join(IMAGES_DIR, img.filename)
      if (!fs.existsSync(p)) { const b = await fetch(img.url); fs.writeFileSync(p, Buffer.from(await b.arrayBuffer())) }
    }
    const cr = await fetch(`${vercelUrl}/api/captions`); wc(await cr.json())
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ─── SPA ────────────────────────────────────────────────────

if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR))
  app.get('*', (req, res) => res.sendFile(path.join(DIST_DIR, 'index.html')))
}

// ─── Cookie upload ──────────────────────────────────────────

app.post('/api/cookies/upload', express.json({ limit: '5mb' }), (req, res) => {
  try {
    const { cookies } = req.body
    if (!cookies || !Array.isArray(cookies) || cookies.length === 0) return res.status(400).json({ error: '无效的Cookie' })
    const f = path.join(__dirname, '..', 'data', 'cookies.json')
    fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(cookies, null, 2))
    res.json({ success: true, count: cookies.length })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`📸 Redbook tool running at http://localhost:${PORT}`)
  if (fs.existsSync(DIST_DIR)) console.log(`🌐 Frontend: ${DIST_DIR}`)
  if (cloudUrl) console.log(`☁️ Cloud server: ${cloudUrl}`)
})
