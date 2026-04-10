import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// SINGLE PROJECT — ffxhonryhaadyudpopvv is the one and only Supabase project.
// All edge functions, auth, secrets, and database tables live here.
// Tested: login works, all edge functions return correct data.
// DO NOT revert to env vars — Lovable's build overrides them with a different project.
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
