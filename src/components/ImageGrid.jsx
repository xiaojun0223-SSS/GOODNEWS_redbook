import { useRef, useState } from 'react'

export default function ImageGrid({
  images,
  selected,
  onToggle,
  onUpload,
  onSetSelected,
  loading,
  onNext,
  settings,
  onSettingsChange,
}) {
  const fileRef = useRef(null)
  const [randomCount, setRandomCount] = useState(6)
  const [randomBusy, setRandomBusy] = useState(false)

  const handleUpload = async (e) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    const form = new FormData()
    for (const f of files) form.append('images', f)
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: form })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        onUpload()
      } else {
        console.error('Upload failed:', data)
        alert('上传失败: ' + (data.error || res.status))
      }
    } catch (err) {
      console.error('Upload failed:', err)
      alert('上传失败: ' + err.message)
    }
  }

  // Clear all selections
  const handleClear = () => {
    if (onSetSelected) onSetSelected([])
  }

  // Randomly pick images
  const handleRandomPick = async () => {
    setRandomBusy(true)
    try {
      const res = await fetch(`/api/images/random?n=${randomCount}`)
      const data = await res.json()
      if (onSetSelected) onSetSelected(data.images)
    } catch (err) {
      console.error('Random pick failed:', err)
    } finally {
      setRandomBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Settings Card */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">店铺信息（用于生成更精准的文案）</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">店铺名称</label>
            <input
              type="text"
              value={settings.storeName}
              onChange={e => onSettingsChange({ ...settings, storeName: e.target.value })}
              placeholder="如：花间集·生活美学馆"
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">店铺类型</label>
            <input
              type="text"
              value={settings.storeType}
              onChange={e => onSettingsChange({ ...settings, storeType: e.target.value })}
              placeholder="如：花店 / 咖啡店 / 服装店"
              className="input-field"
            />
          </div>
        </div>
      </div>

      {/* Random Pick Bar */}
      <div className="card p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-medium text-gray-600 shrink-0">🎲 随机挑选</span>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={1}
              max={Math.max(images.length, 1)}
              value={randomCount}
              onChange={e => {
                const raw = e.target.value
                if (raw === '') { setRandomCount(1); return }
                const n = parseInt(raw, 10)
                if (isNaN(n)) return
                setRandomCount(Math.max(1, Math.min(n, images.length || 1)))
              }}
              className="w-16 px-2.5 py-2 rounded-lg border border-gray-200 text-xs text-center focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400"
            />
            <span className="text-xs text-gray-400">张</span>
          </div>
          <button
            onClick={handleRandomPick}
            disabled={randomBusy || images.length === 0}
            className="btn-secondary text-xs py-2 px-4"
          >
            🎲 随机挑图
          </button>
          {selected.length > 0 && (
            <button onClick={handleClear} className="text-xs text-gray-400 hover:text-red-500 transition-colors ml-auto">
              清除选择
            </button>
          )}
        </div>
        {images.length > 0 && (
          <p className="text-[10px] text-gray-400 mt-2">
            从 {images.length} 张图片中随机选 {Math.min(randomCount, images.length)} 张，也可手动点选
          </p>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-gray-800">
            图片库
            <span className="text-gray-400 font-normal text-sm ml-2">{images.length} 张</span>
          </h2>
          {selected.length > 0 && (
            <span className="text-xs text-red-500 bg-red-50 px-2.5 py-1 rounded-full font-medium">
              已选 {selected.length} 张
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleUpload} className="hidden" />
          <button onClick={() => fileRef.current?.click()} className="btn-secondary text-xs">
            📤 上传图片
          </button>
          <button onClick={onNext} disabled={selected.length === 0} className="btn-primary text-xs">
            下一步：生成文案 →
          </button>
        </div>
      </div>

      {/* Image Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400 text-sm">加载中...</div>
      ) : images.length === 0 ? (
        <div className="card py-20 text-center">
          <p className="text-4xl mb-4">📷</p>
          <p className="text-gray-400 text-sm mb-2">图片库为空</p>
          <p className="text-gray-300 text-xs mb-4">点击「上传图片」或将图片放入 public/images 文件夹</p>
          <button onClick={() => fileRef.current?.click()} className="btn-primary text-xs">
            📤 上传第一张图片
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {images.map((img) => {
            const isSelected = selected.some(s => s.id === img.id)
            return (
              <div
                key={img.id}
                onClick={() => onToggle(img)}
                className={`group relative aspect-square rounded-xl overflow-hidden bg-gray-100 cursor-pointer
                  ring-2 transition-all duration-200 active:scale-[0.98]
                  ${isSelected ? 'ring-red-500 shadow-md' : 'ring-transparent hover:ring-gray-200'}`}
              >
                <img
                  src={img.url}
                  alt={img.filename}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />

                <div className={`checkbox-custom ${isSelected ? 'checked' : 'opacity-0 group-hover:opacity-100'}`}>
                  {isSelected && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>

                {isSelected && (
                  <div className="absolute top-2 left-2 w-6 h-6 rounded-lg bg-white/90 flex items-center justify-center text-xs font-bold text-red-500 shadow-sm z-10">
                    {selected.findIndex(s => s.id === img.id) + 1}
                  </div>
                )}

                {/* Delete button */}
                <button
                  onClick={async (e) => {
                    e.stopPropagation()
                    if (!confirm(`确定删除 ${img.filename}？`)) return
                    await fetch(`/api/images/${encodeURIComponent(img.filename)}`, { method: 'DELETE' })
                    onUpload() // refresh
                  }}
                  className="absolute top-2 right-8 w-6 h-6 rounded-lg bg-red-500/80 hover:bg-red-500 flex items-center justify-center
                             opacity-0 group-hover:opacity-100 transition-opacity z-10"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" />
                  </svg>
                </button>

                <div className="absolute bottom-0 inset-x-0 p-2 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-[10px] text-white/90 truncate">{img.filename}</p>
                  <p className="text-[9px] text-white/60">{img.sizeFormatted}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Bottom bar */}
      {selected.length > 0 && (
        <div className="sticky bottom-4 card p-4 flex items-center justify-between shadow-lg border-red-100">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-700">已选择 {selected.length} 张图片</span>
            <div className="flex -space-x-2">
              {selected.slice(0, 5).map((s, i) => (
                <img key={s.id} src={s.url} alt="" className="w-8 h-8 rounded-lg object-cover border-2 border-white shadow-sm" />
              ))}
              {selected.length > 5 && (
                <div className="w-8 h-8 rounded-lg bg-gray-200 border-2 border-white flex items-center justify-center text-[10px] text-gray-500">
                  +{selected.length - 5}
                </div>
              )}
            </div>
          </div>
          <button onClick={onNext} className="btn-primary">下一步：生成文案 →</button>
        </div>
      )}
    </div>
  )
}
