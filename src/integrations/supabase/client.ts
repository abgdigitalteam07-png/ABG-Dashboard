import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Pinned to ffxhonryhaadyudpopvv — all edge functions are deployed and tested here.
// The anon key is public by design (it is safe to commit).
const SUPABASE_URL = "https://ffxhonryhaadyudpopvv.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmeGhvbnJ5aGFhZHl1ZHBvcHZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3Njg4MTMsImV4cCI6MjA4OTM0NDgxM30.Gt9yIzAU_ZmgZhmfDTJioHvMwdUkawtTm7tyrygiHEo";

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});