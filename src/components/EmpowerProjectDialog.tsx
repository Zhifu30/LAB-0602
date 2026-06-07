import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { EmpowerProject } from '@/types/empower';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Team {
  id: string;
  name: string;
  scientist_id: string;
}

type EmpowerDialogMode = 'add' | 'edit' | 'batch';

interface EmpowerProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: EmpowerDialogMode;
  project?: EmpowerProject | null;
  onAdd?: (project: Omit<EmpowerProject, 'id' | 'created_at' | 'updated_at'>) => Promise<unknown>;
  onUpdate?: (project: EmpowerProject) => Promise<void>;
}

const emptyForm = () => ({
  project_name: '',
  abbreviation: '',
  team: '',
  team_id: '',
  owner_name: '',
  owner_number: '',
  leader_check: 'pending',
  approved_project_name: '',
  manager_approve: 'pending',
  new_project: true,
  notify_owner: '',
});

const EmpowerProjectDialog: React.FC<EmpowerProjectDialogProps> = ({
  open,
  onOpenChange,
  mode,
  project,
  onAdd,
  onUpdate,
}) => {
  const [teams, setTeams] = useState<Team[]>([]);
  const [batchProjects, setBatchProjects] = useState([{ project_name: '', abbreviation: '' }]);
  const [formData, setFormData] = useState(emptyForm());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEdit = mode === 'edit';
  const isBatch = mode === 'batch';

  useEffect(() => {
    if (open) fetchTeams();
  }, [open]);

  useEffect(() => {
    if (open && isEdit && project) {
      setFormData({
        project_name: project.project_name,
        abbreviation: project.abbreviation || '',
        team: project.team,
        team_id: (project as EmpowerProject & { team_id?: string }).team_id || '',
        owner_name: project.owner_name,
        owner_number: project.owner_number,
        leader_check: project.leader_check,
        approved_project_name: project.approved_project_name || '',
        manager_approve: project.manager_approve,
        new_project: project.new_project,
        notify_owner: project.notify_owner || '',
      });
    } else if (open && !isEdit) {
      setFormData(emptyForm());
      setBatchProjects([{ project_name: '', abbreviation: '' }]);
    }
  }, [open, isEdit, project]);

  const fetchTeams = async () => {
    try {
      const { data, error } = await supabase.from('teams').select('*').order('name');
      if (error) throw error;
      setTeams(data || []);
    } catch {
      toast.error('获取团队列表失败');
    }
  };

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleTeamChange = (teamId: string) => {
    const selectedTeam = teams.find((t) => t.id === teamId);
    setFormData((prev) => ({ ...prev, team_id: teamId, team: selectedTeam?.name || '' }));
  };

  const validateProjectName = (name: string): boolean => {
    if (name.length > 30) { toast.error('项目名称不能超过30个字符'); return false; }
    if (/[^a-zA-Z0-9\s\-_()（）]/.test(name)) { toast.error('项目名称不能包含特殊字符'); return false; }
    return true;
  };

  const sendNotificationEmail = async (created: { team_id?: string; project_name: string; team: string; owner_name: string; id?: string }) => {
    try {
      const selectedTeam = teams.find((t) => t.id === created.team_id);
      if (!selectedTeam?.scientist_id) return;
      const { data: scientist } = await supabase.from('profiles').select('*').eq('user_id', selectedTeam.scientist_id).single();
      if (!scientist) return;
      await supabase.functions.invoke('send-equipment-notification', {
        body: {
          status: 'project-notification',
          adminEmail: scientist.username,
          to: scientist.username,
          projectName: created.project_name,
          teamName: created.team,
          ownerName: created.owner_name,
          stage: 'scientist_review',
          projectId: created.id,
        },
      });
      toast.success('已发送通知邮件给团队科学家');
    } catch {
      toast.error('发送通知邮件失败');
    }
  };

  const handleClose = () => {
    setFormData(emptyForm());
    setBatchProjects([{ project_name: '', abbreviation: '' }]);
    onOpenChange(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isEdit) {
      if (!project || !onUpdate) return;
      if (!formData.project_name.trim()) { toast.error('请输入项目名称'); return; }
      if (!validateProjectName(formData.project_name)) return;
      if (!formData.team.trim()) { toast.error('请输入团队信息'); return; }
      setIsSubmitting(true);
      try {
        await onUpdate({ ...project, ...formData } as EmpowerProject);
        handleClose();
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (isBatch) {
      if (!formData.team_id || !formData.owner_name.trim() || !formData.owner_number.trim()) {
        toast.error('请填写完整的团队和负责人信息');
        return;
      }
      const validProjects = batchProjects.filter((p) => p.project_name.trim());
      if (validProjects.length === 0) { toast.error('请至少添加一个项目'); return; }
      setIsSubmitting(true);
      try {
        for (const bp of validProjects) {
          if (!validateProjectName(bp.project_name)) continue;
          const created = await onAdd?.({ ...formData, project_name: bp.project_name, abbreviation: bp.abbreviation, new_project: false });
          if (created) await sendNotificationEmail(created as Parameters<typeof sendNotificationEmail>[0]);
        }
        toast.success(`成功添加 ${validProjects.length} 个年终项目`);
        handleClose();
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (!formData.project_name.trim() || !validateProjectName(formData.project_name)) return;
    if (!formData.team_id) { toast.error('请选择团队'); return; }
    if (!formData.owner_name.trim() || !formData.owner_number.trim()) {
      toast.error('请填写负责人信息');
      return;
    }
    setIsSubmitting(true);
    try {
      const created = await onAdd?.(formData);
      if (created) await sendNotificationEmail(created as Parameters<typeof sendNotificationEmail>[0]);
      handleClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const title = isEdit ? '编辑项目' : isBatch ? '年终批量添加项目' : '添加新项目';

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className={isEdit ? 'max-w-2xl' : 'max-w-4xl max-h-[90vh] overflow-y-auto'}>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${!isEdit ? 'p-4 bg-blue-50 rounded-lg' : ''}`}>
            {!isEdit && <h3 className="text-lg font-semibold text-blue-900 col-span-full">基本信息</h3>}
            {!isEdit ? (
              <div className="space-y-2">
                <Label>团队 *</Label>
                <Select value={formData.team_id} onValueChange={handleTeamChange} required>
                  <SelectTrigger><SelectValue placeholder="选择团队" /></SelectTrigger>
                  <SelectContent>
                    {teams.map((team) => <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>团队 *</Label>
                <Input value={formData.team} onChange={(e) => handleInputChange('team', e.target.value)} required />
              </div>
            )}
            <div className="space-y-2">
              <Label>负责人姓名 *</Label>
              <Input value={formData.owner_name} onChange={(e) => handleInputChange('owner_name', e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>负责人编号 *</Label>
              <Input value={formData.owner_number} onChange={(e) => handleInputChange('owner_number', e.target.value)} required />
            </div>
          </div>

          {isBatch ? (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">项目列表</h3>
                <Button type="button" onClick={() => setBatchProjects((p) => [...p, { project_name: '', abbreviation: '' }])} variant="outline">添加项目</Button>
              </div>
              {batchProjects.map((bp, index) => (
                <div key={index} className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 border rounded-lg">
                  <div className="space-y-2">
                    <Label>项目名称 *</Label>
                    <Input value={bp.project_name} onChange={(e) => setBatchProjects((prev) => prev.map((p, i) => i === index ? { ...p, project_name: e.target.value } : p))} maxLength={30} />
                  </div>
                  <div className="space-y-2">
                    <Label>缩写</Label>
                    <Input value={bp.abbreviation} onChange={(e) => setBatchProjects((prev) => prev.map((p, i) => i === index ? { ...p, abbreviation: e.target.value } : p))} />
                  </div>
                  {batchProjects.length > 1 && (
                    <div className="flex items-end">
                      <Button type="button" variant="destructive" size="sm" onClick={() => setBatchProjects((p) => p.filter((_, i) => i !== index))}>删除</Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>项目名称 *</Label>
                <Input value={formData.project_name} onChange={(e) => handleInputChange('project_name', e.target.value)} maxLength={30} required />
              </div>
              <div className="space-y-2">
                <Label>缩写</Label>
                <Input value={formData.abbreviation} onChange={(e) => handleInputChange('abbreviation', e.target.value)} />
              </div>
              {isEdit && (
                <>
                  <div className="space-y-2">
                    <Label>Leader审核状态</Label>
                    <Select value={formData.leader_check} onValueChange={(v) => handleInputChange('leader_check', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">待审核</SelectItem>
                        <SelectItem value="approved">已批准</SelectItem>
                        <SelectItem value="rejected">已拒绝</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>批准的项目名称</Label>
                    <Input value={formData.approved_project_name} onChange={(e) => handleInputChange('approved_project_name', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Manager审批状态</Label>
                    <Select value={formData.manager_approve} onValueChange={(v) => handleInputChange('manager_approve', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">待审批</SelectItem>
                        <SelectItem value="approved">已批准</SelectItem>
                        <SelectItem value="rejected">已拒绝</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <Label>通知负责人</Label>
                    <Input value={formData.notify_owner} onChange={(e) => handleInputChange('notify_owner', e.target.value)} placeholder="@负责人信息" />
                  </div>
                </>
              )}
            </div>
          )}

          {!isEdit && (
            <div className="flex items-center space-x-2">
              <Checkbox id="new_project" checked={formData.new_project} onCheckedChange={(c) => handleInputChange('new_project', c)} />
              <Label htmlFor="new_project">{isBatch ? '年终新建项目' : '新建项目'}</Label>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={handleClose}>取消</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? '提交中...' : isEdit ? '更新项目' : isBatch ? '批量提交项目' : '提交项目'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EmpowerProjectDialog;
