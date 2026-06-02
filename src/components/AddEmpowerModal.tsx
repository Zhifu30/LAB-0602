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

interface AddEmpowerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (project: Omit<EmpowerProject, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
  isBatchMode?: boolean;
}

const AddEmpowerModal: React.FC<AddEmpowerModalProps> = ({ isOpen, onClose, onAdd, isBatchMode = false }) => {
  const [teams, setTeams] = useState<Team[]>([]);
  const [batchProjects, setBatchProjects] = useState([{ project_name: '', abbreviation: '' }]);
  const [formData, setFormData] = useState({
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
    notify_owner: ''
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchTeams();
    }
  }, [isOpen]);

  const fetchTeams = async () => {
    try {
      const { data, error } = await supabase
        .from('teams')
        .select('*')
        .order('name');
      
      if (error) throw error;
      setTeams(data || []);
    } catch (error) {
      console.error('Error fetching teams:', error);
      toast.error('获取团队列表失败');
    }
  };

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleTeamChange = (teamId: string) => {
    const selectedTeam = teams.find(t => t.id === teamId);
    setFormData(prev => ({
      ...prev,
      team_id: teamId,
      team: selectedTeam?.name || ''
    }));
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

  const sendNotificationEmail = async (project: any) => {
    try {
      const selectedTeam = teams.find(t => t.id === project.team_id);
      if (!selectedTeam?.scientist_id) return;

      // Get scientist email
      const { data: scientist } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', selectedTeam.scientist_id)
        .single();

      if (!scientist) return;

      await supabase.functions.invoke('send-equipment-notification', {
        body: {
          status: 'project-notification',
          adminEmail: scientist.username,
          to: scientist.username,
          projectName: project.project_name,
          teamName: project.team,
          ownerName: project.owner_name,
          stage: 'scientist_review',
          projectId: project.id
        }
      });

      toast.success('已发送通知邮件给团队科学家');
    } catch (error) {
      console.error('Error sending notification:', error);
      toast.error('发送通知邮件失败');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isBatchMode) {
      await handleBatchSubmit();
      return;
    }

    if (!formData.project_name.trim()) {
      toast.error('请输入项目名称');
      return;
    }

    if (!validateProjectName(formData.project_name)) {
      return;
    }

    if (!formData.team_id) {
      toast.error('请选择团队');
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
      const project = await onAdd(formData);
      await sendNotificationEmail(project);
      handleClose();
    } catch (error) {
      console.error('Failed to add project:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBatchSubmit = async () => {
    if (!formData.team_id || !formData.owner_name.trim() || !formData.owner_number.trim()) {
      toast.error('请填写完整的团队和负责人信息');
      return;
    }

    const validProjects = batchProjects.filter(p => p.project_name.trim());
    if (validProjects.length === 0) {
      toast.error('请至少添加一个项目');
      return;
    }

    setIsSubmitting(true);
    try {
      for (const project of validProjects) {
        if (!validateProjectName(project.project_name)) {
          continue;
        }

        const projectData = {
          ...formData,
          project_name: project.project_name,
          abbreviation: project.abbreviation,
          new_project: false // 年终项目
        };

        const createdProject = await onAdd(projectData);
        await sendNotificationEmail(createdProject);
      }
      
      toast.success(`成功添加 ${validProjects.length} 个年终项目`);
      handleClose();
    } catch (error) {
      console.error('Failed to add batch projects:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const addBatchProject = () => {
    setBatchProjects(prev => [...prev, { project_name: '', abbreviation: '' }]);
  };

  const removeBatchProject = (index: number) => {
    setBatchProjects(prev => prev.filter((_, i) => i !== index));
  };

  const updateBatchProject = (index: number, field: string, value: string) => {
    setBatchProjects(prev => prev.map((project, i) => 
      i === index ? { ...project, [field]: value } : project
    ));
  };

  const handleClose = () => {
    setFormData({
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
      notify_owner: ''
    });
    setBatchProjects([{ project_name: '', abbreviation: '' }]);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isBatchMode ? '年终批量添加项目' : '添加新项目'}
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 通用信息 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-blue-50 rounded-lg">
            <h3 className="text-lg font-semibold text-blue-900 col-span-full">基本信息</h3>
            
            <div className="space-y-2">
              <Label htmlFor="team">团队 *</Label>
              <Select
                value={formData.team_id}
                onValueChange={handleTeamChange}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择团队" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map(team => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
          </div>

          {/* 项目信息 */}
          {isBatchMode ? (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">项目列表</h3>
                <Button type="button" onClick={addBatchProject} variant="outline">
                  添加项目
                </Button>
              </div>
              
              {batchProjects.map((project, index) => (
                <div key={index} className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 border rounded-lg">
                  <div className="space-y-2">
                    <Label>项目名称 *</Label>
                    <Input
                      value={project.project_name}
                      onChange={(e) => updateBatchProject(index, 'project_name', e.target.value)}
                      placeholder="请输入项目名称（≤30字符）"
                      maxLength={30}
                    />
                    <p className="text-xs text-gray-500">
                      字符数: {project.project_name.length}/30
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>缩写</Label>
                    <Input
                      value={project.abbreviation}
                      onChange={(e) => updateBatchProject(index, 'abbreviation', e.target.value)}
                      placeholder="如: Tab, Cap, Soln等"
                    />
                  </div>

                  <div className="flex items-end">
                    {batchProjects.length > 1 && (
                      <Button
                        type="button"
                        onClick={() => removeBatchProject(index)}
                        variant="destructive"
                        size="sm"
                      >
                        删除
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
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
                  <br />
                  提示：可使用项目名称的部分简写作为缩写
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
                <p className="text-xs text-gray-500">
                  建议使用项目名称的关键词简写
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center space-x-2">
            <Checkbox
              id="new_project"
              checked={formData.new_project}
              onCheckedChange={(checked) => handleInputChange('new_project', checked)}
            />
            <Label htmlFor="new_project">
              {isBatchMode ? '年终新建项目' : '新建项目'}
            </Label>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={handleClose}>
              取消
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? '提交中...' : (isBatchMode ? '批量提交项目' : '提交项目')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddEmpowerModal;