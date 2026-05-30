import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { User, LogOut, Shield } from 'lucide-react';

const Header = () => {
  const { user, profile, signOut } = useAuth();

  if (!user) return null;

  const isAdmin = profile?.role === 'admin';

  return (
    <header className="border-b bg-background px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">实验室设备管理系统</h1>
      </div>
      
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4" />
          <span className="text-sm font-medium">{profile?.username}</span>
          <Badge variant={isAdmin ? 'default' : 'secondary'}>
            {isAdmin ? (
              <><Shield className="h-3 w-3 mr-1" />管理员</>
            ) : (
              '普通用户'
            )}
          </Badge>
        </div>
        
        <Button variant="outline" size="sm" onClick={signOut}>
          <LogOut className="h-4 w-4 mr-1" />
          退出登录
        </Button>
      </div>
    </header>
  );
};

export default Header;