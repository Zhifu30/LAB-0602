import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Equipment } from '@/types/equipment';
import { AlertTriangle, Calendar, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface CalibrationAlert {
  equipment: Equipment;
  daysUntilCalibration: number;
  urgency: 'urgent' | 'warning' | 'normal';
}

const CalibrationReminder: React.FC = () => {
  const [alerts, setAlerts] = useState<CalibrationAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCalibrationAlerts();
    // Check every hour
    const interval = setInterval(fetchCalibrationAlerts, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchCalibrationAlerts = async () => {
    try {
      const { data: equipment, error } = await supabase
        .from('equipment')
        .select('*')
        .not('next_calibration_date', 'is', null)
        .not('is_scrapped', 'eq', true);

      if (error) throw error;

      const today = new Date();
      const calibrationAlerts: CalibrationAlert[] = [];

      for (const eq of equipment || []) {
        if (eq.next_calibration_date) {
          const calibrationDate = new Date(eq.next_calibration_date);
          const daysUntilCalibration = Math.ceil(
            (calibrationDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
          );

          // Check if notification should be sent on the 15th of the month before calibration
          const notificationDate = new Date(calibrationDate);
          notificationDate.setMonth(notificationDate.getMonth() - 1);
          notificationDate.setDate(15);
          
          const shouldNotify = today >= notificationDate && today < calibrationDate && !eq.calibration_reminder_sent;

          if (daysUntilCalibration <= 45 || shouldNotify) { // Show alerts for equipment due in 45 days
            let urgency: 'urgent' | 'warning' | 'normal' = 'normal';
            
            if (daysUntilCalibration <= 5) {
              urgency = 'urgent';
            } else if (daysUntilCalibration <= 15) {
              urgency = 'warning';
            }

            calibrationAlerts.push({
              equipment: eq as any,
              daysUntilCalibration,
              urgency
            });

            // Send notification if it's the right time
            if (shouldNotify) {
              await sendCalibrationReminder(eq as any);
            }
          }
        }
      }

      // Sort by urgency and days
      calibrationAlerts.sort((a, b) => {
        const urgencyOrder = { urgent: 0, warning: 1, normal: 2 };
        if (urgencyOrder[a.urgency] !== urgencyOrder[b.urgency]) {
          return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
        }
        return a.daysUntilCalibration - b.daysUntilCalibration;
      });

      setAlerts(calibrationAlerts);

      // Notifications are already sent in the loop above

    } catch (error) {
      console.error('Error fetching calibration alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const sendCalibrationReminder = async (equipment: Equipment) => {
    try {
      // Update the reminder sent flag
      await supabase
        .from('equipment')
        .update({ calibration_reminder_sent: true })
        .eq('id', equipment.id);

      // Get equipment manager (15888)
      const { data: managerProfile } = await supabase
        .from('profiles')
        .select('email')
        .eq('username', '15888')
        .single();

      const recipientEmails = [
        'zhifu.feng@brightfuture.com.hk'  // Admin email
      ];

      // Add responsible person's email if available
      if (equipment.responsible_email) {
        recipientEmails.push(equipment.responsible_email);
      }

      // Add equipment manager's email if available
      if (managerProfile?.email) {
        recipientEmails.push(managerProfile.email);
      }

      // Send email notification to all recipients
      for (const email of recipientEmails) {
        await supabase.functions.invoke('send-equipment-notification', {
          body: {
            equipmentId: equipment.id,
            equipmentName: equipment.name,
            status: 'calibration-reminder',
            reporterName: 'System',
            description: `设备 ${equipment.name} (${equipment.model}) 位于 ${equipment.location}，需要在 ${equipment.nextCalibrationDate} 进行校正。负责人: ${equipment.responsible}`,
            adminEmail: email,
            responsible: equipment.responsible
          }
        });
      }

      toast.success(`校正提醒已发送至${recipientEmails.length}个邮箱: ${equipment.name}`);
    } catch (error) {
      console.error('Error sending calibration reminder:', error);
      toast.error(`发送校正提醒失败: ${equipment.name}`);
    }
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'urgent':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'warning':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      default:
        return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  const getUrgencyIcon = (urgency: string) => {
    switch (urgency) {
      case 'urgent':
        return <AlertTriangle className="h-4 w-4 text-red-600" />;
      case 'warning':
        return <Clock className="h-4 w-4 text-amber-600" />;
      default:
        return <Calendar className="h-4 w-4 text-blue-600" />;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            校正提醒
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-sm text-gray-600 mt-2">加载中...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (alerts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-green-600" />
            校正提醒
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">暂无即将到期的校正任务</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          校正提醒 ({alerts.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 max-h-60 overflow-y-auto">
          {alerts.map((alert) => (
            <div
              key={alert.equipment.id}
              className="flex items-center justify-between p-3 border rounded-lg bg-gray-50"
            >
              <div className="flex items-center space-x-3">
                {getUrgencyIcon(alert.urgency)}
                <div>
                  <p className="font-medium text-sm">{alert.equipment.name}</p>
                  <p className="text-xs text-gray-600">
                    {alert.equipment.model} - {alert.equipment.location}
                  </p>
                  <p className="text-xs text-gray-500">
                    负责人: {alert.equipment.responsible}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <Badge className={getUrgencyColor(alert.urgency)}>
                  {alert.daysUntilCalibration <= 0 
                    ? '已到期' 
                    : `${alert.daysUntilCalibration}天后到期`
                  }
                </Badge>
                <p className="text-xs text-gray-500 mt-1">
                  {alert.equipment.nextCalibrationDate}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default CalibrationReminder;