import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://uvylubaxpkmzymdggoyf.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2eWx1YmF4cGttenltZGdnb3lmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4NDgyNDQsImV4cCI6MjA2OTQyNDI0NH0.b61dzj_EEZOdf-96M6Dkj3khFLfL5oaCxcIqUqzDVfE";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
