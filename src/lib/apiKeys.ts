// @ts-nocheck

// As chaves Gemini NÃO existem mais no navegador: ficam só no servidor (api/_lib/pool.js), que também guarda,
// de forma compartilhada no Supabase, o estado de cota/espera de cada uma. Este arquivo ficou só com o que
// ainda é do lado do navegador.

// O Google zera a cota diária à meia-noite do horário do Pacífico (não UTC).
export function getQuotaDay(): string {
  try {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  } catch (e) {
    return new Date().toISOString().slice(0, 10);
  }
}

// Limpa contadores locais antigos (de quando o navegador controlava as chaves) na virada do dia.
export function checkDailyReset() {
  try {
    const today = getQuotaDay();
    const lastDate = localStorage.getItem('lexscan_key_date');
    if (lastDate && lastDate !== today) {
      localStorage.removeItem('lexscan_key_errors');
      localStorage.removeItem('lexscan_key_usage');
      localStorage.removeItem('lexscan_key_model_quota');
      localStorage.setItem('lexscan_key_date', today);
      return true;
    }
    if (!lastDate) {
      localStorage.setItem('lexscan_key_date', today);
    }
  } catch (e) {}
  return false;
}

// Estado em memória (não em localStorage) do toggle "Forçar chave paga": reseta sozinho pra "desmarcado"
// toda vez que a página é aberta ou atualizada (a chave paga NUNCA deve ser usada "sem querer" depois de um F5).
export let forcePaidKeyRuntime = false;
export function isForcePaidKeyEnabled(): boolean {
  return forcePaidKeyRuntime;
}
export function setForcePaidKeyEnabled(enabled: boolean): void {
  forcePaidKeyRuntime = enabled;
}
