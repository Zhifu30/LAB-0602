import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Microscope, LayoutDashboard, Layers, ClipboardCheck, Boxes, FolderKanban,
  ShieldAlert, LogOut, UserCircle, Settings2, MailPlus, ChevronDown, Tags, Wrench, Activity, Zap,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from '@/components/ui/sidebar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { EmailSettingsPage } from './EmailSettingsPage';
import EquipmentTypeManager from './EquipmentTypeManager';
import { useEquipment } from '@/hooks/useEquipment';
import { IconContainer } from '@/components/ui/icon-container';

const navItems = [
  { title: '维护仪表盘', url: '/maintenance', icon: ClipboardCheck, variant: 'teal' as const },
  { title: '校正管理', url: '/calibration', icon: Activity, variant: 'amber' as const },
  { title: '配件管理', url: '/parts', icon: Boxes, variant: 'purple' as const },
  { title: 'Empower管理', url: '/empower', icon: FolderKanban, variant: 'orange' as const },
  { title: 'Pi Chat', url: '/pi', icon: Zap, variant: 'purple' as const },
];

const adminItems = [
  { title: '权限管理', url: '/permissions', icon: ShieldAlert, variant: 'danger' as const },
];

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [equipmentMenuOpen, setEquipmentMenuOpen] = useState(true);
  const [emailSettingsOpen, setEmailSettingsOpen] = useState(false);
  const [typeManagerOpen, setTypeManagerOpen] = useState(false);
  const { equipment, fetchEquipment } = useEquipment();

  const isActive = (path: string) => location.pathname === path;
  const isAdminUser = profile?.role === 'admin';

  return (
    <>
      <Sidebar className="border-r">
        <SidebarHeader className="border-b px-4 py-3">
          <div className="flex items-center gap-2.5">
            <IconContainer variant="blue" size="md">
              <Microscope />
            </IconContainer>
            <div>
              <h2 className="font-semibold text-sm">LabManager</h2>
              <p className="text-[10px] text-muted-foreground">实验室设备管理系统</p>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>主要功能</SidebarGroupLabel>
            <SidebarGroupContent>
              {/* 设备管理 - 可展开子菜单 */}
              <Collapsible open={equipmentMenuOpen} onOpenChange={setEquipmentMenuOpen}>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton 
                        className="cursor-pointer w-full justify-between"
                        isActive={isActive('/')}
                        onClick={(e) => {
                          // 如果点击的是展开按钮区域，只展开/收起
                          const target = e.target as HTMLElement;
                          if (!target.closest('.expand-icon')) {
                            navigate('/');
                          }
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <IconContainer variant="teal" size="sm">
                            <LayoutDashboard className="h-4 w-4" />
                          </IconContainer>
                          <span>设备管理</span>
                        </div>
                        <ChevronDown className={`h-4 w-4 transition-transform expand-icon ${equipmentMenuOpen ? 'rotate-180' : ''}`} />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                  </SidebarMenuItem>
                </SidebarMenu>
                <CollapsibleContent>
                  <SidebarMenu className="pl-4 mt-1">
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        onClick={() => setTypeManagerOpen(true)}
                        className="cursor-pointer"
                      >
                        <IconContainer variant="blue" size="sm">
                        <Layers className="h-4 w-4" />
                      </IconContainer>
                        <span>设备类型管理</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </CollapsibleContent>
              </Collapsible>

              <SidebarMenu>
                {navItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      onClick={() => navigate(item.url)}
                      isActive={isActive(item.url)}
                      className="cursor-pointer"
                    >
                      <IconContainer variant={item.variant} size="sm">
                        <item.icon className="h-4 w-4" />
                      </IconContainer>
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {isAdminUser && (
            <SidebarGroup>
              <SidebarGroupLabel>管理员功能</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {adminItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        onClick={() => navigate(item.url)}
                        isActive={isActive(item.url)}
                        className="cursor-pointer"
                      >
                        <IconContainer variant={item.variant} size="sm">
                          <item.icon className="h-4 w-4" />
                        </IconContainer>
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}

          <SidebarGroup>
            <SidebarGroupLabel>系统</SidebarGroupLabel>
            <SidebarGroupContent>
              <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton className="cursor-pointer w-full justify-between">
                        <div className="flex items-center gap-2">
                          <IconContainer variant="muted" size="sm">
                            <Settings2 className="h-4 w-4" />
                          </IconContainer>
                          <span>设置</span>
                        </div>
                        <ChevronDown className={`h-4 w-4 transition-transform ${settingsOpen ? 'rotate-180' : ''}`} />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                  </SidebarMenuItem>
                </SidebarMenu>
                <CollapsibleContent>
                  <SidebarMenu className="pl-4 mt-1">
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        onClick={() => setEmailSettingsOpen(true)}
                        className="cursor-pointer"
                      >
                        <IconContainer variant="blue" size="sm">
                          <MailPlus className="h-4 w-4" />
                        </IconContainer>
                        <span>邮件与系统设置</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </CollapsibleContent>
              </Collapsible>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t p-3">
          {profile ? (
            <>
              <div className="flex items-center gap-2 mb-2">
                <IconContainer variant="muted" size="sm">
                  <UserCircle className="h-4 w-4" />
                </IconContainer>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{profile?.username}</p>
                  <Badge variant={isAdminUser ? 'default' : 'secondary'} className="text-[10px] h-4">
                    {isAdminUser ? '管理员' : '普通用户'}
                  </Badge>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full h-8 text-xs"
                onClick={signOut}
              >
                <LogOut className="h-3.5 w-3.5 mr-1.5" />
                退出登录
              </Button>
            </>
          ) : (
            <p className="text-xs text-muted-foreground text-center">访客模式</p>
          )}
        </SidebarFooter>
      </Sidebar>

      <EmailSettingsPage open={emailSettingsOpen} onOpenChange={setEmailSettingsOpen} />
      <EquipmentTypeManager 
        isOpen={typeManagerOpen} 
        onClose={() => setTypeManagerOpen(false)}
        equipments={equipment}
        onEquipmentRefresh={fetchEquipment}
      />
    </>
  );
}
