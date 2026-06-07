import React, { useState } from 'react';
import { Plus, Edit, Trash2, FileCheck, Clock, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { useEmpower } from '@/hooks/useEmpower';
import { EmpowerProject, statusLabels, statusColors, CheckStatus } from '@/types/empower';
import Header from '@/components/Header';
import EmpowerProjectDialog from '@/components/EmpowerProjectDialog';

const EmpowerManagement: React.FC = () => {
  const { projects, loading, addProject, updateProject, deleteProject } = useEmpower();
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'add' | 'edit'>('add');
  const [selectedProject, setSelectedProject] = useState<EmpowerProject | null>(null);

  const filteredProjects = projects.filter(project => 
    project.project_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    project.team.toLowerCase().includes(searchTerm.toLowerCase()) ||
    project.owner_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAddProject = async (newProject: Omit<EmpowerProject, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      await addProject(newProject);
      setDialogOpen(false);
    } catch (error) {
      console.error('Failed to add project:', error);
    }
  };

  const handleEditProject = async (updatedProject: EmpowerProject) => {
    try {
      await updateProject(updatedProject.id, updatedProject);
      setDialogOpen(false);
      setSelectedProject(null);
    } catch (error) {
      console.error('Failed to update project:', error);
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (window.confirm('确定要删除这个项目吗？')) {
      try {
        await deleteProject(id);
      } catch (error) {
        console.error('Failed to delete project:', error);
      }
    }
  };

  const stats = {
    total: projects.length,
    pending: projects.filter(p => p.leader_check === 'pending' || p.manager_approve === 'pending').length,
    approved: projects.filter(p => p.leader_check === 'approved' && p.manager_approve === 'approved').length,
    rejected: projects.filter(p => p.leader_check === 'rejected' || p.manager_approve === 'rejected').length
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">加载中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <Header />
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-slate-800 mb-2">Empower项目管理</h1>
            <p className="text-slate-600">管理项目名称和审批流程</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 font-medium">项目总数</p>
                  <p className="text-2xl font-bold text-slate-800">{stats.total}</p>
                </div>
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <FileCheck className="h-5 w-5 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 font-medium">待审核</p>
                  <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
                </div>
                <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                  <Clock className="h-5 w-5 text-yellow-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 font-medium">已批准</p>
                  <p className="text-2xl font-bold text-green-600">{stats.approved}</p>
                </div>
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <UserCheck className="h-5 w-5 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 font-medium">已拒绝</p>
                  <p className="text-2xl font-bold text-red-600">{stats.rejected}</p>
                </div>
                <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                  <Trash2 className="h-5 w-5 text-red-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
              <div className="flex-1 max-w-md">
                <Input
                  placeholder="搜索项目名称、团队或负责人..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Button onClick={() => { setDialogMode('add'); setSelectedProject(null); setDialogOpen(true); }} className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                添加项目
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>项目列表</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>项目名称</TableHead>
                    <TableHead>缩写</TableHead>
                    <TableHead>团队</TableHead>
                    <TableHead>负责人</TableHead>
                    <TableHead>编号</TableHead>
                    <TableHead>Leader审核</TableHead>
                    <TableHead>批准项目名称</TableHead>
                    <TableHead>Manager审批</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProjects.map((project) => (
                    <TableRow key={project.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium">{project.project_name}</TableCell>
                      <TableCell>{project.abbreviation || '-'}</TableCell>
                      <TableCell>{project.team}</TableCell>
                      <TableCell>{project.owner_name}</TableCell>
                      <TableCell>{project.owner_number}</TableCell>
                      <TableCell>
                        <Badge className={statusColors[project.leader_check as CheckStatus]}>
                          {statusLabels[project.leader_check as CheckStatus]}
                        </Badge>
                      </TableCell>
                      <TableCell>{project.approved_project_name || '-'}</TableCell>
                      <TableCell>
                        <Badge className={statusColors[project.manager_approve as CheckStatus]}>
                          {statusLabels[project.manager_approve as CheckStatus]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setSelectedProject(project);
                              setDialogMode('edit');
                              setDialogOpen(true);
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteProject(project.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {filteredProjects.length === 0 && (
              <div className="text-center py-12">
                <p className="text-slate-500 text-lg">暂无项目数据</p>
              </div>
            )}
          </CardContent>
        </Card>

        <EmpowerProjectDialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) setSelectedProject(null);
          }}
          mode={dialogMode}
          project={selectedProject}
          onAdd={handleAddProject}
          onUpdate={handleEditProject}
        />
      </div>
    </div>
  );
};

export default EmpowerManagement;
