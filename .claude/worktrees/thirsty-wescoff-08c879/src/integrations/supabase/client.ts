import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// SINGLE PROJECT — ffxhonryhaadyudpopvv only.
// DO NOT change — Lovable must not revert this.
export const SUPABASE_URL = "https://ffxhonryhaadyudpopvv.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmeGhvbnJ5aGFhZHl1ZHBvcHZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3Njg4MTMsImV4cCI6MjA4OTM0NDgxM30.Gt9yIzAU_ZmgZhmfDTJioHvMwdUkawtTm7tyrygiHEo";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});
