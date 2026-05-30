-- 1) Add email column to profiles if not exists
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS email text;

-- 2) Backfill existing emails from auth.users when possible
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.user_id = u.id
  AND (p.email IS NULL OR p.email = '');

-- 3) Update handle_new_user trigger function to include email and default role_type
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, username, role, role_type, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', NEW.email),
    'user',
    'user',
    NEW.email
  );
  RETURN NEW;
END;
$function$;