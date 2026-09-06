export type AdminIdentity = {
  id: string;
  username: string;
  studentId: string;
};

export type AdminAccountRuleInput = {
  role: string;
  username: string;
  studentId: string;
  existingAdmin: AdminIdentity | null;
};

export function getAdminAccountRuleError(input: AdminAccountRuleInput): string | null {
  if (input.role !== 'admin' || !input.existingAdmin) return null;
  if (input.existingAdmin.studentId === input.studentId) return '该学号已绑定其他管理员账号';
  return null;
}

export function isLastAdminMutation(input: { currentRole: string; nextRole: string; adminCount: number }): boolean {
  return input.currentRole === 'admin' && input.nextRole !== 'admin' && input.adminCount <= 1;
}
