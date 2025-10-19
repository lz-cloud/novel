import React, { useEffect, useState } from 'react'
import axios from 'axios'
import ChapterEditor from '../components/ChapterEditor.jsx'

export default function Dashboard() {
  const [me, setMe] = useState(null)
  const [novels, setNovels] = useState([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [active, setActive] = useState(null)

  const [chTitle, setChTitle] = useState('')
  const [chDraft, setChDraft] = useState(true)
  const [chContent, setChContent] = useState('')
  const [chapters, setChapters] = useState([])

  const loadMe = async () => {
    try {
      const { data } = await axios.get('/api/auth/me')
      setMe(data)
      const ns = await axios.get('/api/novels', { params: { author: data.username } })
      setNovels(ns.data)
    } catch (e) {
      console.log('not logged in')
    }
  }

  useEffect(() => { loadMe() }, [])

  const createNovel = async () => {
    const { data } = await axios.post('/api/novels', { title, description })
    setTitle(''); setDescription('')
    setNovels([data, ...novels])
  }

  const selectNovel = async (n) => {
    setActive(n)
    const { data } = await axios.get(`/api/novels/${n.id}/chapters`)
    setChapters(data)
  }

  const publishChapter = async () => {
    const { data } = await axios.post(`/api/chapters/novel/${active.id}`, { title: chTitle, content: chContent, isDraft: chDraft })
    setChapters([...chapters, data])
    setChTitle('')
    setChContent('')
    setChDraft(true)
  }

  if (!me) {
    return <div className="container py-6">请先登录。</div>
  }

  return (
    <div className="container py-6">
      <h2 className="text-xl font-semibold mb-4">作者仪表盘</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border rounded p-4">
          <h3 className="font-semibold mb-3">创建新作品</h3>
          <div className="flex flex-col gap-2">
            <input className="border rounded px-3 py-2" placeholder="标题" value={title} onChange={e => setTitle(e.target.value)} />
            <textarea className="border rounded px-3 py-2" placeholder="简介" value={description} onChange={e => setDescription(e.target.value)} />
            <button onClick={createNovel} className="self-start bg-emerald-600 text-white rounded px-3 py-2">创建</button>
          </div>
        </div>

        <div className="bg-white border rounded p-4">
          <h3 className="font-semibold mb-3">我的作品</h3>
          <ul>
            {novels.map(n => (
              <li key={n.id} className={`px-3 py-2 border-b cursor-pointer ${active?.id === n.id ? 'bg-slate-100' : ''}`} onClick={() => selectNovel(n)}>
                {n.title}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {active && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          <div className="bg-white border rounded p-4">
            <h3 className="font-semibold mb-3">章节列表</h3>
            <ol className="list-decimal pl-5">
              {chapters.map(c => (
                <li key={c.id} className="py-1">{c.order}. {c.title} {c.isDraft && <span className="text-xs text-slate-500">(草稿)</span>}</li>
              ))}
            </ol>
          </div>

          <div className="bg-white border rounded p-4">
            <h3 className="font-semibold mb-3">发布新章节</h3>
            <input className="border rounded px-3 py-2 w-full mb-2" placeholder="章节标题" value={chTitle} onChange={e => setChTitle(e.target.value)} />
            <div className="mb-2">
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={chDraft} onChange={e => setChDraft(e.target.checked)} />
                草稿
              </label>
            </div>
            <ChapterEditor value={chContent} onChange={setChContent} />
            <button onClick={publishChapter} className="mt-3 bg-blue-600 text-white rounded px-3 py-2">保存章节</button>
          </div>
        </div>
      )}
    </div>
  )
}
