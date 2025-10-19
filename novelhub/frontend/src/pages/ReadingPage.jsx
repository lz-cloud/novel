import React, { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'

export default function ReadingPage() {
  const { id } = useParams()
  const [novel, setNovel] = useState(null)
  const [chapters, setChapters] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [content, setContent] = useState('')

  const load = async () => {
    const n = await axios.get(`/api/novels/${id}`)
    setNovel(n.data)
    const cs = await axios.get(`/api/novels/${id}/chapters`)
    setChapters(cs.data)
    if (cs.data.length) {
      setActiveId(cs.data[0].id)
    }
  }

  const loadChapter = async (cid) => {
    const { data } = await axios.get(`/api/chapters/${cid}`)
    setContent(data.content)
  }

  useEffect(() => {
    load()
  }, [id])

  useEffect(() => {
    if (activeId) loadChapter(activeId)
  }, [activeId])

  const index = useMemo(() => chapters.findIndex(c => c.id === activeId), [chapters, activeId])
  const prevId = index > 0 ? chapters[index - 1]?.id : null
  const nextId = index >= 0 && index < chapters.length - 1 ? chapters[index + 1]?.id : null

  return (
    <div className="container py-6">
      {novel && <h1 className="text-2xl font-bold mb-2">{novel.title}</h1>}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-1 border rounded bg-white">
          <div className="p-3 border-b font-semibold">目录</div>
          <ul>
            {chapters.map(ch => (
              <li key={ch.id} className={`px-3 py-2 border-b cursor-pointer ${activeId === ch.id ? 'bg-slate-100' : ''}`} onClick={() => setActiveId(ch.id)}>
                {ch.order}. {ch.title}
              </li>
            ))}
          </ul>
        </div>
        <div className="md:col-span-3 bg-white border rounded p-4 prose max-w-none">
          <div dangerouslySetInnerHTML={{ __html: content }} />
          <div className="mt-6 flex justify-between">
            <button disabled={!prevId} onClick={() => setActiveId(prevId)} className="px-3 py-2 rounded bg-slate-200 disabled:opacity-50">上一章</button>
            <button disabled={!nextId} onClick={() => setActiveId(nextId)} className="px-3 py-2 rounded bg-slate-800 text-white disabled:opacity-50">下一章</button>
          </div>
        </div>
      </div>
    </div>
  )
}
