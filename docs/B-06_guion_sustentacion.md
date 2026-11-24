# B-06 — Guion de sustentación y checklist de ensayo

Duración sugerida: 15 a 20 minutos. Contraseña de todas las cuentas y administradores de prueba:
`Demo2026!`. Los IDs salen del mapa de datos de prueba del README (M-03) y de la carga de
MongoDB (K-03).

## 0. Antes de empezar (10 minutos antes)

- [ ] Base relacional en Neon con `01_postgresql_ddl.sql` + `04_datos_sinteticos.sql` (cuentas 1 a 15).
- [ ] MongoDB con `04_create_collections_and_indexes.js` + `05_datos_sinteticos.js` (y los tres ejemplos de `mongodb/ejemplos/` si se quieren más títulos).
- [ ] `backend/.env` con `POSTGRES_*`, `POSTGRES_SSL=true` para Neon, `MONGODB_URI`, `JWT_SECRET`.
- [ ] `cd backend && npm run start:dev` → abrir `http://localhost:5173/status`: PostgreSQL y MongoDB en **UP**.
- [ ] `cd frontend && npm run dev` en otra terminal.
- [ ] Las cuentas 6 y 7 no se usan en el ensayo (reservadas para la demo de contratación y concurrencia de Miguel).
- [ ] Si se ensayó antes, volver a cargar los datos para que "Continuar viendo" y los informes muestren lo esperado.

## 1. Arquitectura (2 min) — quien expone: Edwar

- PostgreSQL: cuentas, perfiles, planes, suscripciones y pagos (fuente de verdad, transacciones).
- MongoDB: catálogo polimórfico, Mi lista, sesiones de visualización y administradores.
- Lo único que viaja entre bases son identificadores (`accountId`, `profileId`, `planId`, `subscriptionId`).
- Mostrar `docs/E-05` (requerimientos y arquitectura) si ya está.

## 2. Flujo completo del cliente (5 min) — quien expone: Balanta

| Paso | Acción | Qué debe verse |
|------|--------|----------------|
| 2.1 | Login con `ana.garcia@example.com` | Pantalla "¿Quién está viendo?" con plan Básico vigente |
| 2.2 | Elegir "Ana Principal" (+18) | Inicio con "Continuar viendo" (*La última estación*, sesión en pausa) |
| 2.3 | Buscar `estación`; filtrar por tipo Serie, por género Familia, por año | Resultados paginados; solo publicados (no aparece *Órbita de sal*, que es borrador, ni *Voces que quedan*, retirado) |
| 2.4 | Abrir *Río de regreso* | Temporadas 1 y 2 con sus episodios en una sola lectura (consulta 4) |
| 2.5 | Reproducir T1·E1, esperar ~15 s, **Pausar**, **Reanudar**, **Avanzar 5 min**, esperar 10 s, **Finalizar** | "Tiempo visto (sin saltos)" no incluye los 5 minutos saltados; al finalizar queda completado |
| 2.6 | Volver a *La última estación* desde "Continuar viendo" | El reproductor muestra "Retomado desde" la posición guardada |
| 2.7 | "+ Mi lista" en un título y abrir **Mi lista** | Aparece con la fecha en que se agregó |
| 2.8 | (Opcional) en MongoDB mostrar el documento nuevo de `watch_activity` | `planId`/`subscriptionId` copiados de PostgreSQL, `playSegments` con el salto |

## 3. Los tres rechazos (3 min)

| Rechazo | Cómo se provoca | Mensaje esperado | Dónde se valida |
|---------|-----------------|------------------|-----------------|
| Suscripción vencida | Login `diego.fernandez@example.com` (cuenta 8, Premium vencida) → perfil "Diego 1" → Reproducir cualquier título | "Su cuenta no tiene una suscripción vigente..." | PostgreSQL, paso 1 de la verificación (`sql/03`) |
| Clasificación no permitida | Login `maria.rodriguez@example.com` (cuenta 3) → perfil "Hijo Menor" (+7). En el catálogo no aparece *La última estación* (+16). Abrir `http://localhost:5173/title/mov_000102` | "Clasificación no permitida: el contenido es +16 y el perfil permite hasta +7" | Backend: `maxAgeRating` de PostgreSQL contra `ageRating` de MongoDB |
| Exceso de perfiles | Cuenta 9 (`elena.ruiz@example.com`, Básico, máximo 1 perfil, ya tiene 1): crear un segundo perfil. O contratar Básico en la cuenta 8 (3 perfiles activos) | "La cuenta 9 alcanzó el máximo de 1 perfiles activos" / "Desactive 2 perfil(es) antes de contratar este plan" | Trigger `fn_profiles_check_limits` y función `sp_contratar_suscripcion` |

> El rechazo por exceso de perfiles depende de la API de cuenta (E-04). Si no está lista para
> la sustentación, mostrarlo con `psql` conectado como `cineconecta_user`:
> `INSERT INTO profiles (accountId, name, maxAgeRating) VALUES (9, 'Segundo', 12);`
> y `SELECT sp_contratar_suscripcion(8, 1, 'SUST-001');`

Extra si preguntan: un perfil desactivado (cuenta 10, "Pablo Histórico") aparece gris y no se
puede elegir; los perfiles de otra cuenta responden 404 aunque se cambie el `profileId` en la URL.

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
