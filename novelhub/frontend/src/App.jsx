import React, { useEffect, useMemo, useState } from 'react'
import { Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import axios from 'axios'
import Home from './pages/Home.jsx'
import ReadingPage from './pages/ReadingPage.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Admin from './pages/Admin.jsx'

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'
axios.defaults.baseURL = API_BASE

function useQuery() {
  const { search } = useLocation()
  return useMemo(() => new URLSearchParams(search), [search])
}

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '')
  const navigate = useNavigate()
  const query = useQuery()

  useEffect(() => {
    const t = query.get('token')
    if (t) {
      localStorage.setItem('token', t)
      setToken(t)
      navigate('/')
    }
  }, [query, navigate])

  useEffect(() => {
    if (token) axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
    else delete axios.defaults.headers.common['Authorization']
  }, [token])

  const logout = () => {
    localStorage.removeItem('token')
    setToken('')
  }

  return (
    <div>
      <nav className="bg-slate-900 text-white">
        <div className="container flex items-center justify-between">
          <div className="flex items-center gap-4 py-3">
            <Link to="/" className="font-bold">NovelHub</Link>
            <Link to="/dashboard" className="text-slate-300 hover:text-white">作者后台</Link>
            <Link to="/admin" className="text-slate-300 hover:text-white">管理员</Link>
          </div>
          <div className="flex items-center gap-3">
            {token ? (
              <button onClick={logout} className="bg-slate-700 hover:bg-slate-600 rounded px-3 py-1">退出</button>
            ) : (
              <LoginPanel />
            )}
          </div>
        </div>
      </nav>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/read/:id" element={<ReadingPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<div className="container py-10">Not Found</div>} />
      </Routes>
    </div>
  )
}

function LoginPanel() {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const doLogin = async () => {
    setError('')
    try {
      const { data } = await axios.post(`${API_BASE}/auth/login`, { identifier, password })
      localStorage.setItem('token', data.token)
      window.location.reload()
    } catch (e) {
      setError(e.response?.data?.error || '登录失败')
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input className="px-2 py-1 rounded bg-slate-800 text-white" placeholder="用户名/邮箱" value={identifier} onChange={e => setIdentifier(e.target.value)} />
      <input className="px-2 py-1 rounded bg-slate-800 text-white" type="password" placeholder="密码" value={password} onChange={e => setPassword(e.target.value)} />
      <button onClick={doLogin} className="bg-emerald-600 hover:bg-emerald-500 rounded px-3 py-1">登录</button>
      <a className="underline text-slate-300" href={`${API_BASE}/auth/github`}>GitHub 登录</a>
      <a className="underline text-slate-300" href={`${API_BASE}/auth/google`}>Google 登录</a>
      {error && <span className="text-red-400 ml-2">{error}</span>}
    </div>
  )
}
