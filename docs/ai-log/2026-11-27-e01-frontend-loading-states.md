# Bitácora de IA — E-01 (Pulido): Estados de carga y mensajes de estado en todos los flujos (Frontend)

**Fecha:** 2026-11-27  
**Tarea:** E-01 (retroalimentación del monitor) — Garantizar indicadores de carga (*inline spinners*, controles deshabilitados en proceso) y mensajes claros de estado/error en todos los flujos del frontend sin alterar la paleta ni el diseño visual global (reservado para E-02).  
**Rama:** `integracion`

---

## (a) Decisiones técnicas y patrones aplicados
- Se creó la primitiva reutilizable `InlineSpinner` en `frontend/src/components/ui.tsx` (`0.9em`, `currentColor`) junto con atributos de accesibilidad (`role="status"`, `aria-live="polite"`, `aria-hidden="true"` en el anillo giratorio) para insertarse dentro de botones `.btn` / `.btn-sm` y barras de filtro sin alterar la altura ni el alineado.
- Se aseguró `type="button"` en el botón `Reintentar` de `<ErrorBox />` para evitar envíos accidentales cuando se renderiza dentro de formularios.
- Siguiendo `vercel-react-best-practices`, se separaron los estados de carga por acción/recurso en lugar de usar un booleano global, se agregaron guardas síncronas al inicio de cada handler para evitar condiciones de carrera por doble clic, y se introdujo un contador de peticiones (`requestIdRef`) en las búsquedas paginadas para descartar respuestas obsoletas.

---

## (b) Flujos cubiertos

| Flujo | Archivo(s) | Cambios implementados |
|---|---|---|
| **Primitivas UI** | `frontend/src/components/ui.tsx`, `frontend/src/App.css` | Nuevo `InlineSpinner` (con y sin etiqueta), soporte de `onRetry` con `type="button"` en `ErrorBox`, clases `.inline-spinner`, `.is-loading` y `.sync-indicator`. |
| **Login y Registro** | `frontend/src/pages/LoginPage.tsx` | `InlineSpinner` + `"Iniciando sesión..."` / `"Creando cuenta..."`, pestañas e inputs deshabilitados mientras `busy`, limpieza de error al cambiar de pestaña y `toast('success', ...)` al autenticar o registrar. |
| **Selección de Perfiles** | `frontend/src/pages/ProfileSelectPage.tsx` | `<Spinner label="Cargando perfiles..." />` durante `refreshMe()` y `<ErrorBox onRetry={loadProfiles} />` ante fallo de red. |
| **Mi Cuenta (Planes y Perfiles)** | `frontend/src/pages/AccountPage.tsx` | Reemplazo del `busy` global por `busyPlanId`, `busyCreateProfile` y `busyProfileId`; bloqueo mutuo de acciones de perfil para evitar carreras contra el límite de PostgreSQL; errores contextuales por sección (`planError` / `profileError`) más `toast('error', ...)`. |
| **Catálogo** | `frontend/src/pages/HomePage.tsx` | Botón `Buscar` deshabilitado con `InlineSpinner` + `"Buscando..."` durante `loading`, bloqueo de envío por Enter en carga y `requestIdRef` contra respuestas desfasadas. |
| **Detalle de Título** | `frontend/src/pages/TitlePage.tsx` | Estado granular `playingTarget` (`InlineSpinner` + `"Iniciando..."` solo en el botón o episodio pulsado) y `busyList` (`InlineSpinner` + `"Agregando..."` / `"Quitando..."`) para evitar doble clic en Mi lista. |
| **Mi Lista** | `frontend/src/pages/MyListPage.tsx` | Estado `busyId` en `Quitar` (`InlineSpinner` + `"Quitando..."` y botones deshabilitados mientras se elimina un ítem). |
| **Reproductor** | `frontend/src/pages/PlayerPage.tsx` | Contador `pendingEvents` para mostrar `"Guardando progreso..."` mientras se envían eventos al servidor; estado `finishing` + `finishingRef` en `■ Finalizar` (incluyendo finalización automática al llegar al 100 %) bloqueando los controles hasta cerrar la sesión. |
| **Informes Admin** | `frontend/src/pages/admin/AdminReportsPage.tsx` | Inputs de fecha y botón `Consultar` deshabilitados con `InlineSpinner` + `"Consultando..."`; estado `downloadingCsv` independiente por informe (`revenue` / `consumption`) con `"Descargando..."`; atenuación `.is-loading` en tablas e indicador `"Actualizando..."` en cabecera. |
| **Catálogo Admin** | `frontend/src/pages/admin/AdminCatalogPage.tsx` | Indicador `"Actualizando catálogo..."` y `.is-loading` sobre la tabla al filtrar/paginar, `requestIdRef` contra carreras y `InlineSpinner` + `"Publicando..."` / `"Retirando..."` por fila. |

---

## (c) Revisión de código y verificación
- **Code Review (`superpowers:requesting-code-review`):** Un subagente revisor auditó el diff completo de los 11 archivos y detectó 3 mejoras importantes (sincronización del estado `disabled` en `MyListPage`, bloqueo de controles en el auto-finish de `PlayerPage` y guarda contra respuestas obsoletas en `HomePage` y `AdminCatalogPage`), además de 4 ajustes menores. Todos fueron aplicados antes de la compilación final.
- **Compilación (`npm run build` en `frontend/`):** `tsc && vite build` exitoso con **0 errores de TypeScript**.
- **Lint / Test:** `frontend/` no cuenta aún con archivo de configuración ESLint ni archivos de prueba Vitest previos; no se rompió ningún contrato con el backend.
