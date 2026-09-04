import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  
  // Combina env do Vite com process.env do Node para garantir que pegamos tudo da Vercel
  const allAvailableEnv = { ...process.env, ...env };

  // Mapeia todas as variáveis de ambiente que tenham "GEMINI" ou seja "API_KEY"
  const geminiKeysList = Object.keys(allAvailableEnv)
    .filter(key => key.includes('GEMINI') || key.includes('API_KEY'))
    .map(key => allAvailableEnv[key])
    .filter(Boolean)
    .join(',');

  const geminiEnvVars = Object.keys(allAvailableEnv)
    .filter(key => key.includes('GEMINI') || key.includes('API_KEY'))
    .reduce((acc, key) => {
      acc[`process.env.${key}`] = JSON.stringify(allAvailableEnv[key]);
      return acc;
    }, {});

  const supabaseUrlValue = allAvailableEnv.VITE_SUPABASE_URL || allAvailableEnv.SUPABASE_URL || allAvailableEnv.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKeyValue = allAvailableEnv.VITE_SUPABASE_ANON_KEY || allAvailableEnv.SUPABASE_ANON_KEY || allAvailableEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY || allAvailableEnv.SUPABASE_PUBLISHABLE_KEY || allAvailableEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

  return {
    plugins: [react(), tailwindcss()],
    define: {
      ...geminiEnvVars,
      'process.env.ALL_GEMINI_KEYS': JSON.stringify(geminiKeysList),
      'process.env.SUPABASE_URL': JSON.stringify(supabaseUrlValue),
      'process.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrlValue),
      'process.env.NEXT_PUBLIC_SUPABASE_URL': JSON.stringify(supabaseUrlValue),
      'process.env.SUPABASE_ANON_KEY': JSON.stringify(supabaseKeyValue),
      'process.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseKeyValue),
      'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': JSON.stringify(supabaseKeyValue),
      'process.env.SUPABASE_PUBLISHABLE_KEY': JSON.stringify(supabaseKeyValue),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      strictPort: true,
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
