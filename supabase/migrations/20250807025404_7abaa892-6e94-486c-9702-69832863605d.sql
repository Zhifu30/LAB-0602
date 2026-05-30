-- Fix search path security warnings
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, username, role)
  VALUES (
    NEW.id, 
    COALESCE(NEW.raw_user_meta_data->>'username', NEW.email), 
    'user'
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_equipment_changes()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = 'public'
AS $$
DECLARE
  current_user_profile RECORD;
BEGIN
  -- Get current user profile
  SELECT username INTO current_user_profile FROM public.profiles WHERE user_id = auth.uid();
  
  IF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs (user_id, username, action, table_name, record_id, old_values, new_values)
    VALUES (
      auth.uid(),
      COALESCE(current_user_profile.username, 'unknown'),
      'UPDATE',
      'equipment',
      NEW.id,
      to_jsonb(OLD),
      to_jsonb(NEW)
    );
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (user_id, username, action, table_name, record_id, new_values)
    VALUES (
      auth.uid(),
      COALESCE(current_user_profile.username, 'unknown'),
      'INSERT',
      'equipment',
      NEW.id,
      to_jsonb(NEW)
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (user_id, username, action, table_name, record_id, old_values)
    VALUES (
      auth.uid(),
      COALESCE(current_user_profile.username, 'unknown'),
      'DELETE',
      'equipment',
      OLD.id,
      to_jsonb(OLD)
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;