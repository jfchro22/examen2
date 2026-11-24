<template>
  <ion-page>
    <ion-header>
      <ion-toolbar color="primary">
        <ion-title>Equipos</ion-title>
        <ion-buttons slot="end">
          <ion-button router-link="/tabs/equipos/nuevo" aria-label="Nuevo equipo">
            <ion-icon slot="icon-only" :icon="add" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      <ion-toolbar>
        <ion-searchbar v-model="q" :debounce="400" placeholder="Buscar por código o nombre" @ion-input="buscar" />
      </ion-toolbar>
      <!-- YA IMPLEMENTADO: depende de useConexion() [M7] -->
      <ion-toolbar v-if="!conectado" color="warning">
        <ion-title size="small">Sin conexión: los datos pueden estar desactualizados</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <!-- [M4] Refresher: vuelve a la página 1 -->
      <ion-refresher slot="fixed" @ion-refresh="refrescar">
        <ion-refresher-content />
      </ion-refresher>

      <!-- [M4] Primera carga: skeleton, no spinner a pantalla completa -->
      <ion-list v-if="cargando && equipos.length === 0 && !error">
        <ion-item v-for="n in 6" :key="n">
          <ion-label>
            <h3><ion-skeleton-text animated style="width: 60%" /></h3>
            <p><ion-skeleton-text animated style="width: 40%" /></p>
          </ion-label>
        </ion-item>
      </ion-list>

      <!-- [M4] Error con Reintentar -->
      <div v-else-if="error" class="estado-vacio">
        <ion-icon :icon="cloudOfflineOutline" />
        <p>{{ error }}</p>
        <ion-button @click="cargar(true)">Reintentar</ion-button>
      </div>

      <!-- [M4] Estado vacío -->
      <div v-else-if="equipos.length === 0" class="estado-vacio">
        <ion-icon :icon="searchOutline" />
        <p>No hay equipos que mostrar.</p>
      </div>

      <!-- [M4] Listado + [M6] ion-item-sliding con opción Eliminar -->
      <ion-list v-else>
        <ion-item-sliding v-for="equipo in equipos" :key="equipo.id">
          <ion-item :router-link="`/tabs/equipos/${equipo.id}/editar`" detail>
            <ion-label>
              <h2>{{ equipo.nombre }}</h2>
              <p>{{ equipo.codigo }} · {{ equipo.categoria.nombre }}</p>
            </ion-label>
            <ion-badge slot="end" :color="colorEstado[equipo.estado]">{{ equipo.estado }}</ion-badge>
          </ion-item>
          <ion-item-options side="end">
            <ion-item-option color="danger" @click="confirmarEliminacion(equipo, $event)">
              <ion-icon slot="icon-only" :icon="trashOutline" />
              Eliminar
            </ion-item-option>
          </ion-item-options>
        </ion-item-sliding>
      </ion-list>

      <!-- [M4] Infinite scroll: se apaga cuando no hay más páginas -->
      <ion-infinite-scroll :disabled="!hayMas" @ion-infinite="cargarMas">
        <ion-infinite-scroll-content />
      </ion-infinite-scroll>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonSearchbar, IonContent,
  IonRefresher, IonRefresherContent, IonList, IonItem, IonLabel, IonSkeletonText, IonBadge,
  IonItemSliding, IonItemOptions, IonItemOption, IonInfiniteScroll, IonInfiniteScrollContent,
  alertController, onIonViewWillEnter,
} from '@ionic/vue';
import type { InfiniteScrollCustomEvent, RefresherCustomEvent } from '@ionic/vue';
import { add, cloudOfflineOutline, searchOutline, trashOutline } from 'ionicons/icons';
import { eliminar, listar, type Equipo, type Estado } from '@/services/equipos';
import { ErrorApi } from '@/services/errores';
import { mostrarToast } from '@/services/avisos';
import { useConexion, vibrar } from '@/composables/useConexion';

const colorEstado: Record<Estado, string> = { disponible: 'success', prestado: 'warning', mantenimiento: 'medium' };

const { conectado } = useConexion();

const equipos = ref<Equipo[]>([]);
const pagina = ref(0);
const ultimaPagina = ref(1);
const q = ref('');
const cargando = ref(false);
const error = ref('');
const hayMas = computed(() => pagina.value < ultimaPagina.value);

/** [M4] reiniciar = true → página 1 y REEMPLAZA la lista; false → página siguiente y la AGREGA. */
async function cargar(reiniciar = false) {
  const siguiente = reiniciar ? 1 : pagina.value + 1;
  cargando.value = true;
  error.value = '';
  try {
    const respuesta = await listar(siguiente, q.value);
    equipos.value = reiniciar ? respuesta.data : [...equipos.value, ...respuesta.data];
    pagina.value = respuesta.meta.current_page;
    ultimaPagina.value = respuesta.meta.last_page;
  } catch (e) {
    error.value = e instanceof ErrorApi && e.status === 0
      ? 'No fue posible conectar con la API.'
      : 'No se pudieron cargar los equipos.';
  } finally {
    cargando.value = false;
  }
}

/** [M4] ionViewWillEnter se dispara cada vez que se vuelve a la página (onMounted solo la primera vez). */
onIonViewWillEnter(() => cargar(true));

const buscar = () => cargar(true);

/** [M4] Recargar desde la página 1 y cerrar el refresher. */
async function refrescar(evento: RefresherCustomEvent) {
  await cargar(true);
  evento.target.complete();
}

/** [M4] Cargar la página siguiente y cerrar el infinite scroll. */
async function cargarMas(evento: InfiniteScrollCustomEvent) {
  await cargar(false);
  evento.target.complete();
}

/** [M6] Confirmar con alertController (leyendo el role) y eliminar sin recargar toda la lista. */
async function confirmarEliminacion(equipo: Equipo, evento: Event) {
  // 1. Cerrar el ion-item-sliding
  (evento.target as HTMLElement).closest('ion-item-sliding')?.close();

  // 2. Confirmación: solo continúa si el role es 'destructive'
  const alerta = await alertController.create({
    header: 'Eliminar equipo',
    message: `¿Eliminar ${equipo.codigo} · ${equipo.nombre}?`,
    buttons: [
      { text: 'Cancelar', role: 'cancel' },
      { text: 'Eliminar', role: 'destructive' },
    ],
  });
  await alerta.present();
  const { role } = await alerta.onDidDismiss();
  if (role !== 'destructive') return;

  // 3. Eliminar y reaccionar según el código de estado
  try {
    await eliminar(equipo.id); // 204
    equipos.value = equipos.value.filter((e) => e.id !== equipo.id);
    await vibrar();
    await mostrarToast('Equipo eliminado.', 'success');
  } catch (e) {
    if (e instanceof ErrorApi && e.status === 409) {
      await mostrarToast(e.message, 'warning'); // mensaje de la API (R1); el equipo permanece
    } else if (e instanceof ErrorApi && e.status === 404) {
      equipos.value = equipos.value.filter((x) => x.id !== equipo.id);
      await mostrarToast('El equipo ya no existe.', 'medium');
    } else {
      await mostrarToast('No se pudo eliminar el equipo.', 'danger');
    }
  }
}
</script>
