import { useState, useEffect, useRef } from 'react'
import { generateCaption, generateManualPrompt } from '../lib/ai'

export default function CaptionEditor({
  selected,
  caption,
  onCaptionChange,
  onBack,
  onNext,
  settings,
}) {
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState(null)
  const [apiKey, setApiKey] = useState('')
  const [provider, setProvider] = useState('deepseek')
  const [showKeyInput, setShowKeyInput] = useState(false)
  const [copied, setCopied] = useState(false)
  const generatedRef = useRef(null)

  // Caption library
  const [captions, setCaptions] = useState([])
  const [showLib, setShowLib] = useState(false)
  const [showLibInline, setShowLibInline] = useState(false)

  useEffect(() => {
    fetch('/api/captions').then(r => r.json()).then(setCaptions).catch(() => {})
  }, [])

  // Random pick from caption library
  const handleRandomCaption = async () => {
    try {
      const res = await fetch('/api/captions/random?n=1')
      const data = await res.json()
      if (data.length > 0) {
        onCaptionChange({
          title: data[0].title,
          body: data[0].body,
          tags: data[0].tags || [],
          coverIndex: 0,
        })
      }
    } catch (err) {
      setGenError('随机获取文案失败')
    }
  }

  const handleGenerateAPI = async () => {
    if (!apiKey.trim()) {
      setGenError('请输入 API Key')
      return
    }
    setGenerating(true)
    setGenError(null)
    try {
      const result = await generateCaption({
        provider,
        images: selected,
        storeName: settings.storeName,
        storeType: settings.storeType,
        apiKey: apiKey.trim(),
      })
      onCaptionChange(result)
    } catch (err) {
      setGenError(err.message || '生成失败，请重试')
    } finally {
      setGenerating(false)
    }
  }

  const handleGenerateManual = () => {
    const prompt = generateManualPrompt({
      images: selected,
      storeName: settings.storeName,
      storeType: settings.storeType,
    })
    onCaptionChange({ title: '', body: '', tags: [], coverIndex: 0 })
    generatedRef.current = prompt
    setTimeout(() => {
      generatedRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 100)
  }

  const handleCopy = async () => {
    if (generatedRef.current) {
      await navigator.clipboard.writeText(generatedRef.current)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const update = (field, value) => {
    onCaptionChange({ ...(caption || {}), [field]: value })
  }

  const providerInfo = {
    deepseek: {
      name: 'DeepSeek',
      placeholder: '输入 DeepSeek API Key（sk-...）',
      getUrl: 'platform.deepseek.com/api_keys',
      badge: '文本生成',
      note: '仅文本，不会分析图片内容',
    },
    anthropic: {
      name: 'Anthropic',
      placeholder: '输入 Anthropic API Key（sk-ant-...）',
      getUrl: 'console.anthropic.com',
      badge: '图片理解',
      note: '会分析图片内容，生成更贴合的文案',
    },
  }

  const currentProvider = providerInfo[provider]

  return (
    <div className="space-y-6">
      {/* Selected Images Preview */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          已选图片 ({selected.length} 张)
        </h3>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {selected.map((img, i) => (
            <div key={img.id} className="relative shrink-0">
              <img
                src={img.url}
                alt={img.filename}
                className="w-20 h-20 rounded-lg object-cover border-2 border-gray-100"
              />
              <span className="absolute bottom-0.5 right-0.5 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded-full">
                {i + 1}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Generation Panel */}
      {!caption?.title && !generatedRef.current && (
        <div className="card p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-2">AI 生成文案</h2>
          <p className="text-sm text-gray-400 mb-4">
            选择 API 服务商自动生成，或从文案库随机选取
          </p>

          {/* Random Caption Button + Library */}
          <div className="mb-5 p-4 bg-amber-50 rounded-xl border border-amber-100">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="text-sm font-medium text-amber-800">🎲 从文案库随机挑选</h3>
                <p className="text-[11px] text-amber-600 mt-0.5">库内 {captions.length} 条文案，随机选一条</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowLib(!showLib)} className="text-xs text-amber-700 hover:text-amber-900 underline">
                  {showLib ? '收起' : '管理文案库'}
                </button>
                <button
                  onClick={handleRandomCaption}
                  disabled={captions.length === 0}
                  className="btn-primary text-xs bg-amber-500 hover:bg-amber-600 active:bg-amber-700"
                >
                  🎲 随机挑文案
                </button>
              </div>
            </div>

            {/* Caption Library Manager */}
            {showLib && <CaptionLibrary captions={captions} onRefresh={() => {
              fetch('/api/captions').then(r => r.json()).then(setCaptions)
            }} onUse={onCaptionChange} />}
          </div>

          {genError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {genError}
            </div>
          )}

          {/* API Mode */}
          <div className="mb-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-gray-700">
                🤖 方式一：API 自动生成
              </h3>
              <button
                onClick={() => setShowKeyInput(!showKeyInput)}
                className="text-xs text-red-500 hover:text-red-600"
              >
                {showKeyInput ? '收起' : '配置 API Key'}
              </button>
            </div>

            {/* Provider Selector */}
            <div className="flex gap-2 mb-2">
              {Object.entries(providerInfo).map(([key, info]) => (
                <button
                  key={key}
                  onClick={() => { setProvider(key); setGenError(null) }}
                  className={`flex-1 py-2.5 px-3 rounded-lg text-xs font-medium border transition-all
                    ${provider === key
                      ? 'bg-white border-red-300 text-red-600 shadow-sm'
                      : 'bg-transparent border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                >
                  {info.name}
                  <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full
                    ${provider === key ? 'bg-red-100 text-red-500' : 'bg-gray-100 text-gray-400'}`}>
                    {info.badge}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 mb-4 leading-relaxed">
              {currentProvider.note}
            </p>

            {showKeyInput && (
              <div className="space-y-3 mb-3">
                <input
                  type="password"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder={currentProvider.placeholder}
                  className="input-field text-xs font-mono"
                />
                <p className="text-[11px] text-gray-400">
                  Key 仅在浏览器内存中使用，不会存储。
                  获取地址：{currentProvider.getUrl}
                </p>
              </div>
            )}

            <button
              onClick={handleGenerateAPI}
              disabled={generating}
              className="btn-primary w-full"
            >
              {generating ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  {currentProvider.name} 正在分析图片并生成文案...
                </span>
              ) : (
                `🚀 使用 ${currentProvider.name} 生成文案`
              )}
            </button>
          </div>

          {/* Manual Mode */}
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
            <h3 className="text-sm font-medium text-gray-700 mb-2">
              📋 方式二：手动生成 Prompt
            </h3>
            <p className="text-xs text-gray-400 mb-3">
              生成完整 prompt，复制后发送给任意 AI（Claude / DeepSeek / ChatGPT）
            </p>
            <button onClick={handleGenerateManual} className="btn-secondary w-full text-xs">
              生成 Prompt 文本
            </button>
          </div>
        </div>
      )}

      {/* Generated Prompt (manual mode) */}
      {generatedRef.current && !caption?.title && (
        <div ref={generatedRef} className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">📋 已生成 Prompt</h3>
            <button onClick={handleCopy} className="btn-secondary text-xs py-1.5 px-3">
              {copied ? '✅ 已复制' : '📋 复制全文'}
            </button>
          </div>
          <pre className="bg-gray-50 rounded-lg p-4 text-xs text-gray-600 whitespace-pre-wrap font-mono leading-relaxed max-h-96 overflow-y-auto">
            {generatedRef.current}
          </pre>
          <p className="mt-4 text-xs text-gray-400">
            将以上内容连同图片一起发送给 AI，然后将返回的 JSON 粘贴到下方编辑器
          </p>
          <div className="mt-3">
            <button
              onClick={() => {
                generatedRef.current = null
                onCaptionChange({ title: '', body: '', tags: [], coverIndex: 0 })
              }}
              className="btn-secondary text-xs"
            >
              手动填写文案
            </button>
          </div>
        </div>
      )}

      {/* Caption Editor */}
      {caption && (
        <div className="space-y-4">
          {/* Re-roll bar */}
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={handleRandomCaption} className="btn-secondary text-xs py-1.5">
              🎲 重新随机
            </button>
            <button
              onClick={() => setShowLibInline(!showLibInline)}
              className="btn-secondary text-xs py-1.5"
            >
              📋 从文案库选择
            </button>
          </div>

          {/* Inline library browser */}
          {showLibInline && (
            <div className="card p-4 bg-amber-50/50 border-amber-100">
              <CaptionLibrary captions={captions} onRefresh={() => {
                fetch('/api/captions').then(r => r.json()).then(setCaptions)
              }} onUse={(c) => { onCaptionChange(c); setShowLibInline(false) }} />
            </div>
          )}

          <div className="card p-5">
            <label className="block text-xs text-gray-500 mb-2 font-medium">📌 笔记标题</label>
            <input
              type="text"
              value={caption.title || ''}
              onChange={e => update('title', e.target.value)}
              placeholder="输入标题..."
              className="input-field text-base font-medium"
              maxLength={40}
            />
            <p className="text-[10px] text-gray-400 mt-1 text-right">
              {caption.title?.length || 0}/40
            </p>
          </div>

          <div className="card p-5">
            <label className="block text-xs text-gray-500 mb-2 font-medium">📝 正文</label>
            <textarea
              value={caption.body || ''}
              onChange={e => update('body', e.target.value)}
              placeholder="输入正文..."
              className="input-field min-h-[200px] resize-y leading-relaxed"
              rows={10}
            />
            <p className="text-[10px] text-gray-400 mt-1 text-right">
              {caption.body?.length || 0} 字
            </p>
          </div>

          <div className="card p-5">
            <label className="block text-xs text-gray-500 mb-2 font-medium">🏷️ 标签</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {(caption.tags || []).map((tag, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-50 text-red-600 text-xs rounded-full">
                  # {tag}
                  <button
                    onClick={() => {
                      const newTags = [...(caption.tags || [])]
                      newTags.splice(i, 1)
                      update('tags', newTags)
                    }}
                    className="text-red-400 hover:text-red-600 ml-0.5"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <input
              type="text"
              placeholder="输入标签后按 Enter 添加..."
              className="input-field text-xs"
              onKeyDown={e => {
                if (e.key === 'Enter' && e.target.value.trim()) {
                  e.preventDefault()
                  update('tags', [...(caption.tags || []), e.target.value.trim()])
                  e.target.value = ''
                }
              }}
            />
            <p className="text-[10px] text-gray-400 mt-1">
              按 Enter 添加，建议 5-8 个标签
            </p>
          </div>

          <div className="card p-5">
            <label className="block text-xs text-gray-500 mb-3 font-medium">🖼️ 选择封面图</label>
            <div className="flex gap-3 flex-wrap">
              {selected.map((img, i) => (
                <button
                  key={img.id}
                  onClick={() => update('coverIndex', i)}
                  className={`relative w-16 h-16 rounded-lg overflow-hidden border-2 transition-all
                    ${caption.coverIndex === i ? 'border-red-500 ring-2 ring-red-100' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <img src={img.url} alt="" className="w-full h-full object-cover" />
                  {caption.coverIndex === i && (
                    <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center">
                      <span className="text-white text-[10px] font-bold">封面</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-100">
        <button onClick={onBack} className="btn-secondary text-xs">
          ← 返回选图
        </button>
        <button
          onClick={onNext}
          disabled={!caption?.title}
          className="btn-primary"
        >
          下一步：预览确认 →
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Caption Library Manager
// ═══════════════════════════════════════════════════════════════

function CaptionLibrary({ captions, onRefresh, onUse }) {
  const [editingId, setEditingId] = useState(null)
  const [isNew, setIsNew] = useState(false)
  const [form, setForm] = useState({ title: '', body: '', tags: [] })

  const startEdit = (c) => {
    setEditingId(c.id)
    setIsNew(false)
    setForm({ title: c.title, body: c.body, tags: [...(c.tags || [])] })
  }

  const startNew = () => {
    setEditingId(null)
    setIsNew(true)
    setForm({ title: '', body: '', tags: [] })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setIsNew(false)
    setForm({ title: '', body: '', tags: [] })
  }

  const handleSave = async () => {
    if (!form.title.trim() && !form.body.trim()) return
    try {
      if (isNew) {
        await fetch('/api/captions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
      } else {
        await fetch(`/api/captions/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
      }
      cancelEdit()
      onRefresh()
    } catch (err) {
      console.error('Save failed:', err)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('确定删除这条文案？')) return
    try {
      await fetch(`/api/captions/${id}`, { method: 'DELETE' })
      onRefresh()
    } catch (err) {
      console.error('Delete failed:', err)
    }
  }

  const addTag = (e) => {
    if (e.key === 'Enter' && e.target.value.trim()) {
      e.preventDefault()
      setForm({ ...form, tags: [...form.tags, e.target.value.trim()] })
      e.target.value = ''
    }
  }

  const removeTag = (idx) => {
    setForm({ ...form, tags: form.tags.filter((_, i) => i !== idx) })
  }

  return (
    <div className="mt-4 pt-4 border-t border-amber-200 space-y-3">
      {!isNew && !editingId && (
        <button onClick={startNew} className="btn-secondary text-xs w-full py-2">
          ＋ 新建文案
        </button>
      )}

      {(isNew || editingId) && (
        <div className="p-3 bg-white rounded-lg border border-amber-200 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-amber-800">
              {isNew ? '✏️ 新建文案' : '✏️ 编辑文案'}
            </h4>
            <button onClick={cancelEdit} className="text-[10px] text-gray-400 hover:text-gray-600">取消</button>
          </div>
          <input
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
            placeholder="标题"
            className="input-field text-xs"
          />
          <textarea
            value={form.body}
            onChange={e => setForm({ ...form, body: e.target.value })}
            placeholder="正文（段落用换行分隔）"
            rows={5}
            className="input-field text-xs resize-y"
          />
          <div>
            <div className="flex flex-wrap gap-1 mb-2">
              {form.tags.map((t, i) => (
                <span key={i} className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                  #{t}
                  <button onClick={() => removeTag(i)} className="text-amber-400 hover:text-amber-600">×</button>
                </span>
              ))}
            </div>
            <input
              placeholder="输入标签按 Enter 添加"
              onKeyDown={addTag}
              className="input-field text-[10px]"
            />
          </div>
          <button onClick={handleSave} className="btn-primary text-xs w-full py-2">
            💾 保存
          </button>
        </div>
      )}

      {captions.length === 0 && !isNew ? (
        <p className="text-xs text-amber-500 text-center py-4">文案库为空，点上方「新建文案」添加</p>
      ) : (
        <div className="space-y-1.5 max-h-80 overflow-y-auto">
          {captions.map((c, i) => (
            <div key={c.id} className="flex items-start gap-2 p-2 bg-white rounded-lg border border-amber-100 hover:border-amber-200 transition-colors">
              <span className="text-[10px] text-amber-300 font-mono shrink-0 mt-0.5 w-5">#{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-700 truncate">{c.title}</p>
                <p className="text-[10px] text-gray-400 truncate">{c.body.substring(0, 40)}...</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(c.tags || []).slice(0, 3).map((t, j) => (
                    <span key={j} className="text-[9px] text-amber-500">#{t}</span>
                  ))}
                  {(c.tags || []).length > 3 && <span className="text-[9px] text-amber-300">+{c.tags.length - 3}</span>}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => onUse({ title: c.title, body: c.body, tags: c.tags || [], coverIndex: 0 })} className="text-[10px] text-amber-600 hover:text-amber-800 px-1">使用</button>
                <button onClick={() => startEdit(c)} className="text-[10px] text-gray-400 hover:text-gray-600 px-1">编辑</button>
                <button onClick={() => handleDelete(c.id)} className="text-[10px] text-red-300 hover:text-red-500 px-1">删</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
