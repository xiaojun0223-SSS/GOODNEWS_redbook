import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const COOKIES_FILE = path.join(__dirname, '..', 'data', 'cookies.json')
const IMAGES_DIR = path.join(__dirname, '..', 'public', 'images')
const DATA_DIR = path.join(__dirname, '..', 'data')

fs.mkdirSync(DATA_DIR, { recursive: true })

let currentStatus = { phase: 'idle', message: '', loggedIn: false, progress: 0, qrCodeUrl: null }

export function getStatus() { return { ...currentStatus } }

function setStatus(update) { Object.assign(currentStatus, update); console.log('[Publisher]', currentStatus.phase, currentStatus.message || '') }

function saveCookies(cookies) { fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2)) }

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

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' })
  const page = await context.newPage()

  try {
    setStatus({ phase: 'navigating', message: '检查登录状态...', progress: 10 })
    const saved = loadCookies()
    if (saved) { await context.addCookies(saved); console.log('[Publisher] Restored cookies') }
    await page.goto('https://creator.xiaohongshu.com', { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(3000)
    const hasPublishBtn = await page.locator('text=发布笔记').first().isVisible({ timeout: 5000 }).catch(() => false)
    if (!hasPublishBtn) {
      await browser.close(); setStatus({ phase: 'error', message: '登录已过期，请先点击「🔄 更新登录」重新登录', progress: 0, loggedIn: false })
      return { success: false, message: '需要登录' }
    }
    setStatus({ loggedIn: true })

    // Navigate to publish page
    setStatus({ phase: 'navigating', message: '打开发布页面...', progress: 20 })
    let editorOpened = false
    try {
      editorOpened = await page.evaluate(() => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let node
        while ((node = walker.nextNode())) { if (node.textContent && node.textContent.includes('发布笔记')) { let el = node.parentElement; while (el && el.tagName !== 'BUTTON' && el.tagName !== 'A') el = el.parentElement; if (el) { el.click(); return true }; node.parentElement.click(); return true } }
        return false
      })
    } catch {}
    if (!editorOpened) {
      for (const url of ['https://creator.xiaohongshu.com/publish', 'https://creator.xiaohongshu.com/publish/notes']) {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}); await page.waitForTimeout(2000)
        const hasInput = await page.locator('input[type="file"][accept*="jpg"], input[type="file"][accept*="image"]').count()
        if (hasInput > 0) { editorOpened = true; break }
      }
    }
    await page.waitForTimeout(2000)
    // Switch to 图文 tab
    await page.evaluate(() => { const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let node; while ((node = walker.nextNode())) { if (node.textContent && node.textContent.trim() === '上传图文') { let el = node.parentElement; for (let i = 0; i < 5 && el; i++) { try { el.click(); return true } catch {}; el = el.parentElement } } }; return false })
    await page.waitForTimeout(3000)
    // Upload
    setStatus({ phase: 'uploading', message: '上传图片...', progress: 30 })
    const allInputs = page.locator('input[type="file"]'); const inputCount = await allInputs.count(); let imageInput = null
    for (let i = 0; i < inputCount; i++) { const inp = allInputs.nth(i); const accept = (await inp.getAttribute('accept')) || ''; if (accept.includes('image') || accept.includes('jpg') || accept.includes('png') || accept.includes('jpeg')) { imageInput = inp; break }; if (!accept) imageInput = inp }
    if (!imageInput) throw new Error('找不到图片上传入口')
    await imageInput.setInputFiles(usedPaths); try { fs.rmSync(TMP_DIR, { recursive: true, force: true }) } catch {}
    await page.waitForTimeout(8000)
    // Fill title
    setStatus({ phase: 'filling', message: '填写标题...', progress: 60 })
    await page.evaluate((text) => { const s = ['input[placeholder*="标题"]', '[placeholder*="标题"]', '[class*="title"] input']; for (const sel of s) { const el = document.querySelector(sel); if (el) { el.focus(); el.value = text; el.dispatchEvent(new Event('input', { bubbles: true })); return } } }, title)
    // Fill body
    const bodyText = body.replace(/\n/g, '\n\n')
    const bodyFilled = await page.evaluate((text) => { const s = ['[placeholder*="正文"]', '[contenteditable="true"]', 'textarea']; for (const sel of s) { const el = document.querySelector(sel); if (el) { el.focus(); if (el.contentEditable === 'true') el.textContent = text; else el.value = text; el.dispatchEvent(new Event('input', { bubbles: true })); return true } }; return false }, bodyText)
    if (!bodyFilled) { await page.mouse.click(500, 400); await page.waitForTimeout(500); for (const p of body.split('\n').filter(p => p.trim())) { await page.keyboard.type(p, { delay: 20 }); await page.keyboard.press('Enter'); await page.keyboard.press('Enter') } }
    // Tags
    setStatus({ phase: 'filling', message: '添加标签...', progress: 80 })
    if (tags.length > 0) { const tc = await page.evaluate(() => { for (const t of ['添加标签', '添加话题']) { const el = [...document.querySelectorAll('*')].find(e => e.textContent.trim() === t); if (el) { el.click(); return true } }; return false }); if (tc) { await page.waitForTimeout(800); for (const tag of tags) { await page.keyboard.type(tag, { delay: 30 }); await page.waitForTimeout(400); await page.keyboard.press('Enter'); await page.waitForTimeout(400) } } }
    saveCookies(await context.cookies())
    // Publish/Draft
    if (draft) {
      setStatus({ phase: 'publishing', message: '保存草稿...', progress: 90 })
      const dc = await page.evaluate(() => { for (const btn of [...document.querySelectorAll('button, a, span, div')]) { if (btn.textContent.trim() === '存草稿' || btn.textContent.trim() === '保存草稿') { btn.click(); return true } }; return false })
      await page.waitForTimeout(3000)
    } else {
      setStatus({ phase: 'publishing', message: '发布中...', progress: 90 })
      const pc = await page.evaluate(() => { for (const btn of [...document.querySelectorAll('button, a, span, div')]) { if (btn.textContent.trim() === '发布' || btn.textContent.trim() === '发布笔记') { btn.click(); return true } }; return false })
      await page.waitForTimeout(3000)
    }
    setStatus({ phase: 'done', message: draft ? '✅ 草稿已完成' : '✅ 已发布', progress: 100 })
    saveCookies(await context.cookies())
  } catch (err) { setStatus({ phase: 'error', message: err.message }); try { await page.screenshot({ path: path.join(DATA_DIR, 'debug_error.png') }) } catch {} }
  return { success: !currentStatus.message?.includes('Error'), message: currentStatus.message }
}

/**
 * Manual login - go to creator page, find QR icon by coordinates, click it, screenshot the QR code.
 */
export async function manualLogin() {
  console.log('[Publisher] Manual login - deleting old cookies')
  try { fs.unlinkSync(COOKIES_FILE) } catch {}
  console.log('[Publisher] Old cookies deleted')

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()

  await page.goto('https://creator.xiaohongshu.com', { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(3000)
  console.log('[Publisher] Login page URL:', page.url())

  // Find the login form area
  const loginBox = await page.evaluate(() => {
    // Look for a large centered container that's likely the login form
    const forms = document.querySelectorAll('form, div[class*="login"], div[class*="Login"], div[class*="form"], div[class*="Form"]')
    for (const f of forms) {
      const r = f.getBoundingClientRect()
      if (r.width > 200 && r.height > 200 && r.top > 0 && r.top < 400) {
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
      }
    }
    // Fallback: find a large centered div
    const all = document.querySelectorAll('div')
    for (const d of all) {
      const r = d.getBoundingClientRect()
      if (r.width > 250 && r.width < 600 && r.height > 250 && r.top > 50 && r.top < 350) {
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
      }
    }
    return null
  })
  console.log('[Publisher] Login box:', JSON.stringify(loginBox))

  if (loginBox) {
    // QR code icon is at the top-right of the login box
    const qrX = loginBox.x + loginBox.w - 20
    const qrY = loginBox.y + 20
    await page.mouse.click(qrX, qrY)
    console.log('[Publisher] Clicked QR icon at', qrX, qrY)
    await page.waitForTimeout(3000)

    // After switching, the QR code appears in the same area
    const qrPublic = path.join(IMAGES_DIR, 'qrcode_login.png')
    await page.screenshot({ path: qrPublic, clip: { x: loginBox.x, y: loginBox.y, width: loginBox.w, height: loginBox.h } })
  } else {
    // Fallback: center of page
    const qrPublic = path.join(IMAGES_DIR, 'qrcode_login.png')
    await page.screenshot({ path: qrPublic, clip: { x: 400, y: 100, width: 500, height: 500 } })
  }

  setStatus({ phase: 'logging_in', message: '请用手机扫描二维码登录（5分钟内完成）', progress: 20, loggedIn: false, qrCodeUrl: '/images/qrcode_login.png' })

  // Wait for login (browser redirects to creator dashboard)
  let loggedIn = false
  for (let i = 0; i < 150; i++) {
    await new Promise(r => setTimeout(r, 2000))
    const url = page.url()
    if (!url.includes('login') && url.includes('creator.xiaohongshu.com')) {
      loggedIn = true; break
    }
  }

  if (loggedIn) {
    const cookies = await context.cookies()
    saveCookies(cookies)
    await browser.close()
    setStatus({ phase: 'done', message: '登录成功！', progress: 100, loggedIn: true, qrCodeUrl: null })
    return { success: true }
  }

  await browser.close()
  throw new Error('登录超时')
}

export function checkLoginStatus() {
  const cookies = loadCookies()
  if (!cookies || cookies.length === 0) return { loggedIn: false }
  const now = Date.now() / 1000
  const hasValidCookie = cookies.some(c => !c.expires || c.expires > now)
  return { loggedIn: hasValidCookie }
}
