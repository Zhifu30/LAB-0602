import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { EmpowerProject } from '@/types/empower';
import { toast } from 'sonner';

export const useEmpower = () => {
  const [projects, setProjects] = useState<EmpowerProject[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('empower_projects')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProjects(data || []);
    } catch (error) {
      console.error('Error fetching empower projects:', error);
      toast.error('获取项目列表失败');
    } finally {
      setLoading(false);
    }
  };

  const addProject = async (newProject: Omit<EmpowerProject, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      const { data, error } = await supabase
        .from('empower_projects')
        .insert([newProject])
        .select()
        .single();

      if (error) throw error;
      
      setProjects(prev => [data, ...prev]);
      toast.success('项目添加成功');
      return data;
    } catch (error) {
      console.error('Error adding project:', error);
      toast.error('项目添加失败');
      throw error;
    }
  };

  const updateProject = async (id: string, updates: Partial<EmpowerProject>) => {
    try {
      const { data, error } = await supabase
        .from('empower_projects')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      setProjects(prev => prev.map(project => 
        project.id === id ? { ...project, ...data } : project
      ));
      
      toast.success('项目更新成功');
      return data;
    } catch (error) {
      console.error('Error updating project:', error);
      toast.error('项目更新失败');
      throw error;
    }
  };

  const deleteProject = async (id: string) => {
    try {
      const { error } = await supabase
        .from('empower_projects')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setProjects(prev => prev.filter(project => project.id !== id));
      toast.success('项目删除成功');
    } catch (error) {
      console.error('Error deleting project:', error);
      toast.error('项目删除失败');
      throw error;
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  return {
    projects,
    loading,
    addProject,
    updateProject,
    deleteProject,
    fetchProjects
  };
};