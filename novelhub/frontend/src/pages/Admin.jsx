import React, { useEffect, useState } from 'react'
import axios from 'axios'

export default function Admin() {
  const [users, setUsers] = useState([])
  const [error, setError] = useState('')

  const load = async () => {
    setError('')
    try {
      const { data } = await axios.get('/api/auth/users')
      setUsers(data)
    } catch (e) {
      setError(e.response?.data?.error || '需要管理员权限')
    }
  }

  useEffect(() => { load() }, [])

  const toggleDisable = async (u) => {
    await axios.put(`/api/auth/users/${u.id}/disable`, { disable: !u.isDisabled })
    load()
  }

  const toggleRole = async (u) => {
    const role = u.role === 'ADMIN' ? 'USER' : 'ADMIN'
    await axios.put(`/api/auth/users/${u.id}/role`, { role })
    load()
  }

  return (
    <div className="container py-6">
      <h2 className="text-xl font-semibold mb-3">管理员面板</h2>
      {error && <div className="text-red-500 mb-3">{error}</div>}
      <table className="w-full bg-white border">
        <thead>
          <tr className="bg-slate-100">
            <th className="text-left p-2 border">ID</th>
            <th className="text-left p-2 border">邮箱</th>
            <th className="text-left p-2 border">用户名</th>
            <th className="text-left p-2 border">角色</th>
            <th className="text-left p-2 border">状态</th>
            <th className="text-left p-2 border">操作</th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id}>
              <td className="p-2 border">{u.id}</td>
              <td className="p-2 border">{u.email}</td>
              <td className="p-2 border">{u.username}</td>
              <td className="p-2 border">{u.role}</td>
              <td className="p-2 border">{u.isDisabled ? '禁用' : '正常'}</td>
              <td className="p-2 border">
                <button onClick={() => toggleDisable(u)} className="px-2 py-1 bg-slate-200 rounded mr-2">{u.isDisabled ? '启用' : '禁用'}</button>
                <button onClick={() => toggleRole(u)} className="px-2 py-1 bg-slate-800 text-white rounded">{u.role === 'ADMIN' ? '降级' : '升级为管理员'}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
