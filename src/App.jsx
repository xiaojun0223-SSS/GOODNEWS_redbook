import { useState, useCallback, useEffect } from 'react'
import ImageGrid from './components/ImageGrid'
import CaptionEditor from './components/CaptionEditor'
import PreviewPanel from './components/PreviewPanel'
import CaptionLibrary from './components/CaptionLibrary'

const STEPS = [
  { key: 'select', label: '选择图片', num: 1 },
  { key: 'generate', label: '生成文案', num: 2 },
  { key: 'preview', label: '预览确认', num: 3 },
]

export default function App() {
  const [step, setStep] = useState('select')
  const [images, setImages] = useState([])          // all images from server
  const [selected, setSelected] = useState([])       // selected image objects
  const [caption, setCaption] = useState(null)        // generated caption object
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showCaptionLib, setShowCaptionLib] = useState(false)
  const [captions, setCaptions] = useState([])

  // Store settings
  const [settings, setSettings] = useState({
    storeName: '',
    storeType: '',
  })

  // Fetch images on mount
  const fetchImages = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/images')
      const data = await res.json()
      setImages(data.images)
    } catch (e) {
      setError('无法连接图片服务，请确认后端已启动')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchImages()
  }, [fetchImages])

  // Toggle image selection
  const toggleSelect = (img) => {
    setSelected(prev => {
      const exists = prev.find(s => s.id === img.id)
      if (exists) return prev.filter(s => s.id !== img.id)
      if (prev.length >= 9) return prev // max 9 images per note
      return [...prev, img]
    })
  }

  // Fetch captions when modal opens
  const fetchCaptions = useCallback(async () => {
    try {
      const res = await fetch('/api/captions')
      setCaptions(await res.json())
    } catch {}
  }, [])

  useEffect(() => { fetchCaptions() }, [fetchCaptions])

  // Clear error when changing steps
  const goTo = (s) => {
    setError(null)
    setStep(s)
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Bar */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">📕</span>
            <h1 className="text-base font-semibold text-gray-800">小红书发布助手</h1>
          </div>

          {/* Step Indicator */}
          <nav className="hidden sm:flex items-center gap-1">
            {STEPS.map((s, i) => (
              <div key={s.key} className="flex items-center">
                <button
                  onClick={() => goTo(s.key)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all
                    ${step === s.key
                      ? 'bg-red-50 text-red-600'
                      : 'text-gray-400 hover:text-gray-600'
                    }`}
                >
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold
                    ${step === s.key ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                    {s.num}
                  </span>
                  {s.label}
                </button>
                {i < STEPS.length - 1 && (
                  <span className="w-4 h-px bg-gray-200 mx-0.5" />
                )}
              </div>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={() => { setShowCaptionLib(true); fetchCaptions() }}
              className="btn-secondary text-xs px-3 py-1.5"
            >
              📋 文案库
            </button>
            <button onClick={fetchImages} className="btn-secondary text-xs px-3 py-1.5">
              🔄 刷新
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-6">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Step 1: Select Images */}
        {step === 'select' && (
          <ImageGrid
            images={images}
            selected={selected}
            onToggle={toggleSelect}
            onSetSelected={setSelected}
            onUpload={fetchImages}
            loading={loading}
            onNext={() => {
              if (selected.length === 0) {
                setError('请至少选择一张图片')
                return
              }
              goTo('generate')
            }}
            settings={settings}
            onSettingsChange={setSettings}
          />
        )}

        {/* Step 2: Generate Caption */}
        {step === 'generate' && (
          <CaptionEditor
            selected={selected}
            caption={caption}
            onCaptionChange={setCaption}
            onBack={() => goTo('select')}
            onNext={() => goTo('preview')}
            settings={settings}
          />
        )}

        {/* Step 3: Preview */}
        {step === 'preview' && (
          <PreviewPanel
            selected={selected}
            caption={caption}
            onBack={() => goTo('generate')}
            onCaptionChange={setCaption}
          />
        )}
      </main>

      {/* Caption Library Modal — accessible from any step */}
      {showCaptionLib && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 pb-8 bg-black/40" onClick={() => setShowCaptionLib(false)}>
          <div
            className="card w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto p-5"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-800">📋 文案库</h2>
              <button onClick={() => setShowCaptionLib(false)} className="text-gray-400 hover:text-gray-600 text-xs">关闭</button>
            </div>
            <CaptionLibrary
              captions={captions}
              onRefresh={fetchCaptions}
              onUse={(c) => { setCaption(c); setShowCaptionLib(false) }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
