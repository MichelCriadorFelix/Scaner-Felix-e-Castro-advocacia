// @ts-nocheck
import { createClient } from '@supabase/supabase-js';

// ── Integração Bancos de Dados ────────────────────────────────────────────────
export const supabaseUrl = 
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_URL) || 
  process.env.VITE_SUPABASE_URL || 
  process.env.SUPABASE_URL || 
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.NEXT_PUBLIC_SUPABASE_URL) || 
  process.env.NEXT_PUBLIC_SUPABASE_URL || 
  '';

export const supabaseKey = 
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY) || 
  process.env.VITE_SUPABASE_ANON_KEY || 
  process.env.SUPABASE_ANON_KEY || 
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) || 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.SUPABASE_PUBLISHABLE_KEY) || 
  process.env.SUPABASE_PUBLISHABLE_KEY || 
  '';

export const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey, {
  auth: {
    storageKey: 'felix_castro_scanner_app_auth_session_v3',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
}) : null;
