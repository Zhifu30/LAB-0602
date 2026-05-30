import React, { useState, useEffect, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, isToday, isPast } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Calendar, Wrench, Activity } from 'lucide-react';
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
  monthly: '每月',
  quarterly: '每季度',
  yearly: '每年'
};

const MaintenanceCalendarView: React.FC<MaintenanceCalendarViewProps> = ({ onEventClick }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEvents();
  }, [currentMonth]);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const start = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
      const end = format(endOfMonth(currentMonth), 'yyyy-MM-dd');

      // Fetch calibration dates
      const { data: calibrationData, error: calibrationError } = await supabase
        .from('equipment')
        .select('id, name, next_calibration_date')
        .not('next_calibration_date', 'is', null)
        .gte('next_calibration_date', start)
        .lte('next_calibration_date', end)
        .eq('is_scrapped', false);

      if (calibrationError) throw calibrationError;

      // Fetch maintenance schedules
      const { data: maintenanceData, error: maintenanceError } = await supabase
        .from('maintenance_schedules')
        .select('id, title, next_due_date, frequency, equipment_id, equipment:equipment_id(name)')
        .eq('is_active', true)
        .gte('next_due_date', start)
        .lte('next_due_date', end);

      if (maintenanceError) throw maintenanceError;

      const calendarEvents: CalendarEvent[] = [];

      // Add calibration events
      (calibrationData || []).forEach(eq => {
        if (eq.next_calibration_date) {
          calendarEvents.push({
            id: `cal-${eq.id}`,
            date: eq.next_calibration_date,
            title: '校正',
            type: 'calibration',
            equipmentId: eq.id,
            equipmentName: eq.name
          });
        }
      });

      // Add maintenance events
      (maintenanceData || []).forEach(schedule => {
        calendarEvents.push({
          id: `maint-${schedule.id}`,
          date: schedule.next_due_date,
          title: schedule.title,
          type: 'maintenance',
          equipmentId: schedule.equipment_id,
          equipmentName: (schedule.equipment as any)?.name || schedule.equipment_id,
          frequency: schedule.frequency
        });
      });

      setEvents(calendarEvents);
    } catch (error) {
      console.error('Error fetching calendar events:', error);
    } finally {
      setLoading(false);
    }
  };

  const days = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const getEventsForDay = (day: Date) => {
    return events.filter(event => isSameDay(new Date(event.date), day));
  };

  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

  // Get the first day of the month's weekday (0-6)
  const firstDayOfMonth = startOfMonth(currentMonth).getDay();

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            维护日历
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-lg font-medium min-w-[120px] text-center">
              {format(currentMonth, 'yyyy年M月', { locale: zhCN })}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentMonth(new Date())}
              className="ml-2"
            >
              今天
            </Button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-2">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span className="text-xs text-muted-foreground">校正</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-xs text-muted-foreground">维护</span>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center h-[400px]">
            <span className="text-muted-foreground">加载中...</span>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            {/* Weekday headers */}
            <div className="grid grid-cols-7 bg-muted/50">
              {weekDays.map((day, i) => (
                <div
                  key={day}
                  className={cn(
                    "py-2 text-center text-sm font-medium border-b",
                    i === 0 || i === 6 ? "text-red-500" : "text-muted-foreground"
                  )}
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7">
              {/* Empty cells for days before the first of the month */}
              {Array.from({ length: firstDayOfMonth }).map((_, i) => (
                <div key={`empty-${i}`} className="min-h-[100px] border-b border-r bg-muted/20" />
              ))}

              {days.map((day) => {
                const dayEvents = getEventsForDay(day);
                const dayNumber = format(day, 'd');
                const isCurrentDay = isToday(day);
                const isPastDay = isPast(day) && !isCurrentDay;

                return (
                  <div
                    key={day.toString()}
                    className={cn(
                      "min-h-[100px] border-b border-r p-1 transition-colors",
                      isCurrentDay && "bg-primary/5",
                      isPastDay && "bg-muted/30"
                    )}
                  >
                    <div className={cn(
                      "text-sm font-medium mb-1 w-7 h-7 flex items-center justify-center rounded-full",
                      isCurrentDay && "bg-primary text-primary-foreground"
                    )}>
                      {dayNumber}
                    </div>

                    <div className="space-y-1">
                      {dayEvents.slice(0, 3).map((event) => (
                        <Popover key={event.id}>
                          <PopoverTrigger asChild>
                            <div
                              className={cn(
                                "text-xs p-1 rounded cursor-pointer truncate flex items-center gap-1",
                                event.type === 'calibration' 
                                  ? "bg-blue-100 text-blue-700 hover:bg-blue-200" 
                                  : "bg-green-100 text-green-700 hover:bg-green-200"
                              )}
                              onClick={() => onEventClick?.(event)}
                            >
                              {event.type === 'calibration' ? (
                                <Activity className="h-3 w-3 flex-shrink-0" />
                              ) : (
                                <Wrench className="h-3 w-3 flex-shrink-0" />
                              )}
                              <span className="truncate">{event.equipmentName}</span>
                            </div>
                          </PopoverTrigger>
                          <PopoverContent className="w-64 p-3" align="start">
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <Badge variant={event.type === 'calibration' ? 'default' : 'secondary'}>
                                  {event.type === 'calibration' ? '校正' : '维护'}
                                </Badge>
                                {event.frequency && (
                                  <Badge variant="outline">
                                    {frequencyLabels[event.frequency] || event.frequency}
                                  </Badge>
                                )}
                              </div>
                              <div>
                                <div className="font-medium">{event.equipmentName}</div>
                                <div className="text-sm text-muted-foreground">{event.title}</div>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                设备ID: {event.equipmentId}
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                      ))}
                      {dayEvents.length > 3 && (
                        <Popover>
                          <PopoverTrigger asChild>
                            <div className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                              +{dayEvents.length - 3} 更多
                            </div>
                          </PopoverTrigger>
                          <PopoverContent className="w-72 p-0" align="start">
                            <ScrollArea className="max-h-[200px]">
                              <div className="p-2 space-y-1">
                                {dayEvents.map((event) => (
                                  <div
                                    key={event.id}
                                    className={cn(
                                      "text-xs p-2 rounded cursor-pointer flex items-center gap-2",
                                      event.type === 'calibration'
                                        ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                                        : "bg-green-100 text-green-700 hover:bg-green-200"
                                    )}
                                    onClick={() => onEventClick?.(event)}
                                  >
                                    {event.type === 'calibration' ? (
                                      <Activity className="h-3 w-3 flex-shrink-0" />
                                    ) : (
                                      <Wrench className="h-3 w-3 flex-shrink-0" />
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <div className="font-medium truncate">{event.equipmentName}</div>
                                      <div className="text-xs opacity-70">{event.title}</div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </ScrollArea>
                          </PopoverContent>
                        </Popover>
                      )}
                    </div>
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
