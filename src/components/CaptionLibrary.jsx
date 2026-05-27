import { useState } from 'react'

/**
 * CaptionLibrary — shared component for browsing, creating, editing, deleting captions.
 * Used both in Step 2 (CaptionEditor) and in the global header modal.
 */
export default function CaptionLibrary({ captions, onRefresh, onUse }) {
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
      let res
      if (isNew) {
        res = await fetch('/api/captions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
      } else {
        res = await fetch(`/api/captions?id=${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
      }
      if (!res.ok) {
        const err = await res.text()
        alert('保存失败: ' + (err || res.status))
        return
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
      await fetch(`/api/captions?id=${id}`, { method: 'DELETE' })
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
    <div className="space-y-3">
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
                {onUse && (
                  <button onClick={() => onUse({ title: c.title, body: c.body, tags: c.tags || [], coverIndex: 0 })} className="text-[10px] text-amber-600 hover:text-amber-800 px-1">使用</button>
                )}
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
