import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  
  // Combina env do Vite com process.env do Node para garantir que pegamos tudo da Vercel
  const allAvailableEnv = { ...process.env, ...env };

  const isRelevantKey = (key) => key.includes('GEMINI') || key === 'API_KEY' || key === 'VITE_API_KEY';

  // Mapeia todas as variáveis de ambiente relevantes para estarem disponíveis
  // pro front-end (tanto VITE_ quanto sem prefixo)
  const geminiKeysList = Object.keys(allAvailableEnv)
    .filter(isRelevantKey)
    .map(key => allAvailableEnv[key])
    .join(',');

  const geminiEnvVars = Object.keys(allAvailableEnv)
    .filter(isRelevantKey)
    .reduce((acc, key) => {
      acc[`process.env.${key}`] = JSON.stringify(allAvailableEnv[key]);
      return acc;
    }, {});

  return {
    plugins: [react(), tailwindcss()],
    define: {
      ...geminiEnvVars,
      'process.env.ALL_GEMINI_KEYS': JSON.stringify(geminiKeysList),
      'process.env.SUPABASE_URL': JSON.stringify(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || ''),
      'process.env.SUPABASE_ANON_KEY': JSON.stringify(env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || ''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
