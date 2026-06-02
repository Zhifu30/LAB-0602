import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, List, Wrench } from 'lucide-react';
import { IconContainer } from '@/components/ui/icon-container';
import MaintenanceDashboardComponent from '@/components/MaintenanceDashboard';
import MaintenanceCalendarView from '@/components/MaintenanceCalendarView';

const MaintenanceDashboard = () => {
  const [activeTab, setActiveTab] = useState('list');

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <IconContainer variant="teal" size="lg">
            <Wrench />
          </IconContainer>
          <div>
            <h1 className="text-xl font-semibold">维护管理</h1>
            <p className="text-xs text-muted-foreground">管理设备维护计划与日程</p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-sm grid-cols-2 h-11 p-1 gap-1">
          <TabsTrigger
            value="list"
            className="flex items-center gap-2 text-sm data-[state=active]:bg-blue-500 data-[state=active]:text-white data-[state=active]:shadow-md transition-all"
          >
            <div className={`h-6 w-6 rounded flex items-center justify-center ${activeTab === 'list' ? 'bg-white/20' : 'bg-blue-500'}`}>
              <List className="h-3.5 w-3.5 text-white" strokeWidth={1.5} />
            </div>
            列表视图
          </TabsTrigger>
          <TabsTrigger
            value="calendar"
            className="flex items-center gap-2 text-sm data-[state=active]:bg-teal-500 data-[state=active]:text-white data-[state=active]:shadow-md transition-all"
          >
            <div className={`h-6 w-6 rounded flex items-center justify-center ${activeTab === 'calendar' ? 'bg-white/20' : 'bg-teal-500'}`}>
              <Calendar className="h-3.5 w-3.5 text-white" strokeWidth={1.5} />
            </div>
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
