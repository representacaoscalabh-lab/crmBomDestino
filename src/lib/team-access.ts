export type TeamMember = { id: string; uid: string; name: string; email: string; role: "admin" | "user"; status: "approved" | "pending" | "rejected" };

export function validateTeamEdit(actorUid: string, targetId: string, name: string, role: string, status: string) {
  if (!name.trim()) throw new Error("Informe o nome do usuário.");
  if (!["admin", "user"].includes(role) || !["approved", "pending", "rejected"].includes(status)) throw new Error("Perfil ou situação de acesso inválido.");
  if (targetId === actorUid && (role !== "admin" || status !== "approved")) throw new Error("Você não pode remover seu próprio acesso de administrador.");
  return { name: name.trim(), role: role as TeamMember["role"], status: status as TeamMember["status"] };
}
