export interface EmpowerProject {
  id: string;
  project_name: string;
  abbreviation?: string;
  team: string;
  owner_name: string;
  owner_number: string;
  leader_check: string;
  approved_project_name?: string;
  manager_approve: string;
  new_project: boolean;
  notify_owner?: string;
  created_at: string;
  updated_at: string;
}

export type CheckStatus = 'pending' | 'approved' | 'rejected';

export const statusLabels: Record<CheckStatus, string> = {
  pending: '待审核',
  approved: '已批准',
  rejected: '已拒绝'
};

export const statusColors: Record<CheckStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800'
};