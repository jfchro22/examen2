import { onMounted, onUnmounted, ref } from 'vue';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

/**
 * [M7] useConexion() devuelve { conectado, tipo }.
 * Estado inicial con Network.getStatus(); se actualiza con networkStatusChange;
 * el oyente se libera al destruir la página que lo usa.
 */
export function useConexion() {
  const conectado = ref(true);
  const tipo = ref('unknown');
  let oyente: PluginListenerHandle | null = null;
  let destruido = false;

  onMounted(async () => {
    const estado = await Network.getStatus();
    conectado.value = estado.connected;
    tipo.value = estado.connectionType;

    const handle = await Network.addListener('networkStatusChange', (nuevo) => {
      conectado.value = nuevo.connected;
      tipo.value = nuevo.connectionType;
    });
    // Si la página se destruyó mientras se registraba el oyente, se libera de inmediato
    if (destruido) await handle.remove();
    else oyente = handle;
  });

  onUnmounted(() => {
    destruido = true;
    oyente?.remove();
    oyente = null;
  });

  return { conectado, tipo };
}

/** [M7] Vibración breve de confirmación. En el navegador no hace nada. */
export async function vibrar() {
  if (!Capacitor.isNativePlatform()) return;
  await Haptics.impact({ style: ImpactStyle.Light });
}
