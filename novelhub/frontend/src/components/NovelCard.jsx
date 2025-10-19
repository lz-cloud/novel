import React from 'react'
import { Link } from 'react-router-dom'

export default function NovelCard({ novel }) {
  return (
    <div className="border rounded overflow-hidden shadow-sm bg-white">
      {novel.coverUrl ? (
        <img src={novel.coverUrl} alt={novel.title} className="w-full h-40 object-cover" />
      ) : (
        <div className="w-full h-40 bg-slate-200 flex items-center justify-center text-slate-500">No Cover</div>
      )}
      <div className="p-3">
        <h3 className="font-semibold text-lg">{novel.title}</h3>
        <p className="text-sm text-slate-600">{novel.description?.slice(0, 100)}</p>
        <div className="text-sm text-slate-500 mt-1">作者：{novel.author?.username}</div>
        <div className="mt-2 flex gap-2">
          <Link to={`/read/${novel.id}`} className="text-blue-600 hover:underline">开始阅读</Link>
        </div>
      </div>
    </div>
  )
}
