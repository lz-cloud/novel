import React, { useEffect, useState } from 'react'
import axios from 'axios'
import NovelCard from '../components/NovelCard.jsx'

export default function Home() {
  const [novels, setNovels] = useState([])
  const [q, setQ] = useState('')

  const load = async () => {
    const { data } = await axios.get('/api/novels', { params: { q } })
    setNovels(data)
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <div className="container py-6">
      <div className="flex items-center gap-2 mb-4">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜索小说/作者..." className="border rounded px-3 py-2 w-full" />
        <button onClick={load} className="bg-blue-600 text-white rounded px-3 py-2">搜索</button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {novels.map(n => <NovelCard key={n.id} novel={n} />)}
      </div>
    </div>
  )
}
