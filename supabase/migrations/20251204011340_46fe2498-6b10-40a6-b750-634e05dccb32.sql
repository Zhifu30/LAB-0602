-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule maintenance reminder check to run daily at 8 AM (Hong Kong time = 0 AM UTC)
SELECT cron.schedule(
  'send-maintenance-reminders-daily',
  '0 0 * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://uvylubaxpkmzymdggoyf.supabase.co/functions/v1/send-maintenance-reminders',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2eWx1YmF4cGttenltZGdnb3lmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4NDgyNDQsImV4cCI6MjA2OTQyNDI0NH0.b61dzj_EEZOdf-96M6Dkj3khFLfL5oaCxcIqUqzDVfE"}'::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
  $$
);