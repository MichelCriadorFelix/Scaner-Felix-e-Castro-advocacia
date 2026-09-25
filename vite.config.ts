import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  
  // Combina env do Vite com process.env do Node para garantir que pegamos tudo da Vercel
  const allAvailableEnv = { ...process.env, ...env };

  // Chaves de OUTROS provedores (Mistral, NVIDIA...) são usadas só no servidor (api/*.js) e
  // NUNCA podem ir pro bundle do navegador — o filtro "API_KEY" abaixo as pegava por engano,
  // expondo-as publicamente no JavaScript do site e ainda misturando-as no pool de chaves Gemini.
  const isGeminiClientKey = (key: string) =>
    (key.includes('GEMINI') || key.includes('API_KEY')) && !/MISTRAL|NVIDIA|OPENROUTER|OPENAI|ANTHROPIC|GROQ|SUPABASE|SERVICE_ROLE|SECRET/i.test(key);

  // Mapeia as variáveis de ambiente com "GEMINI" ou "API_KEY" (exceto as de outros provedores)
  const geminiKeysList = Object.keys(allAvailableEnv)
    .filter(isGeminiClientKey)
    .map(key => allAvailableEnv[key])
    .filter(Boolean)
    .join(',');

  const geminiEnvVars = Object.keys(allAvailableEnv)
    .filter(isGeminiClientKey)
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
