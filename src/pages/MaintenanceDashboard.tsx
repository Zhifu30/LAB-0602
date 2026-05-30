import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, List, Wrench } from 'lucide-react';
import MaintenanceDashboardComponent from '@/components/MaintenanceDashboard';
import MaintenanceCalendarView from '@/components/MaintenanceCalendarView';
import { IconContainer } from '@/components/ui/icon-container';

const MaintenanceDashboard = () => {
  const [activeTab, setActiveTab] = useState('list');

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <IconContainer variant="primary" size="md">
          <Wrench />
        </IconContainer>
        <div>
          <h1 className="text-xl font-semibold">维护管理</h1>
          <p className="text-xs text-muted-foreground">管理设备维护计划与日程</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-xs grid-cols-2 h-9">
          <TabsTrigger value="list" className="flex items-center gap-1.5 text-sm">
            <List className="h-3.5 w-3.5" />
            列表视图
          </TabsTrigger>
          <TabsTrigger value="calendar" className="flex items-center gap-1.5 text-sm">
            <Calendar className="h-3.5 w-3.5" />
            日历视图
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-4">
          <MaintenanceDashboardComponent />
        </TabsContent>

        <TabsContent value="calendar" className="mt-4">
          <MaintenanceCalendarView />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default MaintenanceDashboard;
