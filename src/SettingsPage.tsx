import { useEffect, useState } from 'react'
import { LoaderCircle, Plus, ShieldCheck, Trash2, UserRound } from 'lucide-react'
import { collection, deleteDoc, doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { auth, db } from './firebase'
import './settings.css'

type Role = 'adm' | 'user'
type Status = 'approved' | 'pending' | 'rejected'
type UserRecord = { id: string; name: string; email: string; photoURL?: string | null; role: Role; status: Status }

export default function SettingsPage() {
  const currentUser = auth.currentUser
  const [users, setUsers] = useState<UserRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => onSnapshot(collection(db, 'users'), (snapshot) => {
    setUsers(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as UserRecord)))
    setLoading(false)
  }, () => { setMessage('Não foi possível carregar os usuários. Verifique as regras do Firestore.'); setLoading(false) }), [])

  const changeUser = async (id: string, changes: Partial<UserRecord>) => {
    setBusyId(id); setMessage('')
    try { await updateDoc(doc(db, 'users', id), changes) } catch { setMessage('Não foi possível salvar esta alteração.') } finally { setBusyId(null) }
  }
  const removeUser = async (user: UserRecord) => {
    if (user.id === currentUser?.uid) return
    if (!window.confirm(`Excluir o acesso de ${user.name}?`)) return
    setBusyId(user.id); setMessage('')
    try { await deleteDoc(doc(db, 'users', user.id)) } catch { setMessage('Não foi possível excluir este usuário.') } finally { setBusyId(null) }
  }

  return <div><div className="page-title"><div><span className="eyebrow">ADMINISTRAÇÃO</span><h1>Configurações</h1><p>Controle acessos e permissões da sua equipe.</p></div><button className="primary-btn"><Plus size={17} /> Convidar usuário</button></div><div className="settings-layout"><div className="settings-nav"><button className="settings-selected">Usuários e acessos</button><button>Dados da empresa</button><button>Integrações</button><button>Preferências</button></div><div className="panel users-panel"><div className="panel-head"><div><h2>Usuários cadastrados</h2><p>As alterações são salvas diretamente no Firebase.</p></div><span className="user-count"><UserRound size={14} /> {users.length} usuários</span></div>{message && <div className="settings-message">{message}</div>}{loading ? <div className="settings-loading"><LoaderCircle size={20} /> Carregando usuários...</div> : <div className="user-list">{users.map((user) => <div className="user-row" key={user.id}><div className="avatar">{user.name.slice(0, 2).toUpperCase()}</div><div className="user-info"><strong>{user.name}</strong><span>{user.email}</span></div><select className="role-select" value={user.role} disabled={busyId === user.id} onChange={(event) => changeUser(user.id, { role: event.target.value as Role })}><option value="adm">adm</option><option value="user">user</option></select><select className={user.status === 'pending' ? 'status-select pending' : user.status === 'rejected' ? 'status-select rejected' : 'status-select'} value={user.status} disabled={busyId === user.id} onChange={(event) => changeUser(user.id, { status: event.target.value as Status })}><option value="approved">Aprovado</option><option value="pending">Pendente</option><option value="rejected">Recusado</option></select><button className="delete-user" title={user.id === currentUser?.uid ? 'Sua conta não pode ser excluída aqui' : 'Excluir usuário'} disabled={user.id === currentUser?.uid || busyId === user.id} onClick={() => removeUser(user)}><Trash2 size={16} /></button></div>)}</div>}{!loading && users.length === 0 && <div className="settings-empty"><ShieldCheck size={24} /><span>Nenhum usuário cadastrado.</span></div>}</div></div></div>
}
