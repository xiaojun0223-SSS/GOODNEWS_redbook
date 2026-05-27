/**
 * Xiaohongshu Publisher — Playwright-based browser automation.
 *
 * Flow:
 * 1. Open creator.xiaohongshu.com
 * 2. Restore saved cookies → skip login if valid
 * 3. Navigate to note creation page
 * 4. Upload images, fill title/body/tags
 * 5. Publish or save draft
 */

import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const COOKIES_FILE = path.join(__dirname, '..', 'data', 'cookies.json')
const SESSION_FILE = path.join(__dirname, '..', 'data', 'session.json')
const IMAGES_DIR = path.join(__dirname, '..', 'public', 'images')

// Ensure data dir exists
fs.mkdirSync(path.join(__dirname, '..', 'data'), { recursive: true })

// ─── Session state ──────────────────────────────────────────

let currentStatus = {
  phase: 'idle',       // idle | logging_in | uploading | filling | publishing | done | error
  message: '',
  loggedIn: false,
  progress: 0,
}

export function getStatus() {
  return { ...currentStatus }
}

function setStatus(update) {
  Object.assign(currentStatus, update)
  console.log('[Publisher]', currentStatus.phase, currentStatus.message || '')
}

// ─── Cookie persistence ─────────────────────────────────────

function saveCookies(cookies) {
  fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2))
  console.log('[Publisher] Cookies saved')
}

function loadCookies() {
  try {
    return JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf-8'))
  } catch {
    return null
  }
}

// ─── Main publish flow ──────────────────────────────────────

/**
 * Publish a note to Xiaohongshu.
 *
 * @param {Object} params
 * @param {string[]} params.imageFilenames  — image filenames (in public/images/)
 * @param {string}   params.title           — note title
 * @param {string}   params.body            — note body text
 * @param {string[]} params.tags            — tags (without #)
 * @param {number}   params.coverIndex      — which image is the cover (0-based)
 * @param {boolean}  params.draft           — save as draft instead of publish
 */
export async function publishNote({ imageFilenames, imageUrls, title, body, tags, coverIndex, draft = false }) {
  setStatus({ phase: 'starting', message: '启动浏览器...', progress: 5 })

  // ── Resolve image paths: support both local files and remote URLs ──
  const TMP_DIR = path.join(__dirname, '..', 'data', 'publish-tmp')
  let usedPaths

  if (imageUrls && imageUrls.length > 0) {
    // Download from URLs to temporary folder
    fs.mkdirSync(TMP_DIR, { recursive: true })
    usedPaths = []
    for (let i = 0; i < imageUrls.length; i++) {
      const ext = '.jpg' // fallback
      const dest = path.join(TMP_DIR, `img_${Date.now()}_${i}${ext}`)
      setStatus({ phase: 'downloading', message: `下载图片 ${i + 1}/${imageUrls.length}...`, progress: 5 + (i / imageUrls.length) * 10 })
      try {
        const res = await fetch(imageUrls[i])
        if (res.ok) {
          const buffer = Buffer.from(await res.arrayBuffer())
          fs.writeFileSync(dest, buffer)
          usedPaths.push(dest)
          // Fix extension based on content-type
          const ct = res.headers.get('content-type') || ''
          const extMap = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' }
          const correctExt = extMap[ct] || '.jpg'
          if (correctExt !== ext) {
            const renamed = dest.replace(/\.\w+$/, correctExt)
            fs.renameSync(dest, renamed)
            usedPaths[usedPaths.length - 1] = renamed
          }
        }
      } catch (e) {
        console.log('[Publisher] Failed to download image:', e.message)
      }
    }
  } else {
    // Use local files
    usedPaths = imageFilenames.map(f => path.join(IMAGES_DIR, f))
  }

  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox'],
  })

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  })

  const page = await context.newPage()

  try {
    // ── Step 1: Restore session ──
    setStatus({ phase: 'logging_in', message: '恢复登录状态...', progress: 10 })
    const savedCookies = loadCookies()
    if (savedCookies) {
      await context.addCookies(savedCookies)
      console.log('[Publisher] Restored saved cookies')
    }

    // ── Step 2: Go to creator dashboard ──
    setStatus({ phase: 'navigating', message: '进入创作者中心...', progress: 10 })
    await page.goto('https://creator.xiaohongshu.com', { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(2000)

    // Check login: look for the publish button or other logged-in indicators
    const hasPublishBtn = await page.locator('text=发布笔记').first().isVisible({ timeout: 3000 }).catch(() => false)
    const hasLoginBtn  = await page.locator('text=登录').first().isVisible({ timeout: 1000 }).catch(() => false)

    console.log('[Publisher] hasPublishBtn:', hasPublishBtn, 'hasLoginBtn:', hasLoginBtn)

    if (!hasPublishBtn && hasLoginBtn) {
      setStatus({
        phase: 'logging_in',
        message: '需要登录！请在浏览器中扫码登录（3分钟内）',
        progress: 15,
        loggedIn: false,
      })
      console.log('[Publisher] Waiting for login...')
      try {
        await page.waitForFunction(() => {
          return !window.location.href.includes('login')
        }, { timeout: 180000, polling: 2000 })
      } catch {
        throw new Error('登录超时（3分钟），请重试')
      }
      await page.waitForTimeout(2000)
      const cookies = await context.cookies()
      saveCookies(cookies)
      setStatus({ loggedIn: true })
    } else {
      setStatus({ loggedIn: true })
    }

    // ── Step 3: Navigate to note creation page ──
    setStatus({ phase: 'navigating', message: '打开发布页面...', progress: 20 })

    // Strategy: try multiple approaches to reach the note editor
    // XHS creator is a SPA — the "发布笔记" button triggers client-side routing

    console.log('[Publisher] Current URL:', page.url())

    // Approach 1: Click the 发布笔记 button via evaluate (more reliable than locator.click)
    let editorOpened = false
    try {
      await page.evaluate(() => {
        // Find all elements containing "发布笔记" text
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
        let node
        while ((node = walker.nextNode())) {
          if (node.textContent && node.textContent.includes('发布笔记')) {
            const el = node.parentElement
            if (el) {
              // Find nearest clickable ancestor
              let clickable = el
              while (clickable && clickable.tagName !== 'BUTTON' && clickable.tagName !== 'A') {
                clickable = clickable.parentElement
              }
              if (clickable) {
                clickable.click()
                return true
              }
              el.click()
              return true
            }
          }
        }
        return false
      })
      console.log('[Publisher] Clicked 发布笔记 via evaluate')
      await page.waitForTimeout(3000)
      console.log('[Publisher] URL after click:', page.url())
      editorOpened = true
    } catch (e) {
      console.log('[Publisher] evaluate click failed:', e.message)
    }

    // Check if we're on an editor page (URL changed)
    const currentUrl = page.url()
    if (currentUrl.includes('/publish') || currentUrl.includes('/editor') || currentUrl.includes('/create')) {
      console.log('[Publisher] On editor page')
      editorOpened = true
    }

    // Approach 2: Try direct URL navigation
    if (!editorOpened) {
      const urlsToTry = [
        'https://creator.xiaohongshu.com/publish',
        'https://creator.xiaohongshu.com/publish/notes',
        'https://creator.xiaohongshu.com/publish/notes/new',
        'https://creator.xiaohongshu.com/creator/notes/new',
      ]
      for (const url of urlsToTry) {
        console.log('[Publisher] Trying URL:', url)
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {})
        await page.waitForTimeout(2000)
        // Check if this page has a file input for images
        const hasImageInput = await page.locator('input[type="file"][accept*="image"], input[type="file"][accept*="jpg"], input[type="file"][accept*="png"]').count()
        if (hasImageInput > 0) {
          console.log('[Publisher] Found editor at:', url)
          editorOpened = true
          break
        }
        // Also check if page has upload-related elements
        const hasUploadText = await page.locator('text=上传图片, text=添加图片').count()
        if (hasUploadText > 0) {
          console.log('[Publisher] Found upload area at:', url)
          editorOpened = true
          break
        }
      }
    }

    await page.waitForTimeout(2000)
    console.log('[Publisher] Final URL:', page.url())

    // Save debug screenshot
    await page.screenshot({ path: path.join(__dirname, '..', 'data', 'debug_after_nav.png') })

    // ── IMPORTANT: Switch to 图文 tab if we're on video tab ──
    console.log('[Publisher] Switching to 图文 tab...')

    // Use force click via JS to bypass viewport issues
    const switched = await page.evaluate(() => {
      // Find all elements containing "上传图文" text
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      let node
      while ((node = walker.nextNode())) {
        if (node.textContent && node.textContent.trim() === '上传图文') {
          let el = node.parentElement
          // Try clicking the element and its ancestors
          for (let i = 0; i < 5 && el; i++) {
            try {
              el.click()
              console.log('Clicked element:', el.tagName, el.className)
              return true
            } catch {}
            el = el.parentElement
          }
        }
      }
      return false
    })

    console.log('[Publisher] Switch to 图文:', switched ? 'success' : 'failed, trying force click...')

    if (!switched) {
      // Fallback: try Playwright force click
      try {
        await page.locator('text=上传图文').first().click({ force: true, timeout: 5000 })
        console.log('[Publisher] Force click succeeded')
      } catch {
        // Last resort: navigate with param
        console.log('[Publisher] Trying URL with target=image...')
        await page.goto('https://creator.xiaohongshu.com/publish/publish?from=menu&target=image', {
          waitUntil: 'domcontentloaded', timeout: 15000
        }).catch(() => {})
      }
    }

    await page.waitForTimeout(3000)
    console.log('[Publisher] URL after switching:', page.url())
    await page.screenshot({ path: path.join(__dirname, '..', 'data', 'debug_after_tuwen.png') })

    // ── Step 4: Upload images ──
    setStatus({ phase: 'uploading', message: `上传 ${imageFilenames.length} 张图片...`, progress: 30 })

    // XHS has multiple file inputs: one for images, one for video.
    // Find the one that accepts image formats.
    const allInputs = page.locator('input[type="file"]')
    const inputCount = await allInputs.count()
    console.log('[Publisher] Total file inputs on page:', inputCount)

    let imageInput = null
    for (let i = 0; i < inputCount; i++) {
      const inp = allInputs.nth(i)
      const accept = (await inp.getAttribute('accept')) || ''
      console.log(`[Publisher] Input ${i}: accept="${accept}"`)
      // Match image-accepting input (not video)
      if (accept.includes('image') || accept.includes('jpg') || accept.includes('png') || accept.includes('jpeg')) {
        imageInput = inp
        console.log('[Publisher] Found image input at index', i)
        break
      }
      // If accept is empty, might be the image input (video input explicitly lists video formats)
      if (!accept || accept === '') {
        imageInput = inp
        console.log('[Publisher] Using input with no accept filter at index', i)
        // Don't break — prefer an image-specific one
      }
    }

    if (!imageInput) {
      throw new Error('找不到图片上传入口，请查看 debug_after_nav.png 截图')
    }

    await imageInput.setInputFiles(usedPaths)
    console.log('[Publisher] Images uploaded:', usedPaths.length, 'files')

    // Clean up temp files after successful upload (no local storage needed)
    try { fs.rmSync(TMP_DIR, { recursive: true, force: true }) } catch {}

    // Wait for images to process — XHS needs time to generate previews
    console.log('[Publisher] Waiting for images to process...')
    await page.waitForTimeout(8000)
    await page.screenshot({ path: path.join(__dirname, '..', 'data', 'debug_after_upload.png') })

    // Log what's on the page now
    const pageText = await page.evaluate(() => document.body.innerText.substring(0, 2000))
    console.log('[Publisher] Page text after upload:', pageText.substring(0, 500))

    setStatus({ phase: 'uploading', message: '图片处理完成，开始填写内容...', progress: 50 })

    // ── Step 5: Fill title ──
    // XHS editor typically has a title area after images finish processing
    setStatus({ phase: 'filling', message: '填写标题...', progress: 55 })

    let titleDone = false

    // Use evaluate to find and fill the title input (most reliable for SPAs)
    titleDone = await page.evaluate((text) => {
      // Try various selectors
      const selectors = [
        'input[placeholder*="标题"]',
        '[placeholder*="标题"]',
        '[class*="title"] input',
        '[class*="title"] textarea',
        '[data-testid*="title"]',
      ]
      for (const sel of selectors) {
        const el = document.querySelector(sel)
        if (el) {
          el.focus()
          el.value = text
          el.dispatchEvent(new Event('input', { bubbles: true }))
          el.dispatchEvent(new Event('change', { bubbles: true }))
          return sel
        }
      }
      // Try finding by label text
      const labels = document.querySelectorAll('*')
      for (const el of labels) {
        if (el.textContent === '标题' && el.nextElementSibling) {
          const input = el.nextElementSibling.querySelector('input, textarea, [contenteditable]') || el.nextElementSibling
          input.focus()
          if (input.contentEditable === 'true') {
            input.textContent = text
          } else {
            input.value = text
          }
          input.dispatchEvent(new Event('input', { bubbles: true }))
          return 'via label'
        }
      }
      return null
    }, title)

    console.log('[Publisher] Title fill result:', titleDone || 'FAILED')

    // ── Step 6: Fill body ──
    setStatus({ phase: 'filling', message: '填写正文...', progress: 65 })

    let bodyDone = false
    const bodyText = body.replace(/\n/g, '\n\n')
    bodyDone = await page.evaluate((text) => {
      const selectors = [
        '[placeholder*="正文"]',
        '[placeholder*="内容"]',
        '[class*="editor"] [contenteditable="true"]',
        '[contenteditable="true"]',
        '[class*="content"] textarea',
        'textarea[placeholder*="正文"]',
      ]
      for (const sel of selectors) {
        const el = document.querySelector(sel)
        if (el) {
          el.focus()
          if (el.contentEditable === 'true') {
            el.textContent = text
          } else {
            el.value = text
          }
          el.dispatchEvent(new Event('input', { bubbles: true }))
          return sel
        }
      }
      return null
    }, bodyText)

    console.log('[Publisher] Body fill result:', bodyDone || 'FAILED')

    // If evaluate couldn't fill, try keyboard approach
    if (!bodyDone) {
      console.log('[Publisher] Trying keyboard-based body fill...')
      // Click in the center of the page where the editor usually is
      await page.mouse.click(500, 400)
      await page.waitForTimeout(500)
      const paragraphs = body.split('\n').filter(p => p.trim())
      for (let i = 0; i < paragraphs.length; i++) {
        await page.keyboard.type(paragraphs[i], { delay: 20 })
        if (i < paragraphs.length - 1) {
          await page.keyboard.press('Enter')
          await page.keyboard.press('Enter')
        }
      }
      bodyDone = 'keyboard'
      console.log('[Publisher] Body filled via keyboard')
    }

    // ── Step 7: Add tags ──
    setStatus({ phase: 'filling', message: '添加标签...', progress: 80 })
    if (tags.length > 0) {
      console.log('[Publisher] Adding tags:', tags)

      // Find and click the tag add area
      const tagClicked = await page.evaluate(() => {
        const texts = ['添加标签', '添加话题', '# 话题', '话题标签']
        for (const t of texts) {
          const el = [...document.querySelectorAll('*')].find(e => e.textContent.trim() === t)
          if (el) { el.click(); return t }
        }
        return null
      })
      console.log('[Publisher] Tag button clicked:', tagClicked || 'NOT FOUND')

      if (tagClicked) {
        await page.waitForTimeout(800)
        // Try typing tags
        for (const tag of tags) {
          await page.keyboard.type(tag, { delay: 30 })
          await page.waitForTimeout(400)
          await page.keyboard.press('Enter')
          await page.waitForTimeout(400)
        }
      }
    }

    // Save cookies
    const cookies = await context.cookies()
    saveCookies(cookies)

    // ── Step 8: Screenshot before publish ──
    await page.waitForTimeout(1000)
    await page.screenshot({ path: path.join(__dirname, '..', 'data', 'debug_before_publish.png') })

    // Log final page state
    const finalText = await page.evaluate(() => document.body.innerText.substring(0, 2000))
    console.log('[Publisher] Page text before publish:', finalText.substring(0, 500))

    // ── Step 9: Publish or Save draft ──
    if (draft) {
      setStatus({ phase: 'publishing', message: '保存草稿...', progress: 90 })

      // Find draft/save button
      const draftClicked = await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button, a, span, div')]
        for (const btn of btns) {
          const text = btn.textContent.trim()
          if (text === '存草稿' || text === '保存草稿') {
            btn.click()
            return text
          }
        }
        return null
      })

      console.log('[Publisher] Draft button clicked:', draftClicked || 'NOT FOUND')

      if (draftClicked) {
        // Wait for save to complete — watch for success indicator
        await page.waitForTimeout(3000)
        // Check if save was successful
        const savedIndicator = await page.evaluate(() => {
          return document.body.innerText.includes('保存成功') ||
                 document.body.innerText.includes('已保存') ||
                 document.body.innerText.includes('草稿已保存')
        })
        console.log('[Publisher] Save indicator found:', savedIndicator)
      } else {
        console.log('[Publisher] Draft button not found, keeping browser open for manual save')
        setStatus({ phase: 'error', message: '未找到存草稿按钮，请在浏览器中手动操作' })
      }
    } else {
      setStatus({ phase: 'publishing', message: '发布中...', progress: 90 })
      const publishClicked = await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button, a, span, div')]
        for (const btn of btns) {
          const text = btn.textContent.trim()
          if (text === '发布' || text === '发布笔记') {
            btn.click()
            return text
          }
        }
        return null
      })
      console.log('[Publisher] Publish button clicked:', publishClicked || 'NOT FOUND')
      await page.waitForTimeout(3000)
    }

    setStatus({ phase: 'done', message: draft ? '✅ 草稿流程完成 — 浏览器保持打开' : '✅ 发布流程完成 — 浏览器保持打开', progress: 100 })

    // Save cookies
    const finalCookies = await context.cookies()
    saveCookies(finalCookies)

    // Keep browser open indefinitely — user closes it manually
    console.log('[Publisher] Done. Browser stays open — close it manually when ready.')
    // We DON'T close; the browser process stays alive until user closes the window

  } catch (err) {
    console.error('[Publisher] Error:', err.message)
    try {
      await page.screenshot({ path: path.join(__dirname, '..', 'data', 'debug_error.png') })
      console.log('[Publisher] Error screenshot saved to data/debug_error.png')
    } catch {}
    setStatus({ phase: 'error', message: err.message + ' — 浏览器保持打开，请手动处理' })
    // Keep browser open on error
    console.log('[Publisher] Browser stays open for manual fix. Close it when done.')

  }
  // No finally block — browser stays open until user closes it
  return { success: !currentStatus.message?.includes('Error'), message: currentStatus.message }
}

/**
 * Open a browser for manual login, then save cookies.
 */
export async function manualLogin() {
  console.log('[Publisher] Launching browser for manual login...')

  let browser
  try {
    browser = await chromium.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
    console.log('[Publisher] Browser launched')
  } catch (err) {
    console.error('[Publisher] Failed to launch browser:', err.message)
    throw new Error(
      '浏览器启动失败。请确保已安装 Playwright 浏览器：\n' +
      '运行: npx playwright install chromium'
    )
  }

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  })
  const page = await context.newPage()

  // Go to creator login page
  console.log('[Publisher] Navigating to creator.xiaohongshu.com...')
  await page.goto('https://creator.xiaohongshu.com', {
    waitUntil: 'networkidle',
    timeout: 30000,
  })

  setStatus({ phase: 'logging_in', message: '请在浏览器中扫码登录（3分钟内完成）', progress: 20 })

  console.log('[Publisher] Waiting for user to complete login...')
  console.log('[Publisher] Current URL:', page.url())

  // Wait for user to log in — the page will redirect after successful login
  // We wait up to 3 minutes for the user to scan the QR code
  try {
    await page.waitForFunction(() => {
      // Check if we've navigated into the creator dashboard (login success)
      return window.location.href.includes('creator.xiaohongshu.com') &&
             !window.location.href.includes('login')
    }, { timeout: 180000, polling: 2000 })
    console.log('[Publisher] Login detected!')

  } catch {
    console.error('[Publisher] Login timeout after 3 minutes')
    await browser.close()
    throw new Error('登录超时（3分钟），请在浏览器中重新扫码')
  }

  // Wait a moment for cookies to be fully set
  await page.waitForTimeout(2000)

  const cookies = await context.cookies()
  saveCookies(cookies)
  console.log('[Publisher] Cookies saved,', cookies.length, 'cookies')

  await browser.close()
  console.log('[Publisher] Login flow complete')

  setStatus({ phase: 'done', message: '登录成功，Cookie 已保存', progress: 100, loggedIn: true })
  return { success: true }
}

/**
 * Check if we have valid login cookies.
 */
export function checkLoginStatus() {
  const cookies = loadCookies()
  if (!cookies || cookies.length === 0) {
    return { loggedIn: false }
  }
  // Check if any cookie is expired
  const now = Date.now() / 1000
  const hasValidCookie = cookies.some(c => !c.expires || c.expires > now)
  return { loggedIn: hasValidCookie }
}
