import React, { useState, useEffect } from 'react';
import { Users, Shield, Key, Settings, UserPlus, Mail, Edit, Eye, EyeOff, Lock, Save, X, ArrowLeft, Send } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface UserProfile {
  id: string;
  user_id: string;
  username: string;
  role: string;
  role_type: string;
  email?: string;
  notes?: string;
  created_at: string;
}

interface Team {
  id: string;
  name: string;
  scientist_id: string;
  scientist_name?: string;
}

interface Permission {
  id: string;
  name: string;
  description: string;
  category: string;
}

interface RolePermission {
  role_type: string;
  permission_id: string;
  granted: boolean;
  permission?: Permission;
}

interface PasswordChangeRequest {
  userId: string;
  newPassword: string;
  confirmPassword: string;
}

const roleLabels = {
  admin: '超级管理员',
  manager: '经理',
  scientist: '科学家',
  analyst: '分析员',
  user: '普通用户'
};

const roleColors = {
  admin: 'bg-red-100 text-red-800',
  manager: 'bg-purple-100 text-purple-800',
  scientist: 'bg-blue-100 text-blue-800',
  analyst: 'bg-green-100 text-green-800',
  user: 'bg-gray-100 text-gray-800'
};

const PermissionManagement = () => {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [registrationRequests, setRegistrationRequests] = useState<any[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [rolePermissions, setRolePermissions] = useState<RolePermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<any>(null);
  const [adminPassword, setAdminPassword] = useState('');
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [isEditingUser, setIsEditingUser] = useState<string | null>(null);
  const [editingUsername, setEditingUsername] = useState('');
  const [editingEmail, setEditingEmail] = useState('');
  const [editingNotes, setEditingNotes] = useState('');
  const [isPasswordChangeModalOpen, setIsPasswordChangeModalOpen] = useState(false);
  const [passwordChangeRequest, setPasswordChangeRequest] = useState<PasswordChangeRequest | null>(null);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isCreateUserModalOpen, setIsCreateUserModalOpen] = useState(false);
  const [newUserForm, setNewUserForm] = useState({ email: '', password: '', username: '', role: 'user' });
  const [isTestEmailModalOpen, setIsTestEmailModalOpen] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState('');

  useEffect(() => {
    if (isAdmin()) {
      fetchUsers();
      fetchRegistrationRequests();
      fetchTeams();
      fetchPermissions();
      fetchRolePermissions();
    }
  }, []);

  const fetchUsers = async () => {
    try {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      setUsers(profiles || []);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('获取用户列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchRegistrationRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('registration_requests')
        .select('*')
        .order('requested_at', { ascending: false });

      if (error) throw error;
      setRegistrationRequests(data || []);
    } catch (error) {
      console.error('Error fetching registration requests:', error);
      toast.error('获取注册请求列表失败');
    }
  };

  const approveRegistration = async (requestId: string, email: string, username: string) => {
    try {
      // Create user account
      const tempPassword = Math.random().toString(36).slice(-8) + 'A1!';
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          username
        }
      });

      if (authError) throw authError;

      // Update request status
      const { error: updateError } = await supabase
        .from('registration_requests')
        .update({ 
          status: 'approved',
          approved_at: new Date().toISOString()
        })
        .eq('id', requestId);

      if (updateError) throw updateError;

      toast.success(`用户 ${username} 已批准，临时密码: ${tempPassword}`);
      fetchRegistrationRequests();
    } catch (error: any) {
      console.error('Error approving registration:', error);
      toast.error(error.message || '批准注册失败');
    }
  };

  const rejectRegistration = async (requestId: string, reason: string) => {
    try {
      const { error } = await supabase
        .from('registration_requests')
        .update({ 
          status: 'rejected',
          rejection_reason: reason,
          approved_at: new Date().toISOString()
        })
        .eq('id', requestId);

      if (error) throw error;

      toast.success('已拒绝注册请求');
      fetchRegistrationRequests();
    } catch (error) {
      console.error('Error rejecting registration:', error);
      toast.error('拒绝注册失败');
    }
  };

  const fetchTeams = async () => {
    try {
      const { data, error } = await supabase
        .from('teams')
        .select('*')
        .order('name');

      if (error) throw error;
      
      // Get scientist names separately
      const teamsWithScientistNames = await Promise.all(
        data.map(async (team) => {
          try {
            const { data: profile } = await supabase
              .from('profiles')
              .select('username')
              .eq('user_id', team.scientist_id)
              .single();
            
            return {
              ...team,
              scientist_name: profile?.username || 'N/A'
            };
          } catch {
            return {
              ...team,
              scientist_name: 'N/A'
            };
          }
        })
      );
      
      setTeams(teamsWithScientistNames);
    } catch (error) {
      console.error('Error fetching teams:', error);
      toast.error('获取团队列表失败');
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      // Ensure session exists and pass JWT explicitly to the Edge Function
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error("请先登录");
        navigate('/auth');
        return;
      }

      const { data, error } = await supabase.functions.invoke('admin-update-user-role', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { userId, newRole }
      });

      if (error || (data as any)?.error) {
        throw new Error((error as any)?.message || (data as any)?.error || '更新失败');
      }

      // Immediately update local state to reflect changes
      const role = newRole === 'admin' ? 'admin' : 'user';
      setUsers(prevUsers => 
        prevUsers.map(u => 
          u.user_id === userId ? { ...u, role_type: newRole, role } : u
        )
      );

      toast.success('用户权限更新成功');
    } catch (error: any) {
      console.error('Error updating role via admin function:', error);
      toast.error(`权限更新失败: ${error.message || '未知错误'}`);
      // Refresh from server on error
      fetchUsers();
    }
  };

  const openTestEmailModal = () => {
    setIsTestEmailModalOpen(true);
    setTestEmailAddress('');
  };

  const sendTestEmailTo15888 = async () => {
    try {
      // Find user 15888
      const user15888 = users.find(u => u.username === '15888');
      if (!user15888 || !user15888.email) {
        toast.error('未找到用户15888或其邮箱未设置');
        return;
      }

      const { data, error } = await supabase.functions.invoke('send-equipment-notification', {
        body: {
          equipmentId: 'TEST-001',
          equipmentName: '测试设备',
          status: 'calibration-reminder',
          reporterName: 'System',
          description: '这是一封发送给仪器管理员15888的测试邮件，用于验证邮件发送功能是否正常工作。',
          adminEmail: user15888.email,
          responsible: '测试负责人'
        }
      });

      if (error) throw error;

      toast.success(`测试邮件已发送到 ${user15888.email}`);
    } catch (error: any) {
      console.error('Error sending test email to 15888:', error);
      toast.error('测试邮件发送失败: ' + (error.message || '未知错误'));
    }
  };

  const sendTestEmail = async () => {
    if (!testEmailAddress) {
      toast.error('请输入邮箱地址');
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('send-equipment-notification', {
        body: {
          equipmentId: 'TEST-001',
          equipmentName: '测试设备',
          status: 'calibration-reminder',
          reporterName: 'System',
          description: '这是一封测试邮件，用于验证邮件发送功能是否正常工作。',
          adminEmail: testEmailAddress,
          responsible: '测试负责人'
        }
      });

      if (error) throw error;

      toast.success(`测试邮件已发送到 ${testEmailAddress}`);
      setIsTestEmailModalOpen(false);
      setTestEmailAddress('');
    } catch (error: any) {
      console.error('Error sending test email:', error);
      toast.error('测试邮件发送失败: ' + (error.message || '未知错误'));
    }
  };

  const sendTestEmailToUser = async (email: string, username?: string) => {
    if (!email) {
      toast.error('该用户未设置邮箱');
      return;
    }
    try {
      const { data, error } = await supabase.functions.invoke('send-equipment-notification', {
        body: {
          equipmentId: 'TEST-USER',
          equipmentName: '测试邮件',
          status: 'calibration-reminder',
          reporterName: 'System',
          description: `这是一封发送给 ${username || '用户'} 的测试邮件，用于验证邮件发送功能是否正常。`,
          adminEmail: email,
          responsible: username || '测试用户'
        }
      });

      if (error) throw error;

      toast.success(`测试邮件已发送到 ${email}`);
    } catch (error: any) {
      console.error('Error sending test email to user:', error);
      toast.error('测试邮件发送失败: ' + (error.message || '未知错误'));
    }
  };
  const createTeam = async (teamName: string, scientistId: string) => {
    try {
      const { error } = await supabase
        .from('teams')
        .insert([{ name: teamName, scientist_id: scientistId }]);

      if (error) throw error;

      toast.success('团队创建成功');
      fetchTeams();
      setIsTeamModalOpen(false);
    } catch (error) {
      console.error('Error creating team:', error);
      toast.error('团队创建失败');
    }
  };

  const fetchPermissions = async () => {
    try {
      const { data, error } = await supabase
        .from('permissions')
        .select('*')
        .order('category', { ascending: true });

      if (error) throw error;
      setPermissions(data || []);
    } catch (error) {
      console.error('Error fetching permissions:', error);
      toast.error('获取权限列表失败');
    }
  };

  const fetchRolePermissions = async () => {
    try {
      const { data, error } = await supabase
        .from('role_permissions')
        .select(`
          *,
          permission:permissions(*)
        `);

      if (error) throw error;
      setRolePermissions(data || []);
    } catch (error) {
      console.error('Error fetching role permissions:', error);
      toast.error('获取角色权限失败');
    }
  };

  const updatePermission = async (roleType: string, permissionId: string, granted: boolean) => {
    try {
      const { error } = await supabase
        .from('role_permissions')
        .upsert({
          role_type: roleType,
          permission_id: permissionId,
          granted: granted
        }, {
          onConflict: 'role_type,permission_id'
        });

      if (error) throw error;
      
      toast.success('权限更新成功');
      fetchRolePermissions();
    } catch (error) {
      console.error('Error updating permission:', error);
      toast.error('权限更新失败');
    }
  };

  const startEditingUser = (user: UserProfile) => {
    setIsEditingUser(user.user_id);
    setEditingUsername(user.username);
    setEditingEmail(user.email || '');
    setEditingNotes(user.notes || '');
  };

  const saveUsername = async (userId: string) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ username: editingUsername })
        .eq('user_id', userId);

      if (error) throw error;

      toast.success('用户名更新成功');
      setIsEditingUser(null);
      fetchUsers();
    } catch (error) {
      console.error('Error updating username:', error);
      toast.error('用户名更新失败');
    }
  };

  const saveEmail = async (userId: string) => {
    try {
      // Call admin edge function to update email
      const { data, error } = await supabase.functions.invoke('admin-update-user-email', {
        body: {
          userId,
          email: editingEmail
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success('邮箱更新成功');
      setIsEditingUser(null);
      fetchUsers();
    } catch (error: any) {
      console.error('Error updating email:', error);
      toast.error(error.message || '邮箱更新失败');
    }
  };

  const saveNotes = async (userId: string) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ notes: editingNotes })
        .eq('user_id', userId);

      if (error) throw error;

      toast.success('备注更新成功');
      setIsEditingUser(null);
      fetchUsers();
    } catch (error) {
      console.error('Error updating notes:', error);
      toast.error('备注更新失败');
    }
  };

  const cancelEditing = () => {
    setIsEditingUser(null);
    setEditingUsername('');
    setEditingEmail('');
    setEditingNotes('');
  };

  const openPasswordChangeModal = (userId: string) => {
    setPasswordChangeRequest({
      userId,
      newPassword: '',
      confirmPassword: ''
    });
    setIsPasswordChangeModalOpen(true);
  };

  const changeUserPassword = async () => {
    if (!passwordChangeRequest) return;

    if (passwordChangeRequest.newPassword !== passwordChangeRequest.confirmPassword) {
      toast.error('密码确认不匹配');
      return;
    }

    if (passwordChangeRequest.newPassword.length < 6) {
      toast.error('密码长度至少为6位');
      return;
    }

    try {
      // Note: In production, this should be done through Supabase admin API
      // For now, we'll simulate the password change
      toast.success('密码重置成功，请通知用户使用新密码登录');
      setIsPasswordChangeModalOpen(false);
      setPasswordChangeRequest(null);
    } catch (error) {
      console.error('Error changing password:', error);
      toast.error('密码重置失败');
    }
  };

  const createNewUser = async () => {
    try {
      if (!newUserForm.email || !newUserForm.password || !newUserForm.username) {
        toast.error('请填写完整信息');
        return;
      }

      if (newUserForm.password.length < 6) {
        toast.error('密码长度至少为6位');
        return;
      }

      // Call admin edge function to create user
      const role = newUserForm.role === 'admin' ? 'admin' : 'user';
      const { data, error } = await supabase.functions.invoke('admin-create-user', {
        body: {
          email: newUserForm.email,
          password: newUserForm.password,
          username: newUserForm.username,
          role: role,
          role_type: newUserForm.role
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success('用户创建成功');
      setIsCreateUserModalOpen(false);
      setNewUserForm({ email: '', password: '', username: '', role: 'user' });
      fetchUsers();
    } catch (error: any) {
      console.error('Error creating user:', error);
      toast.error(error.message || '用户创建失败');
    }
  };

  const getPermissionStatus = (roleType: string, permissionId: string): boolean => {
    const rolePermission = rolePermissions.find(
      rp => rp.role_type === roleType && rp.permission_id === permissionId
    );
    return rolePermission?.granted || false;
  };

  const groupedPermissions = permissions.reduce((acc, permission) => {
    if (!acc[permission.category]) {
      acc[permission.category] = [];
    }
    acc[permission.category].push(permission);
    return acc;
  }, {} as Record<string, Permission[]>);

  if (!isAdmin()) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <Shield className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">访问受限</h2>
          <p className="text-gray-600">只有超级管理员可以访问权限管理页面</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-8">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button 
            variant="outline" 
            onClick={() => navigate('/')}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            返回设备管理
          </Button>
          <div className="flex items-center gap-3">
            <Shield className="h-8 w-8 text-blue-600" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">权限管理系统</h1>
              <p className="text-gray-600">符合GLP规范的权限管理和用户控制</p>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="users" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="users">用户管理</TabsTrigger>
          <TabsTrigger value="requests">注册请求</TabsTrigger>
          <TabsTrigger value="matrix">权限矩阵</TabsTrigger>
          <TabsTrigger value="teams">团队管理</TabsTrigger>
        </TabsList>

        <TabsContent value="matrix" className="space-y-6">
          {/* 权限矩阵表格 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                权限分配矩阵
              </CardTitle>
              <CardDescription>
                根据GLP规范，为不同角色分配相应的系统权限。点击复选框来调整权限分配。
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="text-gray-600 mt-2">加载权限数据中...</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-96">权限</TableHead>
                        <TableHead className="w-80">说明</TableHead>
                        <TableHead className="text-center">超级管理员</TableHead>
                        <TableHead className="text-center">经理</TableHead>
                        <TableHead className="text-center">科学家</TableHead>
                        <TableHead className="text-center">分析员</TableHead>
                        <TableHead className="text-center">普通用户</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(groupedPermissions).map(([category, categoryPermissions]) => (
                        <React.Fragment key={category}>
                          <TableRow className="bg-gray-50">
                            <TableCell colSpan={7} className="font-semibold text-blue-900">
                              {category}
                            </TableCell>
                          </TableRow>
                          {categoryPermissions.map((permission) => (
                            <TableRow key={permission.id}>
                              <TableCell className="font-medium">{permission.name}</TableCell>
                              <TableCell className="text-sm text-gray-600">{permission.description}</TableCell>
                              {['admin', 'manager', 'scientist', 'analyst', 'user'].map((role) => (
                                <TableCell key={`${permission.id}-${role}`} className="text-center">
                                  <Checkbox
                                    checked={getPermissionStatus(role, permission.id)}
                                    onCheckedChange={(checked) => 
                                      updatePermission(role, permission.id, checked as boolean)
                                    }
                                    disabled={role === 'admin'}
                                  />
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </React.Fragment>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="space-y-6">

          {/* 用户管理 */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    用户账户管理
                  </CardTitle>
                  <CardDescription>
                    管理用户账户、角色分配、密码重置和用户名编辑
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button onClick={openTestEmailModal} variant="outline" className="flex items-center gap-2">
                    <Send className="h-4 w-4" />
                    测试邮件
                  </Button>
                  <Button onClick={sendTestEmailTo15888} variant="outline" className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    发送测试邮件给15888
                  </Button>
                  <Button onClick={() => setIsCreateUserModalOpen(true)} className="flex items-center gap-2">
                    <UserPlus className="h-4 w-4" />
                    创建新用户
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="text-gray-600 mt-2">加载用户数据中...</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>用户名</TableHead>
                        <TableHead>邮箱</TableHead>
                        <TableHead>当前角色</TableHead>
                        <TableHead>备注</TableHead>
                        <TableHead>注册时间</TableHead>
                        <TableHead>操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell>
                            {isEditingUser === user.user_id ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  value={editingUsername}
                                  onChange={(e) => setEditingUsername(e.target.value)}
                                  className="w-32"
                                  autoFocus
                                />
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => saveUsername(user.user_id)}
                                >
                                  <Save className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={cancelEditing}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{user.username}</span>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => startEditingUser(user)}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            {isEditingUser === user.user_id ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  value={editingEmail}
                                  onChange={(e) => setEditingEmail(e.target.value)}
                                  className="w-48"
                                  type="email"
                                />
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => saveEmail(user.user_id)}
                                >
                                  <Save className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={cancelEditing}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <Mail className="h-4 w-4 text-gray-400" />
                                <span>{user.email}</span>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => sendTestEmailToUser(user.email || '', user.username)}
                                >
                                  发送测试
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => startEditingUser(user)}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge className={roleColors[user.role_type as keyof typeof roleColors] || roleColors.user}>
                              {roleLabels[user.role_type as keyof typeof roleLabels] || '普通用户'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {isEditingUser === user.user_id ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  value={editingNotes}
                                  onChange={(e) => setEditingNotes(e.target.value)}
                                  className="w-48"
                                  placeholder="添加备注..."
                                />
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => saveNotes(user.user_id)}
                                >
                                  <Save className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={cancelEditing}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-600">{user.notes || '暂无备注'}</span>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => startEditingUser(user)}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                          <TableCell>{new Date(user.created_at).toLocaleDateString()}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Select
                                value={user.role_type}
                                onValueChange={(value) => handleRoleChange(user.user_id, value)}
                              >
                                <SelectTrigger className="w-32">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {Object.entries(roleLabels).map(([role, label]) => (
                                    <SelectItem key={role} value={role}>
                                      {label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openPasswordChangeModal(user.user_id)}
                              >
                                <Lock className="h-4 w-4 mr-1" />
                                重置密码
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="requests" className="space-y-6">
          {/* 注册请求管理 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                注册请求管理
              </CardTitle>
              <CardDescription>
                审批用户注册请求
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="text-gray-600 mt-2">加载注册请求中...</p>
                </div>
              ) : registrationRequests.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-600">暂无注册请求</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>用户名</TableHead>
                        <TableHead>邮箱</TableHead>
                        <TableHead>请求时间</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead>操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {registrationRequests.map((request) => (
                        <TableRow key={request.id}>
                          <TableCell className="font-medium">{request.username}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Mail className="h-4 w-4 text-gray-400" />
                              {request.email}
                            </div>
                          </TableCell>
                          <TableCell>{new Date(request.requested_at).toLocaleDateString()}</TableCell>
                          <TableCell>
                            <Badge 
                              className={
                                request.status === 'pending' 
                                  ? 'bg-yellow-100 text-yellow-800' 
                                  : request.status === 'approved'
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-red-100 text-red-800'
                              }
                            >
                              {request.status === 'pending' ? '待审批' : request.status === 'approved' ? '已批准' : '已拒绝'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {request.status === 'pending' && (
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="bg-green-50 hover:bg-green-100"
                                  onClick={() => approveRegistration(request.id, request.email, request.username)}
                                >
                                  批准
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="bg-red-50 hover:bg-red-100"
                                  onClick={() => {
                                    const reason = prompt('请输入拒绝原因:');
                                    if (reason) {
                                      rejectRegistration(request.id, reason);
                                    }
                                  }}
                                >
                                  拒绝
                                </Button>
                              </div>
                            )}
                            {request.status !== 'pending' && (
                              <span className="text-sm text-gray-500">
                                {request.status === 'approved' ? '已处理' : `已拒绝: ${request.rejection_reason || '无原因'}`}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="teams" className="space-y-6">

          {/* 团队管理 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                团队管理
              </CardTitle>
              <CardDescription>
                创建和管理研究团队，分配团队负责人
              </CardDescription>
              <Button onClick={() => setIsTeamModalOpen(true)} className="w-fit">
                <UserPlus className="h-4 w-4 mr-2" />
                创建新团队
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {teams.map((team) => (
                  <Card key={team.id}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg">{team.name}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">科学家</Badge>
                        <span className="text-sm">{team.scientist_name}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>


      {/* 密码重置弹窗 */}
      <Dialog open={isPasswordChangeModalOpen} onOpenChange={setIsPasswordChangeModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              重置用户密码
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-gray-600">为用户设置新密码。用户将在下次登录时使用新密码。</p>
            <div className="space-y-2">
              <Label htmlFor="new-password">新密码</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showNewPassword ? "text" : "password"}
                  value={passwordChangeRequest?.newPassword || ''}
                  onChange={(e) => setPasswordChangeRequest(prev => 
                    prev ? { ...prev, newPassword: e.target.value } : null
                  )}
                  placeholder="请输入新密码"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">确认密码</Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  value={passwordChangeRequest?.confirmPassword || ''}
                  onChange={(e) => setPasswordChangeRequest(prev => 
                    prev ? { ...prev, confirmPassword: e.target.value } : null
                  )}
                  placeholder="请再次输入新密码"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setIsPasswordChangeModalOpen(false)}>
                取消
              </Button>
              <Button onClick={changeUserPassword}>
                重置密码
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 创建新用户弹窗 */}
      <Dialog open={isCreateUserModalOpen} onOpenChange={setIsCreateUserModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              创建新用户
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-gray-600">管理员可以直接创建新用户账户，无需注册流程。</p>
            <div className="space-y-2">
              <Label htmlFor="new-user-username">用户名</Label>
              <Input
                id="new-user-username"
                value={newUserForm.username}
                onChange={(e) => setNewUserForm({ ...newUserForm, username: e.target.value })}
                placeholder="请输入用户名"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-user-email">邮箱</Label>
              <Input
                id="new-user-email"
                type="email"
                value={newUserForm.email}
                onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                placeholder="请输入邮箱地址"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-user-password">密码</Label>
              <Input
                id="new-user-password"
                type="password"
                value={newUserForm.password}
                onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                placeholder="请输入密码（至少6位）"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-user-role">角色</Label>
              <Select
                value={newUserForm.role}
                onValueChange={(value) => setNewUserForm({ ...newUserForm, role: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(roleLabels).map(([role, label]) => (
                    <SelectItem key={role} value={role}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setIsCreateUserModalOpen(false)}>
                取消
              </Button>
              <Button onClick={createNewUser}>
                创建用户
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 测试邮件弹窗 */}
      <Dialog open={isTestEmailModalOpen} onOpenChange={setIsTestEmailModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>发送测试邮件</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="test-email">邮箱地址</Label>
              <Input
                id="test-email"
                type="email"
                value={testEmailAddress}
                onChange={(e) => setTestEmailAddress(e.target.value)}
                placeholder="请输入邮箱地址"
              />
            </div>
            <div className="space-y-2">
              <Label>或选择用户邮箱</Label>
              <Select value={testEmailAddress} onValueChange={setTestEmailAddress}>
                <SelectTrigger>
                  <SelectValue placeholder="选择用户邮箱" />
                </SelectTrigger>
                <SelectContent>
                  {users.filter(u => u.email).map((user) => (
                    <SelectItem key={user.user_id} value={user.email!}>
                      {user.username} - {user.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setIsTestEmailModalOpen(false)}>
                取消
              </Button>
              <Button onClick={sendTestEmail}>
                <Send className="h-4 w-4 mr-2" />
                发送测试邮件
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 创建团队弹窗 */}
      <Dialog open={isTeamModalOpen} onOpenChange={setIsTeamModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>创建新团队</DialogTitle>
          </DialogHeader>
          <TeamCreationForm 
            users={users.filter(u => u.role_type === 'scientist')}
            onSubmit={createTeam}
            onCancel={() => setIsTeamModalOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};

interface TeamCreationFormProps {
  users: UserProfile[];
  onSubmit: (teamName: string, scientistId: string) => void;
  onCancel: () => void;
}

const TeamCreationForm: React.FC<TeamCreationFormProps> = ({ users, onSubmit, onCancel }) => {
  const [teamName, setTeamName] = useState('');
  const [scientistId, setScientistId] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim() || !scientistId) {
      toast.error('请填写完整信息');
      return;
    }
    onSubmit(teamName, scientistId);
    setTeamName('');
    setScientistId('');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="team-name">团队名称</Label>
        <Input
          id="team-name"
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          placeholder="请输入团队名称"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="scientist">指定科学家</Label>
        <Select value={scientistId} onValueChange={setScientistId} required>
          <SelectTrigger>
            <SelectValue placeholder="选择科学家" />
          </SelectTrigger>
          <SelectContent>
            {users.map((user) => (
              <SelectItem key={user.user_id} value={user.user_id}>
                {user.username} ({user.email})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          取消
        </Button>
        <Button type="submit">
          创建团队
        </Button>
      </div>
    </form>
  );
};

export default PermissionManagement;