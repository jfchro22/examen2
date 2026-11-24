import { computed, ref } from 'vue';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { Device } from '@capacitor/device';
import { api } from '@/services/api';

export interface Usuario { id: number; nombre: string }

const CLAVE_TOKEN = 'token';
const CLAVE_USUARIO = 'usuario';

// Estado compartido por toda la app (fuera de la función = un solo valor) — YA IMPLEMENTADO
const token = ref<string | null>(null);
const usuario = ref<Usuario | null>(null);
let tokenCargado = false;

/** YA IMPLEMENTADO — lo usa services/api.ts para armar el encabezado Authorization. */
export const obtenerToken = () => token.value;

/** [M2] Borra token y usuario de la memoria (refs) y del almacenamiento cifrado. */
export async function olvidarSesion() {
  token.value = null;
  usuario.value = null;
  try {
    await SecureStorage.remove(CLAVE_TOKEN);
    await SecureStorage.remove(CLAVE_USUARIO);
  } catch {
    // Si el almacenamiento falla, la sesión en memoria ya quedó limpia
  }
}

export function useAuth() {
  const estaAutenticado = computed(() => token.value !== null);

  /** [M2] Inicia sesión y guarda token y usuario de forma segura. Los errores los atrapa LoginPage. */
  async function login(email: string, password: string) {
    const info = await Device.getInfo();
    const device_name = `${info.platform} ${info.model}`.slice(0, 60);

    const respuesta = await api<{ token: string; usuario: Usuario }>('/login', {
      method: 'POST',
      body: { email, password, device_name },
    });

    token.value = respuesta.token;
    usuario.value = respuesta.usuario;
    await SecureStorage.set(CLAVE_TOKEN, respuesta.token);
    await SecureStorage.set(CLAVE_USUARIO, JSON.stringify(respuesta.usuario));
  }

  /** [M2] Restaura la sesión guardada al abrir la app. Se ejecuta una sola vez. */
  async function cargarToken() {
    if (tokenCargado) return;
    tokenCargado = true;
    try {
      const guardado = await SecureStorage.get(CLAVE_TOKEN);
      const datosUsuario = await SecureStorage.get(CLAVE_USUARIO);
      token.value = typeof guardado === 'string' ? guardado : null;
      usuario.value = typeof datosUsuario === 'string' ? JSON.parse(datosUsuario) : null;
    } catch {
      token.value = null;
      usuario.value = null;
    }
  }

  /** [M2] Revoca el token en el servidor y SIEMPRE borra la sesión local, aunque la API falle. */
  async function cerrarSesion() {
    try {
      await api('/logout', { method: 'POST' });
    } catch {
      // Sin red o token vencido: igual se cierra la sesión local
    } finally {
      await olvidarSesion();
    }
  }

  return { usuario, estaAutenticado, login, cargarToken, cerrarSesion };
}
