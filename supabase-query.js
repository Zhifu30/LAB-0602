const { createClient } = require('@supabase/supabase-js');
const url = 'https://uvylubaxpkmzymdggoyf.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2eWx1YmF4cGttenltZGdnb3lmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mzg0ODI0NCwiZXhwIjoyMDY5NDI0MjQ0fQ.sNN3-ABJp067DsnQpFOfe8yeAfysnNXyaiL0JazXiLg';
const supabase = createClient(url, key);
(async () => {
  try {
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public');
    console.log('tablesError:', tablesError);
    console.log('tablesCount:', tables?.length);
    console.log('tablesSample:', tables?.slice(0, 20));

    const { data: eq, error: eqError } = await supabase
      .from('equipment')
      .select('id')
      .limit(1);
    console.log('equipmentError:', eqError);
    console.log('equipmentSample:', eq);
  } catch (err) {
    console.error('exception:', err);
  }
})();
