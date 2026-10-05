// Autenticação das rotas de IA: só quem está logado no app (sessão Supabase) pode gastar as chaves Gemini.
// O navegador manda o JWT da sessão em "Authorization: Bearer ..."; aqui conferimos com o Supabase.
import { createClient } from '@supabase/supabase-js';

function firstEnv(names) {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim()) return v.trim();
  }
  return '';
}

export function getSupabaseUrl() {
  return firstEnv(['VITE_SUPABASE_URL', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL']);
}

export function getSupabaseAnonKey() {
  return firstEnv([
    'VITE_SUPABASE_ANON_KEY',
    'SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'VITE_SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_PUBLISHABLE_KEY',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  ]);
}

// Cliente que age COMO o usuário (RLS vale): usado também pro estado compartilhado das chaves.
export function supabaseAsUser(token) {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  if (!url || !key) return null;
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Retorna { ok:true, user, db } ou { ok:false, status, error }.
export async function authenticate(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const token = String(header).replace(/^Bearer\s+/i, '').trim();
  if (!token) return { ok: false, status: 401, error: 'Sem sessão: entre no app para usar a leitura no servidor.' };
  const db = supabaseAsUser(token);
  if (!db) return { ok: false, status: 500, error: 'Servidor sem configuração do Supabase (URL/chave pública).' };
  try {
    const { data, error } = await db.auth.getUser(token);
    if (error || !data?.user) return { ok: false, status: 401, error: 'Sessão inválida ou expirada.' };
    return { ok: true, user: data.user, db };
  } catch (e) {
    return { ok: false, status: 500, error: 'Falha ao validar sessão: ' + (e?.message || e) };
  }
}
