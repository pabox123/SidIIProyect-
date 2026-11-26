# B-06 — Guion de sustentación y checklist de ensayo

Duración sugerida: 15 a 20 minutos. Contraseña de todas las cuentas y administradores de prueba:
`Demo2026!`. Los IDs salen del mapa de datos de prueba del README (M-03) y de la carga de
MongoDB (K-03).

## 0. Antes de empezar (10 minutos antes)

- [ ] Base relacional en Neon con `01_postgresql_ddl.sql` + `04_datos_sinteticos.sql` (cuentas 1 a 15).
- [ ] MongoDB con `04_create_collections_and_indexes.js` + `05_datos_sinteticos.js` (y los tres ejemplos de `mongodb/ejemplos/` si se quieren más títulos).
- [ ] `backend/.env` con `POSTGRES_*` (usuario `cineconecta_user`), `POSTGRES_SSL=true` para Neon, `MONGODB_URI` (usuario `cineconecta_app` de `mongodb/06`), `JWT_SECRET`.
- [ ] `cd backend && npm run start:dev` → abrir `http://localhost:5173/status`: PostgreSQL y MongoDB en **UP**.
- [ ] `cd frontend && npm run dev` en otra terminal.
- [ ] La cuenta 7 no se usa en el ensayo (reservada para la demo de concurrencia de Miguel). Para el flujo de contratación se registra una cuenta nueva; cambiar el correo en cada ensayo.
- [ ] Si se ensayó antes, volver a cargar los datos para que "Continuar viendo" y los informes muestren lo esperado.

## 1. Arquitectura (2 min) — quien expone: Edwar

- PostgreSQL: cuentas, perfiles, planes, suscripciones y pagos (fuente de verdad, transacciones).
- MongoDB: catálogo polimórfico, Mi lista, sesiones de visualización y administradores.
- Lo único que viaja entre bases son identificadores (`accountId`, `profileId`, `planId`, `subscriptionId`).
- Mostrar `docs/E-05` (requerimientos y arquitectura) si ya está.

## 2. Flujo completo: contratación y visualización (6 min) — quien expone: Balanta / Edwar

| Paso | Acción | Qué debe verse |
|------|--------|----------------|
| 2.1 | Pestaña **Crear cuenta**: nombre, correo nuevo (p. ej. `demo.sustentacion@example.com`) y contraseña | Entra directo a **Mi cuenta**, "Sin suscripción vigente" |
| 2.2 | Intentar **Crear perfil** antes de contratar | Rechazo: "Su cuenta no tiene una suscripción vigente..." (trigger de PostgreSQL) |
| 2.3 | Marcar **Simular pago rechazado** y contratar Estándar | "Pago no aprobado: la contratación requiere pago aprobado"; el historial sigue vacío (no quedó suscripción sin pago) |
| 2.4 | Desmarcar y contratar **Estándar** | Suscripción vigente de 30 días y su pago en el historial (una sola transacción, M-02) |
| 2.5 | Crear perfiles "Adulto" (+18) y "Niños" (+7) | Aparecen activos: 2 de 2 permitidos |
| 2.6 | Crear un tercer perfil | **Rechazo por exceso de perfiles**: "alcanzó el máximo de 2 perfiles activos" |
| 2.7 | Ir a **Inicio** → elegir "Adulto" → buscar `estación`; filtrar por tipo Serie, género Familia, año | Resultados paginados; solo publicados (no aparecen *Órbita de sal*, borrador, ni *Voces que quedan*, retirado) |
| 2.8 | Abrir *Río de regreso* | Temporadas 1 y 2 con sus episodios en una sola lectura (consulta 4) |
| 2.9 | Reproducir T1·E1, esperar ~15 s, **Pausar**, **Reanudar**, **Avanzar 5 min**, esperar 10 s, **Finalizar** | "Tiempo visto (sin saltos)" no incluye los 5 minutos saltados; al finalizar queda completado |
| 2.10 | "+ Mi lista" en un título y abrir **Mi lista** | Aparece con la fecha en que se agregó |
| 2.11 | Salir y entrar con `ana.garcia@example.com` → "Ana Principal" | "Continuar viendo" con *La última estación* (sesión en pausa); al reproducir muestra "Retomado desde" |
| 2.12 | (Opcional) en MongoDB mostrar el documento nuevo de `watch_activity` | `planId`/`subscriptionId` copiados de PostgreSQL, `playSegments` con el salto |

## 3. Los tres rechazos (3 min)

| Rechazo | Cómo se provoca | Mensaje esperado | Dónde se valida |
|---------|-----------------|------------------|-----------------|
| Suscripción vencida | Login `diego.fernandez@example.com` (cuenta 8, Premium vencida) → perfil "Diego 1" | El catálogo no carga y reproducir tampoco: "Su cuenta no tiene una suscripción vigente..." | PostgreSQL, verificación de `sql/03` en el backend |
| Clasificación no permitida | Login `maria.rodriguez@example.com` (cuenta 3) → perfil "Hijo Menor" (+7). En el catálogo no aparece *La última estación* (+16). Abrir `http://localhost:5173/title/mov_000102` | "Clasificación no permitida: el contenido es +16 y el perfil permite hasta +7" | Backend: `maxAgeRating` de PostgreSQL contra `ageRating` de MongoDB |
| Exceso de perfiles | Paso 2.6 del flujo. Otra opción: cuenta 8 (3 perfiles activos) → **Mi cuenta** → contratar Básico | "alcanzó el máximo de N perfiles activos" / "Desactive 2 perfil(es) antes de contratar este plan" | Trigger `fn_profiles_check_limits` y función `sp_contratar_suscripcion` |

Extra si preguntan: un perfil desactivado (cuenta 10, "Pablo Histórico") aparece gris y no se
puede elegir, pero conserva su actividad; los perfiles de otra cuenta responden 403/404 aunque se
cambie el `profileId` en la URL.

## 4. Administración del catálogo (3 min) — Balanta / Krystal

| Paso | Acción | Qué debe verse |
|------|--------|----------------|
| 4.1 | Salir. Login en la pestaña **Administradores** con `admin@cineconecta.example` | Tabla con todos los estados (borrador, publicado, retirado) |
| 4.2 | **Nuevo contenido** → Serie con 2 temporadas y 2 episodios cada una. Guardar con un campo vacío | Mensajes de validación (campos obligatorios) |
| 4.3 | Repetir el número de episodio 1 dos veces en la misma temporada | "La temporada 1 tiene números de episodio repetidos" |
| 4.4 | Corregir y guardar | Se crea como **Borrador** con `ser_000203` y `episodeId` generados |
| 4.5 | **Publicar** y, con otra ventana como cliente, buscarla | Aparece en el catálogo |
| 4.6 | **Retirar** *Semillas del páramo* | Desaparece del catálogo y de "Continuar viendo"; en "Mi lista" de "Hijo Menor" (cuenta 3) sigue pero como **No disponible** |

## 5. Informes (2 min)

1. Menú **Informes**, rango `2026-01-01` a `2026-12-31` → **Consultar**.
2. Ingresos por plan (solo PostgreSQL): Premium 225.000, Estándar 150.000, Básico 60.000 con los datos base (cambia si se hicieron contrataciones en el ensayo).
3. Consumo por plan y tipo (MongoDB + PostgreSQL): explicar que el plan es el vigente al iniciar cada sesión (cuenta 5 tiene sesiones bajo Básico, Estándar y Premium).
4. Cambiar el rango a noviembre y mostrar que los números cambian.
5. **⬇ CSV** en los dos informes y abrirlos en Excel. Ejemplos en `docs/B-05_informes_ejemplo/`.
6. (Opcional) con `reportes@cineconecta.example` (rol `report_viewer`) se ven los informes pero no la gestión del catálogo.

## 6. Concurrencia y fallo a mitad de transacción (3 min) — Miguel (M-06)

- Dos contrataciones simultáneas para la cuenta 7: una gana, la otra recibe "ya tiene una suscripción vigente" (bloqueo `FOR UPDATE` sobre la cuenta).
- Fallo a mitad de la transacción: no quedan suscripciones sin pago (constraint trigger diferido).
- Consultas que muestran que no hay períodos superpuestos (`ex_subs_no_overlap`) ni registros parciales.

## 7. Preguntas probables y respuesta corta

- **¿Por qué el catálogo en MongoDB?** Tres tipos con estructuras distintas y episodios embebidos que se leen siempre con su serie.
- **¿Cómo se evita que un usuario vea datos de otra cuenta?** El `accountId` sale del token; todas las consultas filtran por él y el perfil se verifica en PostgreSQL.
- **¿Qué pasa si MongoDB se cae?** Responde 503 controlado; contratación e informe de ingresos siguen funcionando porque solo usan PostgreSQL.
- **¿Cómo se calcula el tiempo visto?** Unión de tramos realmente reproducidos; los saltos y los avances más rápidos que el tiempo real no suman.
- **¿Cómo se evitan sesiones duplicadas si se reintenta?** El `_id` de la sesión lo genera la aplicación.

## 8. Checklist del ensayo del equipo

- [ ] Ensayo completo cronometrado con los cuatro (fecha: ______)
- [ ] Cada uno sabe qué parte expone y quién toma el control del computador
- [ ] Datos recargados después del ensayo
- [ ] Plan B si falla la red: base local con los mismos scripts y capturas de cada paso
- [ ] PDF de entrega previa y enlace al repositorio entregados (E-06)
