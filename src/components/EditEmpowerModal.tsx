import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmpowerProject } from '@/types/empower';
import { toast } from 'sonner';

interface EditEmpowerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (project: EmpowerProject) => Promise<void>;
  project: EmpowerProject | null;
}

const EditEmpowerModal: React.FC<EditEmpowerModalProps> = ({ isOpen, onClose, onUpdate, project }) => {
  const [formData, setFormData] = useState({
    id: '',
    project_name: '',
    abbreviation: '',
    team: '',
    owner_name: '',
    owner_number: '',
    leader_check: 'pending',
    approved_project_name: '',
    manager_approve: 'pending',
    new_project: true,
    notify_owner: '',
    created_at: '',
    updated_at: ''
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (project) {
      setFormData({
        id: project.id,
        project_name: project.project_name,
        abbreviation: project.abbreviation || '',
        team: project.team,
        owner_name: project.owner_name,
        owner_number: project.owner_number,
        leader_check: project.leader_check,
        approved_project_name: project.approved_project_name || '',
        manager_approve: project.manager_approve,
        new_project: project.new_project,
        notify_owner: project.notify_owner || '',
        created_at: project.created_at,
        updated_at: project.updated_at
      });
    }
  }, [project]);

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const validateProjectName = (name: string): boolean => {
    if (name.length > 30) {
      toast.error('项目名称不能超过30个字符');
      return false;
    }
    if (/[^a-zA-Z0-9\s\-_()（）]/.test(name)) {
      toast.error('项目名称不能包含特殊字符');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.project_name.trim()) {
      toast.error('请输入项目名称');
      return;
    }

    if (!validateProjectName(formData.project_name)) {
      return;
    }

    if (!formData.team.trim()) {
      toast.error('请输入团队信息');
      return;
    }

    if (!formData.owner_name.trim()) {
      toast.error('请输入负责人姓名');
      return;
    }

    if (!formData.owner_number.trim()) {
      toast.error('请输入负责人编号');
      return;
    }

    setIsSubmitting(true);
    try {
      await onUpdate(formData as EmpowerProject);
    } catch (error) {
      console.error('Failed to update project:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!project) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>编辑项目</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="project_name">项目名称 *</Label>
              <Input
                id="project_name"
                value={formData.project_name}
                onChange={(e) => handleInputChange('project_name', e.target.value)}
                placeholder="请输入项目名称（≤30字符）"
                maxLength={30}
                required
              />
              <p className="text-xs text-gray-500">
                字符数: {formData.project_name.length}/30
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="abbreviation">缩写</Label>
              <Input
                id="abbreviation"
                value={formData.abbreviation}
                onChange={(e) => handleInputChange('abbreviation', e.target.value)}
                placeholder="如: Tab, Cap, Soln等"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="team">团队 *</Label>
              <Input
                id="team"
                value={formData.team}
                onChange={(e) => handleInputChange('team', e.target.value)}
                placeholder="请输入团队信息"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="owner_name">负责人姓名 *</Label>
              <Input
                id="owner_name"
                value={formData.owner_name}
                onChange={(e) => handleInputChange('owner_name', e.target.value)}
                placeholder="请输入负责人姓名"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="owner_number">负责人编号 *</Label>
              <Input
                id="owner_number"
                value={formData.owner_number}
                onChange={(e) => handleInputChange('owner_number', e.target.value)}
                placeholder="请输入负责人编号"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="leader_check">Leader审核状态</Label>
              <Select
                value={formData.leader_check}
                onValueChange={(value) => handleInputChange('leader_check', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">待审核</SelectItem>
                  <SelectItem value="approved">已批准</SelectItem>
                  <SelectItem value="rejected">已拒绝</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="approved_project_name">批准的项目名称</Label>
              <Input
                id="approved_project_name"
                value={formData.approved_project_name}
                onChange={(e) => handleInputChange('approved_project_name', e.target.value)}
                placeholder="Leader填写的最终项目名称"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="manager_approve">Manager审批状态</Label>
              <Select
                value={formData.manager_approve}
                onValueChange={(value) => handleInputChange('manager_approve', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">待审批</SelectItem>
                  <SelectItem value="approved">已批准</SelectItem>
                  <SelectItem value="rejected">已拒绝</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-2 space-y-2">
              <Label htmlFor="notify_owner">通知负责人</Label>
              <Input
                id="notify_owner"
                value={formData.notify_owner}
                onChange={(e) => handleInputChange('notify_owner', e.target.value)}
                placeholder="@负责人信息"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? '更新中...' : '更新项目'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EditEmpowerModal;