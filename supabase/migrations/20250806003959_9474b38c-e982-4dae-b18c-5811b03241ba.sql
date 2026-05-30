-- Add new fields to parts table
ALTER TABLE public.parts ADD COLUMN IF NOT EXISTS serial_number text;
ALTER TABLE public.parts ADD COLUMN IF NOT EXISTS quantity_per_vial integer DEFAULT 1;
ALTER TABLE public.parts ADD COLUMN IF NOT EXISTS image_url text;