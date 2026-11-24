# Documento de integración entre bases de datos — CineConecta

## 1. Identificadores compartidos

Los únicos datos que viajan entre las dos bases son identificadores. PostgreSQL es la fuente de
verdad de cuentas, perfiles, planes, suscripciones y pagos; MongoDB nunca copia nombres, correos
ni precios, solo guarda los identificadores que necesita para relacionar su información con la
de PostgreSQL.

| Identificador | Viene de (PostgreSQL) | Dónde se usa en MongoDB | Tipo en Mongo |
|---|---|---|---|
| `accountId` | `ACCOUNTS.accountId` | `user_lists`, `watch_activity` | entero (`NumberInt`) |
| `profileId` | `PROFILES.profileId` | `user_lists`, `watch_activity` | entero (`NumberInt`) |
| `planId` | `PLANS.planId` | `watch_activity` | entero (`NumberInt`) |
| `subscriptionId` | `SUBSCRIPTIONS.subscriptionId` | `watch_activity` | entero (`NumberInt`) |
| `contentId`, `episodeId` | no existen en PostgreSQL; viven en `catalog_items` | `user_lists`, `watch_activity` | texto (patrón `mov_`/`ser_`/`doc_`/`epi_`) |

`contentId` y `episodeId` son identificadores propios de MongoDB: el catálogo no tiene
representación en el modelo relacional, así que estos IDs solo se verifican dentro de la propia
base documental (que el documento exista, esté publicado y la clasificación sea permitida).

En PostgreSQL las columnas sin comillas quedan en minúscula (`accountid`), mientras que en
MongoDB se conserva la notación `accountId`. La capa de aplicación es responsable de traducir
el nombre de la columna al mapear resultados entre las dos bases; el valor del identificador no
cambia.

## 2. Cómo se verifican las referencias desde la aplicación

El flujo de verificación para iniciar una reproducción está diseñado en dos pasos, apoyado en las
consultas ya construidas en el repositorio:

**Paso 1 — PostgreSQL confirma identidad y vigencia.** El `accountId` debe tomarse siempre de la
sesión autenticada del usuario, nunca del cuerpo de la petición, para evitar que alguien consulte
perfiles o actividad de otra cuenta. Con ese `accountId` y el `profileId` recibido, se ejecuta la
consulta de verificación (`sql/03_consulta_verificacion_reproduccion.sql`):

```sql
SELECT s.subscriptionId, s.planId, p.maxAgeRating
  FROM profiles p
  JOIN subscriptions s ON s.accountId = p.accountId
 WHERE p.profileId = :profileId
   AND p.accountId = :accountId
   AND p.isActive = 'Y'
   AND s.startsAt <= :now AND :now < s.endsAt;
```

Si no devuelve filas, la reproducción se rechaza ahí mismo: o el perfil no es activo ni pertenece
a esa cuenta, o no hay suscripción vigente. Solo si esta consulta tiene éxito se continúa al
segundo paso, usando el `maxAgeRating` que acaba de devolver.

**Paso 2 — MongoDB confirma el contenido.** Con la clasificación máxima del perfil, se consulta el
catálogo (equivalente a lo ya probado en `mongodb/03_consultas.js`):

```javascript
db.catalog_items.findOne(
  { _id: contentId, status: "published", ageRating: { $lte: maxAgeRating },
    "seasons.episodes.episodeId": episodeId }, // solo aplica para series
  { title: 1, type: 1, "seasons.$": 1 }
)
```

Si no encuentra el documento, la reproducción se rechaza: el contenido fue retirado, su
clasificación no está permitida para el perfil, o el episodio no existe. Solo si ambos pasos
pasan se registra la sesión en `watch_activity`, copiando en ese momento `planId`,
`subscriptionId`, `contentType`, `durationSeconds` y, si aplica, `seasonNumber`/`episodeNumber`.

**Estado de implementación:** este flujo describe el diseño de integración, con las consultas que
ya existen en los scripts del repositorio. Al momento de esta entrega, el repositorio contiene la
capa de datos (scripts SQL y de MongoDB) pero no código de aplicación (controladores o servicios)
que ejecute este flujo de dos pasos en orden, ni que garantice que `accountId` se toma de la
sesión autenticada y no de la petición del cliente. Esa implementación queda pendiente para la
entrega de la aplicación y debe completarse antes de la sustentación, donde se pedirá demostrar
este flujo en vivo. (revisan porfa, creo que es tarea de edwar)

## 3. Datos duplicados y cómo se evita que se desactualicen

Fuera de los identificadores de la sección 1, `watch_activity` duplica intencionalmente algunos
valores que en principio "pertenecen" a PostgreSQL o al catálogo:

| Campo duplicado | Por qué se duplica | Por qué no se desactualiza |
|---|---|---|
| `planId`, `subscriptionId` | El informe de consumo necesita el plan que estaba vigente *cuando se inició la sesión*, no el plan actual de la cuenta | Se copian una sola vez al crear la sesión y la sesión nunca se vuelve a editar |
| `contentType` | Evita una consulta extra al catálogo solo para saber si es película, serie o documental | Mismo motivo: es un dato de la sesión, no del catálogo, y la sesión es inmutable |
| `durationSeconds` | El cálculo de "completado al 90 %" depende de la duración del contenido/episodio *en el momento en que se vio* | Si el administrador corrige la duración de un contenido más adelante, las sesiones pasadas deben seguir reflejando lo que realmente se vio, así que no se sincronizan retroactivamente a propósito |
| `seasonNumber`, `episodeNumber` | Permite agrupar o filtrar actividad sin necesidad de volver a resolver contra `catalog_items` | Igual que los anteriores: son un snapshot de la sesión, no una referencia viva |

La regla general es: todo lo que se duplica en `watch_activity` representa una fotografía del
momento de la reproducción, por eso no hay proceso de sincronización porque no debe haberlo — si
el plan o la duración cambian después, las sesiones viejas deben seguir mostrando lo que ocurrió
en su momento, no el estado actual.

En cambio, `user_lists` no duplica nada del catálogo: solo guarda `contentId`, y el estado del
contenido (publicado o retirado) se resuelve en el momento de consultarlo con un `$lookup` a
`catalog_items`. Esto es intencional porque "Mi lista" sí debe reflejar el estado actual del
contenido, no uno congelado.

## 4. Qué pasa si una base no está disponible o una operación se interrumpe

El diseño define las siguientes respuestas, apoyado en las decisiones ya tomadas sobre el modelo
de datos:

- **Si PostgreSQL no responde:** no es posible iniciar ninguna reproducción, porque no hay forma
  de verificar la suscripción ni el perfil (paso 1 de la sección 2). La aplicación debe responder
  con un error controlado (503) en vez de dejar pasar la operación sin verificación.
- **Si MongoDB no responde:** la contratación de suscripciones puede seguir funcionando, porque
  esa operación solo toca PostgreSQL. Lo que sí se ve afectado es todo lo que depende del catálogo
  o la actividad: búsqueda, reproducción, "Mi lista", "Continuar viendo" y el informe de consumo,
  que deben responder con un error controlado en vez de fallar de forma genérica.
- **Si una reproducción se interrumpe a la mitad** (el usuario cierra la pestaña, pierde conexión,
  etc.): la sesión queda con `endedAt` vacío. El diseño contempla un proceso periódico que cierre
  esas sesiones abiertas usando `lastActivityAt` y `lastPositionSeconds` como el punto donde
  realmente se quedó, para que no queden sesiones "colgadas" indefinidamente.
- **Si se reintenta una escritura en MongoDB** porque la aplicación perdió la respuesta de un
  intento anterior (por ejemplo, un timeout): el diseño establece que el `_id` de la sesión debe
  generarlo la aplicación (no Mongo) y la escritura debe hacerse como upsert, para que un
  reintento no cree una sesión duplicada.
- **Conciliación periódica:** el diseño contempla un proceso que revise que los `accountId` y
  `profileId` guardados en MongoDB todavía existan en PostgreSQL, y reporte los que no, como red
  de seguridad adicional ante inconsistencias que se puedan colar por otros medios.
- **No hay transacciones que crucen las dos bases.** La contratación de suscripción solo toca
  PostgreSQL. Iniciar una reproducción primero hace todas las verificaciones de lectura y al final
  hace una sola escritura en MongoDB, para minimizar el riesgo de quedar a medias si esa escritura
  falla.

**Estado de implementación:** al momento de esta entrega, ninguno de los puntos anteriores tiene
código de aplicación que lo ejecute. No existe todavía: manejo de errores 503 en endpoints, un job
que cierre sesiones abiertas, lógica de upsert con reintentos, ni el proceso de conciliación
periódica. Lo que sí existe es el soporte necesario en el modelo de datos para que estas
decisiones se puedan implementar (por ejemplo, el campo `endedAt` es opcional precisamente para
permitir sesiones abiertas, y el `_id` de `watch_activity` está pensado para ser generado por la
aplicación y no por MongoDB). Este diseño debe convertirse en código antes de la entrega del
repositorio completo y la sustentación, donde se pedirá demostrar en vivo el fallo de una
transacción de pago y suscripción sin dejar registros parciales, entre otros escenarios.