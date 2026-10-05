import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  
  // Combina env do Vite com process.env do Node para garantir que pegamos tudo da Vercel
  const allAvailableEnv = { ...process.env, ...env };

  // As chaves Gemini (e as de qualquer outro provedor) NÃO entram no bundle do navegador: ficam só no servidor
  // (api/*.js lê direto de process.env na Vercel). O bundle é público — qualquer chave aqui seria visível a todos.

  const supabaseUrlValue = allAvailableEnv.VITE_SUPABASE_URL || allAvailableEnv.SUPABASE_URL || allAvailableEnv.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKeyValue = allAvailableEnv.VITE_SUPABASE_ANON_KEY || allAvailableEnv.SUPABASE_ANON_KEY || allAvailableEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY || allAvailableEnv.SUPABASE_PUBLISHABLE_KEY || allAvailableEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

  return {
    plugins: [react(), tailwindcss()],
    define: {
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
