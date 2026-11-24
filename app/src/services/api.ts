import { ErrorApi } from './errores';
import { obtenerToken, olvidarSesion } from '@/composables/useAuth';
import router from '@/router';

const BASE_URL = import.meta.env.VITE_API_URL;
const TIEMPO_MAXIMO_MS = 10_000;

export interface OpcionesApi {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  params?: Record<string, string | number | undefined>;
}

/**
 * [M1] Cliente HTTP único de la aplicación.
 * Todas las vistas y servicios pasan por aquí: URL, encabezados, token, tiempo máximo y errores.
 */
export async function api<T = unknown>(ruta: string, opciones: OpcionesApi = {}): Promise<T> {
  const { method = 'GET', body, params } = opciones;

  // 1. URL = BASE_URL + ruta + query string solo con params que tengan valor
  const consulta = new URLSearchParams();
  for (const [clave, valor] of Object.entries(params ?? {})) {
    if (valor !== undefined && valor !== '') consulta.append(clave, String(valor));
  }
 const qs = consulta.toString();
const url = `${BASE_URL}${ruta}${qs ? `?${qs}` : ''}`;

  // 2-4. Encabezados: Accept siempre, Bearer solo si hay token (nunca en la URL), JSON si hay cuerpo
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = obtenerToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  // 5. Tiempo máximo con AbortController
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), TIEMPO_MAXIMO_MS);

  let respuesta: Response;
  try {
    respuesta = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controlador.signal,
    });
  } catch {
    // Sin red, tiempo agotado o CORS: no hubo respuesta
    throw new ErrorApi(0, { mensaje: 'No fue posible conectar con la API.' });
  } finally {
    clearTimeout(temporizador);
  }

  // 6. 204 → sin contenido
  if (respuesta.status === 204) return null as T;

  const cuerpo = await respuesta.json().catch(() => null);

  // 7. Error HTTP; un 401 (fuera de /login) invalida la sesión local y lleva a /login
  if (!respuesta.ok) {
    if (respuesta.status === 401 && ruta !== '/login') {
      await olvidarSesion();
      router.replace('/login');
    }
    throw new ErrorApi(respuesta.status, cuerpo);
  }

  // 8. Caso feliz
  return cuerpo as T;
}
