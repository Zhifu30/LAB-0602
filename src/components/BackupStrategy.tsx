import React from 'react';
import { Download, Upload, Database, Shield, Clock, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

const BackupStrategy: React.FC = () => {
  const { toast } = useToast();

  const downloadDatabaseBackup = async () => {
    try {
      const { data, error } = await supabase
        .from('equipment')
        .select('*');

      if (error) throw error;

      const backup = {
        timestamp: new Date().toISOString(),
        version: '1.0',
        data: {
          equipment: data
        }
      };

      const blob = new Blob([JSON.stringify(backup, null, 2)], { 
        type: 'application/json' 
      });
      
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `lab-equipment-backup-${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      
      URL.revokeObjectURL(url);

      toast({
        title: "备份成功",
        description: "数据库备份已下载到本地",
      });
    } catch (error) {
      console.error('Backup failed:', error);
      toast({
        title: "备份失败",
        description: "无法创建数据库备份",
        variant: "destructive",
      });
    }
  };

  const exportCodebase = () => {
    // 提供代码库备份指导
    const codebackupGuide = `
# 代码备份指南

## 1. GitHub 备份（推荐）
- 将代码推送到 GitHub 仓库
- 设置自动备份
- 版本控制管理

## 2. 本地备份
- 定期导出项目文件
- 包含 src/ 目录下所有文件
- 保存 package.json 和依赖

## 3. 关键文件清单
- /src/components/     (所有组件)
- /src/hooks/         (自定义钩子)
- /src/types/         (类型定义)
- /src/integrations/  (Supabase 集成)
- package.json        (依赖管理)
- tailwind.config.ts  (样式配置)
- supabase/          (数据库配置)
`;

    const blob = new Blob([codebackupGuide], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'backup-guide.txt';
    link.click();
    URL.revokeObjectURL(url);

    toast({
      title: "备份指南已下载",
      description: "请按照指南进行代码备份",
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Shield className="h-8 w-8 text-primary" />
        <div>
          <h2 className="text-2xl font-bold text-foreground">备份策略</h2>
          <p className="text-muted-foreground">确保数据和代码的安全性</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 数据库备份 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              数据库备份
            </CardTitle>
            <CardDescription>
              定期备份设备数据和配置信息
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Badge variant="outline" className="text-xs">
                <Clock className="h-3 w-3 mr-1" />
                建议频率：每周一次
              </Badge>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• 设备信息和状态</li>
                <li>• 维护记录</li>
                <li>• SOP文件引用</li>
                <li>• 用户配置</li>
              </ul>
            </div>
            <Button 
              onClick={downloadDatabaseBackup}
              className="w-full"
            >
              <Download className="h-4 w-4 mr-2" />
              立即备份数据库
            </Button>
          </CardContent>
        </Card>

        {/* 代码备份 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              代码备份
            </CardTitle>
            <CardDescription>
              保护源代码和配置文件
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Badge variant="outline" className="text-xs">
                <Clock className="h-3 w-3 mr-1" />
                建议频率：每次更新后
              </Badge>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• React 组件和页面</li>
                <li>• 样式和配置</li>
                <li>• Supabase 集成</li>
                <li>• 依赖和配置文件</li>
              </ul>
            </div>
            <Button 
              onClick={exportCodebase}
              variant="outline"
              className="w-full"
            >
              <Download className="h-4 w-4 mr-2" />
              下载备份指南
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* 恢复策略 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            灾难恢复计划
          </CardTitle>
          <CardDescription>
            当系统出现问题时的恢复步骤
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="border-l-4 border-primary pl-4">
              <h4 className="font-semibold text-sm mb-2">数据恢复</h4>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                <li>访问 Supabase 控制台</li>
                <li>导入备份的 JSON 文件</li>
                <li>验证数据完整性</li>
                <li>重新配置存储桶</li>
              </ol>
            </div>
            
            <div className="border-l-4 border-orange-500 pl-4">
              <h4 className="font-semibold text-sm mb-2">代码恢复</h4>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                <li>从 GitHub 或本地备份恢复代码</li>
                <li>重新安装依赖 (npm install)</li>
                <li>配置 Supabase 连接</li>
                <li>部署到生产环境</li>
              </ol>
            </div>

            <div className="bg-muted p-4 rounded-lg">
              <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                <Shield className="h-4 w-4" />
                最佳实践
              </h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• 设置自动化备份脚本</li>
                <li>• 定期测试恢复流程</li>
                <li>• 保持多份备份副本</li>
                <li>• 文档化恢复步骤</li>
                <li>• 监控系统健康状态</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Supabase 自动备份信息 */}
      <Card className="border-green-200 bg-green-50">
        <CardHeader>
          <CardTitle className="text-green-800 flex items-center gap-2">
            <Database className="h-5 w-5" />
            Supabase 自动备份
          </CardTitle>
          <CardDescription className="text-green-600">
            您的数据库已受到 Supabase 内置备份保护
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-green-700 space-y-2">
            <p>• <strong>每日自动备份：</strong>Supabase 自动执行日常备份</p>
            <p>• <strong>时间点恢复：</strong>可恢复到任意时间点（付费计划）</p>
            <p>• <strong>地理冗余：</strong>数据存储在多个位置</p>
            <p>• <strong>99.9% 可用性：</strong>企业级可靠性保证</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BackupStrategy;