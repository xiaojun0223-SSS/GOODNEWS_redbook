import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const COOKIES_FILE = path.join(__dirname, '..', 'data', 'cookies.json')
const IMAGES_DIR = path.join(__dirname, '..', 'public', 'images')
const DATA_DIR = path.join(__dirname, '..', 'data')
const BROWSER_PROFILE = path.join(DATA_DIR, 'browser-profile')

fs.mkdirSync(DATA_DIR, { recursive: true })

let currentStatus = { phase: 'idle', message: '', loggedIn: false, progress: 0, qrCodeUrl: null }
let persistentContext = null

export function getStatus() { return { ...currentStatus } }

function setStatus(update) { Object.assign(currentStatus, update); console.log('[Publisher]', currentStatus.phase, currentStatus.message || '') }

function saveCookies(cookies) {
  const fixed = cookies.map(c => ({ ...c, expires: c.expires && c.expires > 0 ? c.expires : Math.floor(Date.now() / 1000) + 604800 }))
  fs.writeFileSync(COOKIES_FILE, JSON.stringify(fixed, null, 2))
}

function loadCookies() { try { return JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf-8')) } catch { return null } }

export async function publishNote({ imageFilenames, imageUrls, title, body, tags, coverIndex, draft = false }) {
  setStatus({ phase: 'starting', message: '启动浏览器...', progress: 5 })
  const TMP_DIR = path.join(DATA_DIR, 'publish-tmp')
  let usedPaths
  if (imageUrls && imageUrls.length > 0) {
    fs.mkdirSync(TMP_DIR, { recursive: true }); usedPaths = []
    for (let i = 0; i < imageUrls.length; i++) {
      const dest = path.join(TMP_DIR, `img_${Date.now()}_${i}.jpg`)
      setStatus({ phase: 'downloading', message: `下载图片 ${i + 1}/${imageUrls.length}...`, progress: 5 + (i / imageUrls.length) * 10 })
      try { const res = await fetch(imageUrls[i]); const buffer = Buffer.from(await res.arrayBuffer()); fs.writeFileSync(dest, buffer); usedPaths.push(dest) } catch {}
    }
  } else { usedPaths = imageFilenames.map(f => path.join(IMAGES_DIR, f)) }

  // Use real browser on MacBook (headless: false), fallback to headless on server
  const isMac = process.platform === 'darwin'
  const useHeadless = !isMac  // false on Mac (real browser), true on server

  const context = persistentContext || await chromium.launchPersistentContext(BROWSER_PROFILE, {
    headless: useHeadless,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  })
  await context.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }) })
  const page = await context.newPage()

  try {
    setStatus({ phase: 'navigating', message: '检查登录状态...', progress: 10 })
    await page.goto('https://creator.xiaohongshu.com', { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(5000)

    let hasPublishBtn = false
    for (let i = 0; i < 5; i++) {
      hasPublishBtn = await page.locator('text=发布笔记').first().isVisible({ timeout: 2000 }).catch(() => false)
      if (hasPublishBtn) break
      if (i === 2) { await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3000) }
    }
    if (!hasPublishBtn) {
      setStatus({ phase: 'error', message: '登录已过期，请先点击「🔄 更新登录」重新登录', progress: 0, loggedIn: false })
      return { success: false, message: '需要登录' }
    }
    setStatus({ loggedIn: true })

    setStatus({ phase: 'navigating', message: '打开发布页面...', progress: 20 })
    await page.goto('https://creator.xiaohongshu.com/publish/publish?from=menu&target=image', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() =>
      page.goto('https://creator.xiaohongshu.com/publish', { waitUntil: 'domcontentloaded', timeout: 30000 })
    )
    await page.waitForTimeout(3000)
    console.log('[Publisher] Publish page URL:', page.url())

    if (page.url().includes('target=video') || page.url().includes('/video')) {
      await page.evaluate(() => { const el = [...document.querySelectorAll('*')].find(e => e.textContent.trim() === '上传图文'); if (el) { el.click(); return true }; return false })
      await page.waitForTimeout(3000)
    }

    setStatus({ phase: 'uploading', message: '上传图片...', progress: 30 })
    const allInputs = page.locator('input[type="file"]'); const inputCount = await allInputs.count(); let imageInput = null
    for (let i = 0; i < inputCount; i++) { const inp = allInputs.nth(i); const accept = (await inp.getAttribute('accept')) || ''; if (accept.includes('image') || accept.includes('jpg') || accept.includes('png') || accept.includes('jpeg')) { imageInput = inp; break }; if (!accept) imageInput = inp }
    if (!imageInput) throw new Error('找不到图片上传入口')
    await imageInput.setInputFiles(usedPaths); try { fs.rmSync(TMP_DIR, { recursive: true, force: true }) } catch {}
    console.log('[Publisher] Waiting for images to process...')
    await page.waitForTimeout(12000)

    // Take a screenshot after processing
    await page.screenshot({ path: path.join(DATA_DIR, 'debug_after_upload.png') })
    console.log('[Publisher] Screenshot taken after upload')

    setStatus({ phase: 'filling', message: '填写标题...', progress: 60 })
    await page.evaluate((text) => { const s = ['input[placeholder*="标题"]', '[placeholder*="标题"]', '[class*="title"] input']; for (const sel of s) { const el = document.querySelector(sel); if (el) { el.focus(); el.value = text; el.dispatchEvent(new Event('input', { bubbles: true })); return } } }, title)

    const bodyText = body.replace(/\n/g, '\n\n')
    const bodyFilled = await page.evaluate((text) => { const s = ['[placeholder*="正文"]', '[contenteditable="true"]', 'textarea']; for (const sel of s) { const el = document.querySelector(sel); if (el) { el.focus(); if (el.contentEditable === 'true') el.textContent = text; else el.value = text; el.dispatchEvent(new Event('input', { bubbles: true })); return true } }; return false }, bodyText)
    if (!bodyFilled) { await page.mouse.click(500, 400); await page.waitForTimeout(500); for (const p of body.split('\n').filter(p => p.trim())) { await page.keyboard.type(p, { delay: 20 }); await page.keyboard.press('Enter'); await page.keyboard.press('Enter') } }

    setStatus({ phase: 'filling', message: '添加标签...', progress: 80 })
    if (tags.length > 0) { const tc = await page.evaluate(() => { for (const t of ['添加标签', '添加话题']) { const el = [...document.querySelectorAll('*')].find(e => e.textContent.trim() === t); if (el) { el.click(); return true } }; return false }); if (tc) { await page.waitForTimeout(800); for (const tag of tags) { await page.keyboard.type(tag, { delay: 30 }); await page.waitForTimeout(400); await page.keyboard.press('Enter'); await page.waitForTimeout(400) } } }

    saveCookies(await context.cookies())

    // Click save or publish. Note: drafts are stored in browser local storage only.
    setStatus({ phase: 'publishing', message: draft ? '保存草稿...' : '发布中...', progress: 90 })
    const btnText = draft ? '暂存离开' : '发布'
    console.log('[Publisher] Looking for 发布 button...')

    // Scroll to bottom to ensure buttons are in view
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(1000)

    // Headless browser detection prevents XHS from showing publish buttons.
    // Try clicking at the known button position via coordinates.
    let publishClicked = false

    await page.screenshot({ path: path.join(DATA_DIR, 'debug_publish.png') })

    // XHS publish button position (floating bottom-right on 1440x900 viewport)
    const positions = [
      { x: 1330, y: 850 },  // 发布 button typical position
      { x: 1300, y: 840 },
      { x: 1350, y: 860 },
      { x: 1200, y: 850 },
    ]
    for (const pos of positions) {
      await page.mouse.click(pos.x, pos.y)
      await page.waitForTimeout(500)
    }
    console.log('[Publisher] Clicked at multiple bottom positions')

    // Check if navigation happened (page changed after click)
    await page.waitForTimeout(2000)
    const currentUrl = page.url()
    if (!currentUrl.includes('publish')) {
      console.log('[Publisher] Page navigated away from editor - publish likely succeeded')
      publishClicked = true
    }

    await page.waitForTimeout(5000)
    console.log('[Publisher] Final URL:', page.url())

    // Check if there's a confirmation dialog
    try {
      const confirmBtn = page.locator('button:has-text("确认"), button:has-text("确定"), button:has-text("发布")').first()
      if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await confirmBtn.click()
        console.log('[Publisher] Clicked confirmation dialog')
        await page.waitForTimeout(3000)
      }
    } catch {}
    const doneMsg = draft ? (publishClicked ? '✅ 草稿已保存（仅当前浏览器可见）' : '✅ 内容已填入') : (publishClicked ? '✅ 已发布' : '✅ 内容已填入')
    setStatus({ phase: 'done', message: doneMsg, progress: 100 })
  } catch (err) { setStatus({ phase: 'error', message: err.message }); try { await page.screenshot({ path: path.join(DATA_DIR, 'debug_error.png') }) } catch {} }
  return { success: !currentStatus.message?.includes('Error'), message: currentStatus.message }
}

export async function manualLogin() {
  console.log('[Publisher] Manual login - persistent profile at', BROWSER_PROFILE)
  try { fs.unlinkSync(COOKIES_FILE) } catch {}

  const context = await chromium.launchPersistentContext(BROWSER_PROFILE, {
    headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  })
  await context.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }) })
  const page = context.pages()[0] || await context.newPage()

  await page.goto('https://creator.xiaohongshu.com', { waitUntil: 'domcontentloaded', timeout: 15000 })
  await page.waitForTimeout(3000)
  console.log('[Publisher] Page URL:', page.url())

  const alreadyLoggedIn = await page.locator('text=发布笔记').first().isVisible({ timeout: 3000 }).catch(() => false)
  if (alreadyLoggedIn) {
    console.log('[Publisher] Already logged in, no QR needed')
    persistentContext = context
    setStatus({ phase: 'done', message: '已登录', progress: 100, loggedIn: true, qrCodeUrl: null })
    return { success: true }
  }

  // Navigate to login page
  await page.goto('https://creator.xiaohongshu.com/login?type=qr', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() =>
    page.goto('https://creator.xiaohongshu.com', { waitUntil: 'domcontentloaded', timeout: 15000 })
  )
  await page.waitForTimeout(1000)
  console.log('[Publisher] Login page URL:', page.url())

  const loginBox = await page.evaluate(() => {
    const f = [...document.querySelectorAll('form, div[class*="login"], div[class*="Login"], div[class*="form"], div[class*="Form"]')].find(f => { const r = f.getBoundingClientRect(); return r.width > 200 && r.height > 200 && r.top > 0 && r.top < 400 })
    if (f) { const r = f.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } }
    const d = [...document.querySelectorAll('div')].find(d => { const r = d.getBoundingClientRect(); return r.width > 250 && r.width < 600 && r.height > 250 && r.top > 50 && r.top < 350 })
    if (d) { const r = d.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } }
    return null
  })

  if (loginBox) {
    await page.mouse.click(loginBox.x + loginBox.w - 25, loginBox.y + 25)
    console.log('[Publisher] Clicked QR toggle at', loginBox.x + loginBox.w - 25, loginBox.y + 25)
    await page.waitForTimeout(1000)
  }

  const qrPublic = path.join(IMAGES_DIR, 'qrcode_login.png')
  if (loginBox) { await page.screenshot({ path: qrPublic, clip: { x: loginBox.x, y: loginBox.y, width: loginBox.w, height: loginBox.h } }) }
  else { await page.screenshot({ path: qrPublic, clip: { x: 400, y: 100, width: 500, height: 500 } }) }

  setStatus({ phase: 'logging_in', message: '请用手机扫描二维码登录（5分钟内完成）', progress: 20, loggedIn: false, qrCodeUrl: '/images/qrcode_login.png?_t=' + Date.now() })

  let loggedIn = false
  for (let i = 0; i < 150; i++) {
    await new Promise(r => setTimeout(r, 2000))
    const url = page.url()
    if (i % 5 === 0) console.log('[Publisher] Current URL:', url.slice(0, 80))
    if (!url.includes('login') && !url.includes('signin') && !url.includes('password') && url.includes('creator.xiaohongshu.com')) { loggedIn = true; break }
    if (i > 3) { try { const h = await page.locator('text=发布笔记').first().isVisible({ timeout: 500 }).catch(() => false); if (h) { loggedIn = true; break } } catch {} }
  }

  if (loggedIn) {
    console.log('[Publisher] Login detected!')
    persistentContext = context
    setStatus({ phase: 'done', message: '登录成功！', progress: 100, loggedIn: true, qrCodeUrl: null })
    return { success: true }
  }

  console.log('[Publisher] Login timeout')
  await context.close()
  throw new Error('登录超时')
}

export function checkLoginStatus() {
  const cookies = loadCookies()
  if (!cookies || cookies.length === 0) return { loggedIn: false }
  return { loggedIn: cookies.some(c => !c.expires || c.expires > Date.now() / 1000) }
}
