-- Create user profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  username TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id)
);

-- Create audit log table
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  username TEXT NOT NULL,
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  old_values JSONB,
  new_values JSONB,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Create policies for profiles
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create policies for audit logs
CREATE POLICY "All users can view audit logs" ON public.audit_logs FOR SELECT USING (true);
CREATE POLICY "Only authenticated users can insert audit logs" ON public.audit_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Create function to handle new user registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, username, role)
  VALUES (
    NEW.id, 
    COALESCE(NEW.raw_user_meta_data->>'username', NEW.email), 
    'user'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user registration
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create function to log equipment changes
CREATE OR REPLACE FUNCTION public.log_equipment_changes()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for equipment audit logging
CREATE TRIGGER equipment_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.equipment
  FOR EACH ROW EXECUTE FUNCTION public.log_equipment_changes();

-- Update equipment table to include scrapped status
ALTER TABLE public.equipment 
ADD COLUMN IF NOT EXISTS is_scrapped BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS scrapped_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS scrapped_by UUID REFERENCES auth.users(id);

-- Update updated_at trigger function
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();