/**
 * AI Caption Generation Module
 *
 * Supports three modes:
 * 1. DeepSeek API (推荐，兼容 OpenAI 格式，性价比高)
 * 2. Anthropic API
 * 3. Manual prompt (复制后手动发给任意 AI)
 */

/**
 * Build a Xiaohongshu-style caption prompt.
 */
export function buildCaptionPrompt({ storeName, storeType, imageCount }) {
  const context = []
  if (storeName) context.push(`店铺名称：${storeName}`)
  if (storeType) context.push(`店铺类型：${storeType}`)

  return `你是一个专业的小红书内容创作者，为一家实体店铺撰写小红书笔记文案。

${context.length > 0 ? `【店铺信息】\n${context.join('\n')}\n` : ''}
【任务】
根据上传的 ${imageCount} 张图片，生成一篇小红书风格的种草笔记文案。

【输出格式】
请严格按以下 JSON 格式输出（不要包含其他文字，不要用 markdown 代码块包裹）：

{
  "title": "笔记标题（20字以内，吸引眼球，可加emoji）",
  "body": "正文内容（200-400字，自然分段，每段2-3行，语气亲切真实，像朋友推荐。包含个人体验、店铺亮点、实用信息）",
  "tags": ["标签1", "标签2", "标签3", "标签4", "标签5"],
  "coverIndex": 0
}

【标题要求】
- 使用小红书流行句式，如「谁懂啊…」「不允许还有人不知道…」「被…治愈了」
- 包含emoji但不过度（1-2个）
- 制造悬念或共鸣

【正文要求】
- 第一段：吸引人的开头，制造场景感
- 中间段：具体描述（产品/环境/体验细节）
- 最后段：互动引导，如「姐妹们快去」「真的会被惊艳到」
- 适当使用「真的」「超级」「太…了」等口语化表达
- 每段之间空一行

【标签要求】
- 包含店铺类型相关标签
- 包含地理位置相关标签
- 包含小红书热门品类标签
- 5-8个标签

【封面建议】
- coverIndex 表示 0-based 索引，推荐哪张图做封面`
}

/**
 * Convert image URL to base64 data URL.
 */
async function imageToBase64(url) {
  const response = await fetch(url)
  const blob = await response.blob()
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  const base64 = btoa(binary)
  const mediaType = blob.type || 'image/jpeg'
  return `data:${mediaType};base64,${base64}`
}

/**
 * Extract JSON object from AI response text.
 */
function extractJSON(text) {
  // Remove markdown code fences if present
  let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
  const match = cleaned.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('AI 返回的内容中没有找到 JSON 格式，请重试')
  return JSON.parse(match[0])
}

// ─── DeepSeek API ────────────────────────────────────────────

/**
 * Generate caption via DeepSeek API.
 * NOTE: deepseek-chat currently supports text-only (no image input).
 * For image-aware generation, use Anthropic or the manual prompt mode.
 */
export async function generateViaDeepSeek({ images, storeName, storeType, apiKey }) {
  if (!apiKey) throw new Error('请提供 DeepSeek API Key')

  // Build a text-only prompt — describe the image context without sending images
  const context = []
  if (storeName) context.push(`店铺名称：${storeName}`)
  if (storeType) context.push(`店铺类型：${storeType}`)

  const textPrompt = `你是一个专业的小红书内容创作者，为一家实体店铺撰写小红书笔记文案。

${context.length > 0 ? `【店铺信息】\n${context.join('\n')}\n` : ''}
【任务】
为${storeName || '这家店铺'}撰写一篇小红书风格的种草笔记文案（${images.length} 张配图）。

【输出格式】
请严格按以下 JSON 格式输出（不要包含 markdown 代码块）：

{
  "title": "笔记标题（20字以内，吸引眼球）",
  "body": "正文内容（200-400字，自然分段。包含店铺特色、体验感受、实用信息）",
  "tags": ["标签1", "标签2", "标签3", "标签4", "标签5"],
  "coverIndex": 0
}

【风格要求】
- 标题用小红书流行句式
- 正文口语化，像朋友推荐
- 5-8个标签
- 每段之间空一行`

  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      max_tokens: 2000,
      temperature: 0.8,
      messages: [{ role: 'user', content: textPrompt }],
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `DeepSeek API error: ${res.status}`)
  }

  const data = await res.json()
  const text = data.choices[0].message.content
  const result = extractJSON(text)

  return {
    title: result.title || '',
    body: result.body || '',
    tags: result.tags || [],
    coverIndex: result.coverIndex || 0,
  }
}

// ─── Anthropic API ───────────────────────────────────────────

/**
 * Generate caption via Anthropic API.
 */
export async function generateViaAnthropic({ images, storeName, storeType, apiKey }) {
  if (!apiKey) throw new Error('请提供 Anthropic API Key')

  const prompt = buildCaptionPrompt({ storeName, storeType, imageCount: images.length })
  const content = []

  for (const img of images) {
    try {
      const dataUrl = await imageToBase64(img.url)
      // Anthropic expects raw base64, strip the data URL prefix
      const [header, base64] = dataUrl.split(',')
      const mediaType = header.match(/data:(.*);base64/)?.[1] || 'image/jpeg'

      content.push({
        type: 'image',
        source: { type: 'base64', media_type: mediaType, data: base64 },
      })
    } catch (err) {
      console.error(`Failed to load image ${img.filename}:`, err)
    }
  }

  content.push({ type: 'text', text: prompt })

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content }],
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `Anthropic API error: ${res.status}`)
  }

  const data = await res.json()
  const text = data.content[0].text
  const result = extractJSON(text)

  return {
    title: result.title || '',
    body: result.body || '',
    tags: result.tags || [],
    coverIndex: result.coverIndex || 0,
  }
}

// ─── Unified entry point ─────────────────────────────────────

/**
 * Generate caption using the specified provider.
 * @param {'deepseek'|'anthropic'} provider
 */
export async function generateCaption({ provider, images, storeName, storeType, apiKey }) {
  if (provider === 'deepseek') {
    return generateViaDeepSeek({ images, storeName, storeType, apiKey })
  }
  if (provider === 'anthropic') {
    return generateViaAnthropic({ images, storeName, storeType, apiKey })
  }
  throw new Error(`Unknown provider: ${provider}`)
}

// ─── Manual prompt ───────────────────────────────────────────

export function generateManualPrompt({ images, storeName, storeType }) {
  const prompt = buildCaptionPrompt({ storeName, storeType, imageCount: images.length })

  let full = `${prompt}

---
📸 图片如下（共 ${images.length} 张）：

`
  images.forEach((img, i) => {
    full += `\n[图${i + 1}] ${img.filename}\n`
  })

  full += `
---
请将以上图片和这段 prompt 一起发送给 AI（Claude / DeepSeek / ChatGPT），
然后将返回的 JSON 结果粘贴到工具的编辑器中即可。`

  return full
}
