import { useState, useEffect } from 'react'

export default function PreviewPanel({ selected, caption, onBack }) {
  const [copied, setCopied] = useState(false)
  const [loggedIn, setLoggedIn] = useState(null)     // null = checking, true/false
  const [publishing, setPublishing] = useState(false)
  const [pubStatus, setPubStatus] = useState(null)    // progress message
  const [loginBusy, setLoginBusy] = useState(false)

  // Check login status on mount
  useEffect(() => {
    checkStatus()
    const interval = setInterval(() => {
      if (publishing) checkStatus()
    }, 2000)
    return () => clearInterval(interval)
  }, [publishing])

  const checkStatus = async () => {
    try {
      const res = await fetch('/api/publish/status')
      const data = await res.json()
      setLoggedIn(data.loggedIn)
      if (publishing && data.message) {
        setPubStatus(data)
        if (data.phase === 'done' || data.phase === 'error') {
          setPublishing(false)
        }
      }
    } catch {
      setLoggedIn(false)
    }
  }

  if (!caption) {
    return (
      <div className="card py-20 text-center">
        <p className="text-gray-400 text-sm">请先生成文案</p>
        <button onClick={onBack} className="btn-secondary text-xs mt-3">← 返回</button>
      </div>
    )
  }

  const coverImage = selected[caption.coverIndex || 0]

  const handleCopyAll = async () => {
    const text = `${caption.title}\n\n${caption.body}\n\n${(caption.tags || []).map(t => `#${t}`).join(' ')}`
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleLogin = async () => {
    setLoginBusy(true)
    try {
      const res = await fetch('/api/publish/login', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setLoggedIn(true)
      } else {
        setPubStatus({ phase: 'error', message: data.message || '登录失败' })
      }
    } catch (err) {
      setPubStatus({ phase: 'error', message: '登录请求失败：' + err.message })
    } finally {
      setLoginBusy(false)
    }
  }

  const handlePublish = async (draft = false) => {
    setPublishing(true)
    setPubStatus({ phase: 'starting', message: '启动中...', progress: 0 })

    try {
      const body = {
        imageFilenames: selected.map(s => s.filename),
        title: caption.title,
        body: caption.body,
        tags: caption.tags,
        coverIndex: caption.coverIndex || 0,
        draft,
      }
      await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch (err) {
      setPubStatus({ phase: 'error', message: err.message })
      setPublishing(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Phone Mockup */}
      <div className="card overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">📱 小红书预览</h3>
          <span className="text-[10px] text-gray-400">发布前最终确认</span>
        </div>

        <div className="p-5 space-y-5">
          <div className="max-w-sm mx-auto">
            <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-gray-100 mb-3">
              {coverImage ? (
                <img src={coverImage.url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-300">封面图</div>
              )}
              <div className="absolute top-3 right-3 bg-black/50 text-white text-[10px] px-2 py-0.5 rounded-full backdrop-blur-sm">
                1/{selected.length}
              </div>
            </div>

            <h3 className="text-base font-bold text-gray-900 mb-2 leading-snug">
              {caption.title || '（未填写标题）'}
            </h3>

            <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line line-clamp-5">
              {caption.body || '（未填写正文）'}
            </p>

            <div className="flex flex-wrap gap-1.5 mt-3">
              {(caption.tags || []).map((tag, i) => (
                <span key={i} className="text-xs text-blue-500">#{tag}</span>
              ))}
            </div>

            <div className="flex items-center gap-4 mt-4 pt-3 border-t border-gray-50">
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
                点赞
              </span>
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                评论
              </span>
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="8.59" y1="10.49" x2="15.42" y2="6.51" /></svg>
                分享
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* All Images */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">全部图片 ({selected.length} 张)</h3>
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
          {selected.map((img, i) => (
            <div key={img.id} className="relative">
              <img src={img.url} alt="" className="w-full aspect-square rounded-lg object-cover border-2 border-gray-100" />
              {i === (caption.coverIndex || 0) && (
                <span className="absolute top-1 left-1 bg-red-500 text-white text-[9px] px-1.5 py-0.5 rounded-full">封面</span>
              )}
              <span className="absolute bottom-1 right-1 bg-black/50 text-white text-[9px] w-4 h-4 rounded-full flex items-center justify-center">{i + 1}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Publish Section */}
      <div className="card p-5 space-y-4">
        {/* Login Status */}
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${loggedIn === true ? 'bg-green-500' : loggedIn === false ? 'bg-red-400' : 'bg-gray-300 animate-pulse'}`} />
            <span className="text-xs text-gray-600">
              {loggedIn === null ? '检测登录状态...' : loggedIn ? '已登录小红书创作者中心' : '未登录'}
            </span>
          </div>
          {!loggedIn && (
            <button onClick={handleLogin} disabled={loginBusy} className="btn-secondary text-xs py-1.5 px-3">
              {loginBusy ? '浏览器弹出中...' : '🔐 扫码登录'}
            </button>
          )}
        </div>

        {/* Publishing Progress */}
        {publishing && pubStatus && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-blue-700 font-medium">{pubStatus.message}</span>
              <span className="text-blue-400">{pubStatus.progress}%</span>
            </div>
            <div className="w-full h-1.5 bg-blue-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-500"
                style={{ width: `${pubStatus.progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Error */}
        {pubStatus?.phase === 'error' && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-xs text-red-700">{pubStatus.message}</p>
          </div>
        )}

        {/* Success */}
        {pubStatus?.phase === 'done' && !publishing && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-xs text-green-700">✅ {pubStatus.message}</p>
            <p className="text-[10px] text-green-500 mt-1">请打开浏览器窗口确认发布结果</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <button onClick={handleCopyAll} className="btn-secondary text-xs">
              {copied ? '✅ 已复制' : '📋 复制全部文案'}
            </button>
            <button
              onClick={() => handlePublish(true)}
              disabled={!loggedIn || publishing}
              className="btn-secondary text-xs"
            >
              💾 保存草稿
            </button>
          </div>

          <button
            onClick={() => handlePublish(false)}
            disabled={!loggedIn || publishing}
            className="btn-primary w-full text-sm py-3"
          >
            {publishing ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
                发布中...
              </span>
            ) : (
              '🚀 一键发布到小红书'
            )}
          </button>
        </div>

        {/* First-time hint */}
        {loggedIn === false && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-xs text-amber-800">
              <strong>首次使用：</strong>点击「扫码登录」，在弹出的浏览器中扫码登录小红书创作者平台。登录后 Cookie 会自动保存，后续无需重复登录。
            </p>
          </div>
        )}
      </div>

      {/* Checklist */}
      <div className="card p-4">
        <p className="text-xs text-gray-500 font-medium mb-2">⚠️ 发布前确认：</p>
        <ul className="text-xs text-gray-400 space-y-1 list-disc list-inside">
          <li>标题是否吸引点击率</li>
          <li>正文是否有错别字或语病</li>
          <li>标签是否覆盖了目标人群</li>
          <li>封面图是否为最佳展示</li>
        </ul>
      </div>

      <div className="flex justify-center pb-8">
        <button onClick={onBack} className="btn-secondary text-xs">← 返回编辑文案</button>
      </div>
    </div>
  )
}
