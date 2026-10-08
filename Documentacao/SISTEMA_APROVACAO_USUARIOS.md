# 🔐 Sistema de Aprovação de Usuários - Guia de Uso

## ✨ O que foi implementado

Um sistema completo de aprovação de usuários para o CRM WRRJ onde:

- **Novos usuários** que acessam o login e não têm status aprovado são solicitantes
- **Apenas admins** podem aprovar ou recusar solicitações
- **Página de Configurações** mostra:
  - Lista de usuários com acesso
  - Lista de solicitações pendentes para análise

---

## 🔄 Fluxo de Funcionamento

### 1️⃣ Primeiro Login do Usuário
```
Novo Usuário → Clica "Entrar com Google" 
→ Auth-Gate cria registro com status "pending"
→ Tela: "Sua conta ainda não foi aprovada"
→ Opção: "Solicitar acesso"
```

### 2️⃣ Usuário Solicita Acesso
```
Clica em "Solicitar acesso"
→ Solicitação é criada em access_requests
→ Tela: "Solicitação enviada - Um administrador analisará"
→ Usuário pode fazer logout
```

### 3️⃣ Admin Analisa Solicitações
```
Admin vai para: Configurações → Solicitações pendentes
→ Vê lista de usuários solicitando acesso
→ Clica "Aprovar" OU "Recusar" + motivo
→ Status é atualizado em tempo real
```

### 4️⃣ Usuário Aprovado Acessa Sistema
```
Usuário faz novo login
→ Auth-Gate valida status "approved"
→ Redireciona automático para /dashboard
→ Acesso total ao CRM
```

---

## 📋 Arquivos Criados/Modificados

### ✅ Novo
- `src/lib/user-service.ts` - Serviço completo de gerenciamento de usuários
- `src/hooks/use-auth.ts` - Hook para obter dados do usuário autenticado

### 📝 Modificado
- `src/lib/schemas.ts` - Adicionados schemas `userSchema` e `userAccessRequestSchema`
- `src/components/auth-gate.tsx` - Implementada lógica de verificação de aprovação
- `src/app/dashboard/configuracoes/page.tsx` - Interface de gerenciamento de usuários

---

## 🎯 Como Testar

### Teste 1: Criar Novo Usuário Pendente
1. Abra o CRM em nova sessão (incógnito)
2. Clique "Entrar com Google"
3. Você deve ver: "Sua conta ainda não foi aprovada"
4. Clique "Solicitar acesso"
5. Verifique se aparece: "Solicitação enviada"

### Teste 2: Admin Aprova Solicitação
1. Faça login como um usuário **admin** existente
2. Vá para: `Configurações` → `Solicitações pendentes`
3. Você deve ver a solicitação do novo usuário
4. Clique "Aprovar"
5. A solicitação desaparece da fila

### Teste 3: Usuário Aprovado Acessa
1. Com o novo usuário, faça login novamente
2. Você deve ser redirecionado direto para `/dashboard`
3. Acesso total ao CRM

---

## 🔑 Estrutura de Dados (Firestore)

### Collection: `users`
```json
{
  "uid": "user-id-123",
  "email": "user@example.com",
  "displayName": "João Silva",
  "photoURL": "https://...",
  "status": "approved" | "pending" | "rejected",
  "role": "user" | "admin",
  "createdAt": "timestamp",
  "updatedAt": "timestamp",
  "approvedBy": "admin-uid-456",
  "rejectionReason": "Motivo se rejeitado"
}
```

### Collection: `access_requests`
```json
{
  "uid": "user-id-123",
  "email": "user@example.com",
  "displayName": "João Silva",
  "photoURL": "https://...",
  "requestedAt": "timestamp",
  "status": "pending" | "approved" | "rejected",
  "rejectionReason": "Motivo se rejeitado"
}
```

---

## 🛠️ APIs Disponíveis (src/lib/user-service.ts)

### Verificações
- `isUserApproved(uid)` → boolean
- `isUserAdmin(uid)` → boolean
- `getUserData(uid)` → User | null

### Gerenciamento de Usuários
- `createOrUpdateUser(userData)` → void
- `getApprovedUsers()` → User[]
- `getAllUsers()` → User[]

### Gerenciamento de Solicitações
- `createAccessRequest(request)` → string (id)
- `getPendingAccessRequests()` → AccessRequest[]
- `getAllAccessRequests()` → AccessRequest[]
- `approveAccessRequest(requestId, approvedBy)` → void
- `rejectAccessRequest(requestId, reason)` → void

---

## 🔒 Segurança

### ⚠️ Importante: Regras Firestore

Você deve configurar as regras de segurança do Firestore para proteger os dados:

```firestore
// rules_v2
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users collection
    match /users/{userId} {
      allow read: if request.auth.uid == userId;
      allow create: if request.auth.uid == request.resource.data.uid;
      allow update: if request.auth.uid != userId || hasRole('admin');
    }
    
    // Access requests
    match /access_requests/{docId} {
      allow read: if hasRole('admin');
      allow create: if request.auth.uid != null;
      allow update: if hasRole('admin');
    }
    
    // Helper function
    function hasRole(role) {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == role;
    }
  }
}
```

---

## 📱 UI/UX Implementado

### Auth-Gate (Telas de Autenticação)
- ✅ Tela de login padrão
- ✅ Tela "Acesso Pendente" com botão Solicitar
- ✅ Tela "Solicitação Enviada" de confirmação
- ✅ Loading screens durante validação

### Página de Configurações
- ✅ Duas abas: "Usuários com acesso" e "Solicitações pendentes"
- ✅ Cards de usuários com foto, nome, email, data
- ✅ Botões Aprovar/Recusar com modal de motivo
- ✅ Validação de permissões (apenas admin acessa)
- ✅ Toasts de sucesso/erro com Sonner

---

## ⚡ Próximos Passos (Opcional)

- [ ] Notificações por email para aprovação/rejeição
- [ ] Sistema de permissões por módulo
- [ ] Log de auditoria de ações de admin
- [ ] Edição de usuários (trocar role, etc)
- [ ] Suspensão de usuários
- [ ] Painel de métricas de acesso

---

## 🚀 Deployment

O sistema usa Firestore e Firebase Authentication, portanto:

1. Certifique-se de que Firebase está configurado em `src/lib/firebase.ts`
2. Collections `users` e `access_requests` serão criadas automaticamente
3. Ative Google OAuth no Firebase Console
4. Configure as regras de segurança (ver seção acima)

---

## 🐛 Troubleshooting

**P: Usuário não vê botão "Solicitar acesso"?**  
R: Verifique se `createOrUpdateUser()` foi chamado com sucesso (veja console)

**P: Admin não vê solicitações?**  
R: Verifique se o usuário admin tem `role: 'admin'` em Firestore

**P: Erro ao aprovar/recusar?**  
R: Verifique as regras de segurança do Firestore

---

**Desenvolvido com ❤️ para WRRJ CRM**
