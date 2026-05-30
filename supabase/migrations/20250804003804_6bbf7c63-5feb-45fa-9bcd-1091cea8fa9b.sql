-- Create parts table
CREATE TABLE public.parts (
  id TEXT NOT NULL PRIMARY KEY,
  name TEXT NOT NULL,
  barcode TEXT UNIQUE NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  supplier TEXT,
  total_stock INTEGER NOT NULL DEFAULT 0,
  remaining_stock INTEGER NOT NULL DEFAULT 0,
  unit_price DECIMAL(10,2),
  location TEXT,
  min_stock_level INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create part_transactions table
CREATE TABLE public.part_transactions (
  id TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  part_id TEXT NOT NULL REFERENCES public.parts(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('in', 'out')),
  quantity INTEGER NOT NULL,
  equipment_id TEXT REFERENCES public.equipment(id),
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  signature TEXT,
  notes TEXT,
  transaction_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create part_usage table  
CREATE TABLE public.part_usage (
  id TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  part_id TEXT NOT NULL REFERENCES public.parts(id) ON DELETE CASCADE,
  equipment_id TEXT NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  usage_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  signature TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.part_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.part_usage ENABLE ROW LEVEL SECURITY;

-- Create policies for parts
CREATE POLICY "Parts are publicly readable" ON public.parts FOR SELECT USING (true);
CREATE POLICY "Anyone can insert parts" ON public.parts FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update parts" ON public.parts FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete parts" ON public.parts FOR DELETE USING (true);

-- Create policies for part_transactions
CREATE POLICY "Part transactions are publicly readable" ON public.part_transactions FOR SELECT USING (true);
CREATE POLICY "Anyone can insert part transactions" ON public.part_transactions FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update part transactions" ON public.part_transactions FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete part transactions" ON public.part_transactions FOR DELETE USING (true);

-- Create policies for part_usage
CREATE POLICY "Part usage is publicly readable" ON public.part_usage FOR SELECT USING (true);
CREATE POLICY "Anyone can insert part usage" ON public.part_usage FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update part usage" ON public.part_usage FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete part usage" ON public.part_usage FOR DELETE USING (true);

-- Create triggers for updated_at
CREATE TRIGGER update_parts_updated_at
BEFORE UPDATE ON public.parts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_parts_barcode ON public.parts(barcode);
CREATE INDEX idx_parts_category ON public.parts(category);
CREATE INDEX idx_part_transactions_part_id ON public.part_transactions(part_id);
CREATE INDEX idx_part_transactions_type ON public.part_transactions(type);
CREATE INDEX idx_part_usage_part_id ON public.part_usage(part_id);
CREATE INDEX idx_part_usage_equipment_id ON public.part_usage(equipment_id);