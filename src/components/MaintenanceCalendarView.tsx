import React, { useState, useEffect, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isToday, isPast, subMonths, addMonths } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Calendar, Wrench, Activity, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface CalendarEvent {
  id: string;
  date: string;
  title: string;
  type: 'calibration' | 'maintenance';
  equipmentId: string;
  equipmentName: string;
  frequency?: string;
}

interface MaintenanceCalendarViewProps {
  onEventClick?: (event: CalendarEvent) => void;
}

const frequencyLabels: Record<string, string> = {
  daily: '每日', weekly: '每周', monthly: '每月', quarterly: '每季度', yearly: '每年'
};

const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

const MaintenanceCalendarView: React.FC<MaintenanceCalendarViewProps> = ({ onEventClick }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const days = useMemo(() => eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth)
  }), [currentMonth]);

  const firstDayOfMonth = useMemo(() => startOfMonth(currentMonth).getDay(), [currentMonth]);

  useEffect(() => { fetchEvents(); }, [currentMonth]);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const start = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
      const end = format(endOfMonth(currentMonth), 'yyyy-MM-dd');

      const { data: calibrationData, error: calibrationError } = await supabase
        .from('equipment')
        .select('id, name, status, next_calibration_date')
        .not('next_calibration_date', 'is', null)
        .gte('next_calibration_date', start)
        .lte('next_calibration_date', end)
        .eq('is_scrapped', false);

      if (calibrationError) throw calibrationError;

      const { data: maintenanceData, error: maintenanceError } = await supabase
        .from('maintenance_schedules')
        .select('id, title, next_due_date, frequency, equipment_id, equipment:equipment_id(name, status, is_scrapped)')
        .eq('is_active', true)
        .gte('next_due_date', start)
        .lte('next_due_date', end);

      if (maintenanceError) throw maintenanceError;

      const calendarEvents: CalendarEvent[] = [];

      (calibrationData || []).forEach(eq => {
        if (eq.status !== 'scrapped' && eq.next_calibration_date) {
          calendarEvents.push({
            id: `cal-${eq.id}`,
            date: eq.next_calibration_date,
            title: '设备校正',
            type: 'calibration',
            equipmentId: eq.id,
            equipmentName: eq.name
          });
        }
      });

      (maintenanceData || []).forEach(schedule => {
        const eq = schedule.equipment as any;
        if (eq?.status !== 'scrapped' && eq?.is_scrapped !== true) {
          calendarEvents.push({
            id: `maint-${schedule.id}`,
            date: schedule.next_due_date,
            title: schedule.title,
            type: 'maintenance',
            equipmentId: schedule.equipment_id,
            equipmentName: eq?.name || schedule.equipment_id,
            frequency: schedule.frequency
          });
        }
      });

      setEvents(calendarEvents);
    } catch (error) {
      console.error('Error fetching calendar events:', error);
    } finally {
      setLoading(false);
    }
  };

  /** 性能优化：O(1) 哈希表替代每格 O(N) filter */
  const groupedEvents = useMemo(() => {
    const groups: Record<string, CalendarEvent[]> = {};
    events.forEach(event => {
      if (!groups[event.date]) groups[event.date] = [];
      groups[event.date].push(event);
    });
    return groups;
  }, [events]);

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            <span>维护与校正日历</span>
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-semibold min-w-[100px] text-center">
              {format(currentMonth, 'yyyy年MM月', { locale: zhCN })}
            </span>
            <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCurrentMonth(new Date())} className="ml-2">今天</Button>
          </div>
        </div>
        <div className="flex items-center gap-4 mt-2">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-500" /><span className="text-xs text-muted-foreground">仪器校正</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-green-500" /><span className="text-xs text-muted-foreground">周期维护</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center h-[400px]">
            <span className="text-sm text-muted-foreground animate-pulse">正在加载排程数据...</span>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden bg-background">
            <div className="grid grid-cols-7 bg-muted/40 border-b">
              {weekDays.map((day, i) => (
                <div key={day} className={cn("py-2 text-center text-xs font-semibold",
                  i === 0 || i === 6 ? "text-destructive/80 bg-destructive/5" : "text-muted-foreground")}>
                  周{day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {Array.from({ length: firstDayOfMonth }).map((_, i) => (
                <div key={`empty-${i}`} className="min-h-[110px] border-b border-r bg-muted/10 last:border-r-0" />
              ))}
              {days.map((day) => {
                const dateKey = format(day, 'yyyy-MM-dd');
                const dayEvents = groupedEvents[dateKey] || [];
                return (
                  <div key={dateKey} className={cn(
                    "min-h-[110px] border-b border-r p-1 transition-colors flex flex-col justify-between last:border-r-0",
                    isToday(day) && "bg-primary/5 font-bold",
                    isPast(day) && !isToday(day) && "bg-muted/20"
                  )}>
                    <div>
                      <div className="flex justify-start mb-1">
                        <span className={cn("text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full",
                          isToday(day) && "bg-primary text-primary-foreground shadow-sm")}>
                          {format(day, 'd')}
                        </span>
                      </div>
                      <div className="space-y-1">
                        {dayEvents.slice(0, 3).map((event) => (
                          <Popover key={event.id}>
                            <PopoverTrigger asChild>
                              <div className={cn(
                                "text-[11px] px-1.5 py-0.5 rounded cursor-pointer truncate flex items-center gap-1 border transition-all",
                                event.type === 'calibration'
                                  ? "bg-blue-50/60 text-blue-700 border-blue-100 hover:bg-blue-100/80"
                                  : "bg-green-50/60 text-green-700 border-green-100 hover:bg-green-100/80"
                              )}>
                                {event.type === 'calibration' ? <Activity className="h-3 w-3 flex-shrink-0" /> : <Wrench className="h-3 w-3 flex-shrink-0" />}
                                <span className="truncate flex-1 font-normal">{event.equipmentName}</span>
                              </div>
                            </PopoverTrigger>
                            <PopoverContent className="w-64 p-3" align="start">
                              <div className="space-y-2.5">
                                <div className="flex items-center justify-between">
                                  <Badge variant={event.type === 'calibration' ? 'default' : 'secondary'}>
                                    {event.type === 'calibration' ? '仪器校正' : '维护计划'}
                                  </Badge>
                                  {event.frequency && <Badge variant="outline" className="text-xs">{frequencyLabels[event.frequency] || event.frequency}</Badge>}
                                </div>
                                <div>
                                  <div className="font-semibold text-sm text-foreground break-all">{event.equipmentName}</div>
                                  <div className="text-xs text-muted-foreground mt-0.5">{event.title}</div>
                                </div>
                                <div className="text-[11px] text-muted-foreground bg-muted/50 p-1.5 rounded break-all">设备ID: {event.equipmentId}</div>
                                {onEventClick && (
                                  <Button size="sm" variant="outline" className="w-full text-xs h-8 gap-1"
                                    onClick={(e) => { e.stopPropagation(); onEventClick(event); }}>
                                    <ExternalLink className="h-3 w-3" />查看设备详情
                                  </Button>
                                )}
                              </div>
                            </PopoverContent>
                          </Popover>
                        ))}
                      </div>
                    </div>
                    {dayEvents.length > 3 && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <div className="text-[10px] text-muted-foreground font-medium pl-1 py-0.5 cursor-pointer hover:text-primary transition-colors">
                            +{dayEvents.length - 3} 项更多排程...
                          </div>
                        </PopoverTrigger>
                        <PopoverContent className="w-72 p-0" align="start">
                          <div className="p-2 border-b bg-muted/30 text-xs font-medium text-muted-foreground">
                            {format(day, 'yyyy年MM月dd日')} 全部排程
                          </div>
                          <ScrollArea className="max-h-[220px]">
                            <div className="p-2 space-y-1">
                              {dayEvents.map((event) => (
                                <div key={event.id} className={cn(
                                  "text-xs p-2 rounded cursor-pointer flex items-center justify-between border transition-colors",
                                  event.type === 'calibration' ? "bg-blue-50/40 text-blue-700 border-blue-100 hover:bg-blue-50" : "bg-green-50/40 text-green-700 border-green-100 hover:bg-green-50"
                                )} onClick={(e) => { e.stopPropagation(); onEventClick?.(event); }}>
                                  <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                                    {event.type === 'calibration' ? <Activity className="h-3.5 w-3.5 flex-shrink-0 text-blue-500" /> : <Wrench className="h-3.5 w-3.5 flex-shrink-0 text-green-500" />}
                                    <div className="min-w-0 flex-1">
                                      <div className="font-medium truncate text-foreground">{event.equipmentName}</div>
                                      <div className="text-[10px] opacity-80 truncate">{event.title}</div>
                                    </div>
                                  </div>
                                  {event.frequency && <Badge variant="outline" className="text-[10px] px-1 py-0 flex-shrink-0">{frequencyLabels[event.frequency] || event.frequency}</Badge>}
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MaintenanceCalendarView;
