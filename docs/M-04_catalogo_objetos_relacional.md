# Catálogo de objetos de la base de datos relacional

Proyecto CineConecta, persistencia políglota. Responsable de esta sección: Miguel.

## 1\. Introducción

La base relacional usa PostgreSQL 18.7 (instalación local donde se hicieron las pruebas) y el esquema public. Es la fuente de verdad de cuentas, perfiles, planes, suscripciones y pagos

La base se crea ejecutando los scripts en este orden:

| Archivo | Propósito |
| :---- | :---- |
| sql/01\_postgresql\_ddl.sql | Tablas, restricciones, índices, triggers, funciones, roles y privilegios |
| sql/04\_datos\_sinteticos.sql | Datos base para pruebas funcionales y para la demo |
| sql/05\_datos\_volumen.sql | Carga masiva parametrizable para las mediciones de eficiencia |

El repositorio incluye además sql/02\_oracle\_ddl.sql, una versión del DDL en sintaxis Oracle usada para generar el diagrama relacional, que no se ejecuta en la aplicación, y sql/03\_consulta\_verificacion\_reproduccion.sql, una consulta de verificación.

## 2\. Cambios respecto al modelo suministrado

El modelo suministrado tiene cinco tablas con tipos de Oracle. En PostgreSQL se conservaron las cinco tablas, sus columnas, sus claves primarias y foráneas y las restricciones únicas que muestra el diagrama. No hubo cambios estructurales sobre ellas. Lo que se agregó son restricciones, índices, triggers, funciones y roles que el diagrama no incluye.

Equivalencia de tipos:

| Tipo en el modelo | Tipo en PostgreSQL | Nota |
| :---- | :---- | :---- |
| INTEGER | INTEGER | Los identificadores son GENERATED ALWAYS AS IDENTITY |
| VARCHAR2(n) | VARCHAR(n) | Misma longitud |
| NUMBER(12,2) | NUMERIC(12,2) | Para precio y monto |
| CHAR(1) | CHAR(1) | Valores 'Y' y 'N' |
| TIMESTAMP | TIMESTAMP sin zona horaria | Equivalente directo |

Objetos agregados:

| Objeto | Implementación | Justificación |
| :---- | :---- | :---- |
| Períodos sin superposición | Restricción EXCLUDE con GiST sobre cuenta y rango \[startsAt, endsAt) | El enunciado prohíbe períodos superpuestos por cuenta. La BD lo garantiza aunque la aplicación falle |
| Duración de 30 días | CHECK sobre endsAt | Todas las suscripciones duran 30 días |
| Un pago por suscripción | UNIQUE sobre subscriptionId y constraint trigger diferido | El UNIQUE impide dos pagos. El trigger exige que exista uno al confirmar la transacción |
| Perfiles activos dentro del plan | Trigger sobre profiles | Valida suscripción vigente y límite de perfiles, con bloqueo de la cuenta |
| Contratación atómica | Función sp\_contratar\_suscripcion | Registra suscripción y pago en una sola transacción |
| Roles | cineconecta\_owner, cineconecta\_app, cineconecta\_user | La aplicación no usa el propietario del esquema |
| Índices adicionales | Cuatro índices (sección 5\) | Consultas de perfiles, historial y pagos por fecha |

## 3\. Tablas

### 3.1 plans

Planes de suscripción (Básico, Estándar y Premium en los datos de prueba). Define el precio y el máximo de perfiles activos.

| Columna | Tipo | Nulo | Por defecto | Descripción |
| :---- | :---- | :---- | :---- | :---- |
| planId | integer | No | Identity | Clave primaria |
| name | varchar(60) | No |  | Nombre único del plan |
| price | numeric(12,2) | No |  | Precio en pesos colombianos |
| maxProfiles | integer | No |  | Máximo de perfiles activos |

### 3.2 accounts

Cuentas de los titulares. Una cuenta tiene varios perfiles y varias suscripciones a lo largo del tiempo.

| Columna | Tipo | Nulo | Por defecto | Descripción |
| :---- | :---- | :---- | :---- | :---- |
| accountId | integer | No | Identity | Clave primaria |
| fullName | varchar(150) | No |  | Nombre completo |
| email | varchar(254) | No |  | Correo, único sin distinguir mayúsculas |
| passwordHash | varchar(255) | No |  | Hash bcrypt de la contraseña |
| createdAt | timestamp | No | CURRENT\_TIMESTAMP | Fecha de creación |

### 3.3 profiles

Perfiles de visualización de una cuenta, con clasificación máxima por edad y estado activo o inactivo.

| Columna | Tipo | Nulo | Por defecto | Descripción |
| :---- | :---- | :---- | :---- | :---- |
| profileId | integer | No | Identity | Clave primaria |
| accountId | integer | No |  | Cuenta a la que pertenece |
| name | varchar(60) | No |  | Nombre, único dentro de la cuenta sin distinguir mayúsculas |
| maxAgeRating | integer | No |  | Edad máxima de clasificación permitida |
| isActive | char(1) | No | 'Y' | 'Y' activo, 'N' inactivo |

### 3.4 subscriptions

Suscripciones de una cuenta a un plan. Cada una dura 30 días y no puede superponerse con otra de la misma cuenta.

| Columna | Tipo | Nulo | Por defecto | Descripción |
| :---- | :---- | :---- | :---- | :---- |
| subscriptionId | integer | No | Identity | Clave primaria |
| accountId | integer | No |  | Cuenta titular |
| planId | integer | No |  | Plan contratado |
| startsAt | timestamp | No |  | Inicio, incluido en la vigencia |
| endsAt | timestamp | No |  | Fin, excluido de la vigencia |

### 3.5 payments

Pagos de las suscripciones. Cada suscripción confirmada tiene exactamente un pago.

| Columna | Tipo | Nulo | Por defecto | Descripción |
| :---- | :---- | :---- | :---- | :---- |
| paymentId | integer | No | Identity | Clave primaria |
| subscriptionId | integer | No |  | Suscripción pagada, única |
| paidAt | timestamp | No | CURRENT\_TIMESTAMP | Momento del pago |
| amount | numeric(12,2) | No |  | Monto pagado |
| reference | varchar(100) | No |  | Referencia del pago, única |

## 4\. Restricciones

La base tiene 23 restricciones: 5 claves primarias, 4 foráneas, 3 únicas, 10 CHECK y 1 EXCLUDE.

| Tabla | Nombre | Tipo | Definición | Regla que protege |
| :---- | :---- | :---- | :---- | :---- |
| plans | pk\_plans | PRIMARY KEY | planId | Identificador único |
| plans | uq\_plans\_name | UNIQUE | name | Nombre de plan único |
| plans | ck\_plans\_price | CHECK | price \> 0 | Precio positivo |
| plans | ck\_plans\_maxprofiles | CHECK | maxProfiles \>= 1 | Al menos un perfil por plan |
| accounts | pk\_accounts | PRIMARY KEY | accountId | Identificador único |
| accounts | ck\_accounts\_fullname | CHECK | LENGTH(TRIM(fullName)) \> 0 | Nombre no vacío |
| accounts | ck\_accounts\_email | CHECK | POSITION('@' IN email) \> 1 | Formato mínimo del correo |
| accounts | ck\_accounts\_hash | CHECK | LENGTH(passwordHash) \>= 60 | Longitud de un hash bcrypt |
| profiles | pk\_profiles | PRIMARY KEY | profileId | Identificador único |
| profiles | fk\_profiles\_account | FOREIGN KEY | accountId a accounts | Cuenta existente |
| profiles | ck\_profiles\_name | CHECK | LENGTH(TRIM(name)) \> 0 | Nombre no vacío |
| profiles | ck\_profiles\_age | CHECK | maxAgeRating BETWEEN 0 AND 18 | Clasificación válida |
| profiles | ck\_profiles\_active | CHECK | isActive IN ('Y','N') | Estados permitidos |
| subscriptions | pk\_subscriptions | PRIMARY KEY | subscriptionId | Identificador único |
| subscriptions | fk\_subs\_account | FOREIGN KEY | accountId a accounts | Cuenta existente |
| subscriptions | fk\_subs\_plan | FOREIGN KEY | planId a plans | Plan existente |
| subscriptions | ck\_subs\_30days | CHECK | endsAt \= startsAt \+ INTERVAL '30 days' | Duración de 30 días |
| subscriptions | ex\_subs\_no\_overlap | EXCLUDE | accountId WITH \=, tsrange(startsAt, endsAt, '\[)') WITH && | Sin períodos superpuestos por cuenta |
| payments | pk\_payments | PRIMARY KEY | paymentId | Identificador único |
| payments | fk\_payments\_subscription | FOREIGN KEY | subscriptionId a subscriptions | Suscripción existente |
| payments | uq\_payments\_subscription | UNIQUE | subscriptionId | Máximo un pago por suscripción |
| payments | uq\_payments\_reference | UNIQUE | reference | Referencia de pago única |
| payments | ck\_payments\_amount | CHECK | amount \> 0 | Monto positivo |

La restricción ex\_subs\_no\_overlap requiere la extensión btree\_gist, que el script crea con CREATE EXTENSION IF NOT EXISTS. El rango \[startsAt, endsAt) incluye el instante de inicio y excluye el de fin. Por eso una suscripción puede empezar justo cuando termina la anterior sin que se considere superpuesta, que es la regla de vigencia del enunciado.

Como ck\_subs\_30days fija endsAt en startsAt más 30 días, ya garantiza que endsAt sea mayor que startsAt. Por eso no se agregó un CHECK adicional para eso.

## 5\. Índices

La base tiene 15 índices, contando los que PostgreSQL crea para claves primarias, restricciones únicas y la restricción EXCLUDE.

| Tabla | Nombre | Columnas o expresión | Único | Origen y justificación |
| :---- | :---- | :---- | :---- | :---- |
| accounts | pk\_accounts | accountId | Sí | Clave primaria |
| accounts | ux\_accounts\_email\_ci | LOWER(email) | Sí | Modelo base. Correo único sin distinguir mayúsculas |
| plans | pk\_plans | planId | Sí | Clave primaria |
| plans | uq\_plans\_name | name | Sí | Modelo base. Nombre de plan único |
| profiles | pk\_profiles | profileId | Sí | Clave primaria |
| profiles | ux\_profiles\_name\_ci | accountId, LOWER(name) | Sí | Modelo base. Nombre único por cuenta |
| profiles | ix\_profiles\_account\_active | accountId, isActive | No | Agregado. Contar y listar perfiles activos de una cuenta |
| subscriptions | pk\_subscriptions | subscriptionId | Sí | Clave primaria |
| subscriptions | ex\_subs\_no\_overlap | accountId, tsrange(startsAt, endsAt, '\[)') | No | Índice GiST que respalda la restricción EXCLUDE |
| subscriptions | ix\_subs\_plan | planId | No | Agregado. Consultas y informes por plan |
| subscriptions | ix\_subs\_account\_start | accountId, startsAt DESC | No | Agregado. Historial de una cuenta y búsqueda de la suscripción vigente |
| payments | pk\_payments | paymentId | Sí | Clave primaria |
| payments | uq\_payments\_subscription | subscriptionId | Sí | Modelo base. Relación uno a uno |
| payments | uq\_payments\_reference | reference | Sí | Modelo base. Referencia única |
| payments | ix\_payments\_paidat | paidAt | No | Agregado. Informe de ingresos por rango de fechas |

## 6\. Vistas

No se crearon vistas. Las consultas de la aplicación sobre historial, perfiles activos y vigencia se resuelven con los índices de la sección 5, y la lógica de validación está en las funciones y triggers de la sección 7\.

## 7\. Funciones, procedimientos y triggers

La base tiene tres funciones y dos triggers.

### 7.1 fn\_subscription\_requires\_payment

Firma: fn\_subscription\_requires\_payment() RETURNS trigger, en PL/pgSQL.

Trigger asociado: ctr\_subscription\_requires\_payment, un constraint trigger AFTER INSERT sobre subscriptions, FOR EACH ROW, DEFERRABLE INITIALLY DEFERRED.

Comprueba que la suscripción recién insertada tenga un pago en payments. Como la validación está diferida, se ejecuta al confirmar la transacción, lo que permite insertar primero la suscripción y después el pago. Si no hay pago, lanza el error "La suscripción % no tiene pago asociado" y la transacción completa se revierte.

La función no es SECURITY DEFINER y no fija search\_path, de modo que se ejecuta con los privilegios de quien realiza el INSERT. No necesita más, porque solo lee payments y cineconecta\_app tiene SELECT sobre esa tabla. Su dueño es cineconecta\_owner.

### 7.2 fn\_profiles\_check\_limits

Firma: fn\_profiles\_check\_limits() RETURNS trigger, en PL/pgSQL, SECURITY DEFINER con search\_path fijo en public, pg\_temp. Dueño: cineconecta\_owner.

Trigger asociado: trg\_profiles\_check\_limits, BEFORE INSERT OR UPDATE OF isActive sobre profiles, FOR EACH ROW, con la condición WHEN (NEW.isActive \= 'Y'). Solo se dispara cuando un perfil se crea activo o se activa.

Funcionamiento:

1. Si es un UPDATE y el perfil ya estaba activo, no valida de nuevo.  
2. Bloquea la fila de la cuenta con SELECT ... FOR UPDATE, de modo que dos creaciones o activaciones simultáneas para la misma cuenta se ejecuten una después de la otra.  
3. Busca la suscripción vigente de la cuenta (startsAt \<= ahora \< endsAt) y toma el maxProfiles de su plan.  
4. Cuenta los perfiles activos de la cuenta sin incluir el perfil actual.  
5. Rechaza la operación si ya se alcanzó el máximo.

Errores que lanza:

- "La cuenta % no tiene una suscripción vigente"  
- "La cuenta % alcanzó el máximo de % perfiles activos"

Es SECURITY DEFINER porque el bloqueo FOR UPDATE sobre accounts exige el privilegio UPDATE, que cineconecta\_app no tiene. Con la elevación dentro de la función no hace falta concederlo.

### 7.3 sp\_contratar\_suscripcion

Firma: sp\_contratar\_suscripcion(p\_accountId INTEGER, p\_planId INTEGER, p\_reference VARCHAR, p\_aprobado BOOLEAN DEFAULT true) RETURNS INTEGER, en PL/pgSQL, SECURITY DEFINER con search\_path fijo en public, pg\_temp. Dueño: cineconecta\_owner. La aplicación la llama directamente y devuelve el subscriptionId creado.

Todo ocurre en una sola transacción y en este orden:

1. Bloquea la fila de la cuenta con FOR UPDATE. Si no existe, lanza "La cuenta % no existe".  
2. Consulta el plan para obtener precio y máximo de perfiles. Si no existe, lanza "El plan % no existe".  
3. Si p\_aprobado es falso, lanza "Pago no aprobado: la contratación requiere pago aprobado" y no inserta nada. El pago es simulado, y este parámetro representa su aprobación o rechazo.  
4. Verifica que la cuenta no tenga una suscripción vigente. Si la tiene, lanza "La cuenta % ya tiene una suscripción vigente".  
5. Cuenta los perfiles activos. Si superan el máximo del nuevo plan, lanza "Desactive % perfil(es) antes de contratar este plan".  
6. Inserta la suscripción con inicio en el momento actual y fin 30 días después.  
7. Inserta el pago con monto igual al precio del plan.

Una referencia repetida produce el error nativo de unicidad de uq\_payments\_reference y la transacción completa se revierte.

Concurrencia: el bloqueo del paso 1 hace que las solicitudes simultáneas de una misma cuenta se ejecuten una detrás de otra. La segunda espera, ve la suscripción creada por la primera y falla en el paso 4\. Si ese control fallara, ex\_subs\_no\_overlap impediría el solapamiento. En las pruebas con 10 solicitudes simultáneas para una misma cuenta prosperó exactamente una.

Es SECURITY DEFINER por la misma razón que el trigger anterior: necesita FOR UPDATE sobre accounts, y cineconecta\_app solo tiene SELECT e INSERT sobre subscriptions y payments.

## 8\. Roles y privilegios

### 8.1 Roles

| Rol | Atributos | Uso |
| :---- | :---- | :---- |
| cineconecta\_owner | NOLOGIN, sin superusuario, CREATEDB ni CREATEROLE | Dueño de tablas, secuencias y funciones. Se usa solo para migraciones |
| cineconecta\_app | NOLOGIN, sin superusuario, CREATEDB ni CREATEROLE | Rol de grupo con los privilegios que necesita la aplicación |
| cineconecta\_user | LOGIN, miembro de cineconecta\_app | Usuario con el que se conecta la aplicación. La contraseña se recibe como variable de psql (app\_password) y no está en el código |

### 8.2 Privilegios de cineconecta\_app

| Objeto | Privilegios | Justificación |
| :---- | :---- | :---- |
| plans | SELECT | La aplicación solo lee los planes |
| accounts | SELECT, INSERT | Registro y consulta de cuentas. El enunciado no incluye edición |
| profiles | SELECT, INSERT, UPDATE | Crear perfiles y desactivarlos. Sin DELETE, para conservar la actividad histórica |
| subscriptions | SELECT, INSERT | El historial no se modifica ni se borra |
| payments | SELECT, INSERT | El historial no se modifica ni se borra |
| Secuencias de identidad | USAGE | Permite los INSERT con identificadores generados |
| sp\_contratar\_suscripcion | EXECUTE | Punto de entrada de la contratación |
| fn\_profiles\_check\_limits | EXECUTE | Concedido en el script. Ver pendientes |

### 8.3 Revocaciones a PUBLIC

El script ejecuta REVOKE CREATE ON SCHEMA public FROM PUBLIC y REVOKE EXECUTE sobre las funciones del esquema para PUBLIC, y concede EXECUTE solo a cineconecta\_app.

El REVOKE CONNECT ON DATABASE FROM PUBLIC no se ejecuta en el script porque este no crea la base. Queda indicado en un comentario y debe hacerse al crearla.

## 9\. Datos de prueba

El archivo 04\_datos\_sinteticos.sql carga 15 cuentas, 30 perfiles, 17 suscripciones y 17 pagos, con identificadores fijos. Cubre estos casos:

- Cuentas con suscripción vigente en cada uno de los tres planes.  
- Una cuenta con suscripción vencida y sin vigente.  
- Una cuenta con historial de suscripciones consecutivas en planes distintos.  
- Dos cuentas sin suscripción, una para la demo de contratación y otra para la demo de concurrencia.  
- Una cuenta con suscripción Premium vencida y tres perfiles activos, para probar el rechazo por exceso de perfiles al contratar un plan menor. Es el único caso de datos que rompe a propósito la regla de perfiles, y se crea desactivando el trigger de perfiles solo durante esa inserción.  
- Una cuenta con plan Básico que ya tiene su único perfil activo.  
- Perfiles con clasificación restrictiva (7 y 12\) y un perfil inactivo con actividad histórica.  
- Una suscripción que vence el 27 de noviembre de 2026 y una cuenta con dos suscripciones consecutivas, para probar el borde del intervalo semiabierto.

Todas las cuentas de prueba usan la misma contraseña, Demo2026\!, guardada como hash bcrypt. El mapa completo de identificadores está en la sección "Datos de prueba" del README.

El archivo 05\_datos\_volumen.sql carga datos masivos con generate\_series. Se parametriza con n\_accounts (por defecto 100000\) y genera identificadores desde 100000 para no chocar con los datos base. Cada cuenta recibe entre 0 y 4 suscripciones consecutivas de 30 días, con su pago, y perfiles activos dentro del máximo de su plan. Desactiva el trigger de perfiles durante la carga, lo reactiva al final y valida que no haya solapes, que cada suscripción tenga un pago y que ningún plan exceda su límite de perfiles.

Con 100.000 cuentas, la ejecución completa de los tres scripts tardó 20,6 segundos en el equipo local (DDL 0,35 s, datos base 0,11 s, volumen 20,1 s). 

## 10\. Reglas de negocio y dónde se garantizan

| Regla | Mecanismo | Objeto |
| :---- | :---- | :---- |
| Correo único sin distinguir mayúsculas | Índice único funcional | ux\_accounts\_email\_ci |
| Nombre de perfil único por cuenta | Índice único funcional | ux\_profiles\_name\_ci |
| Nombre de plan único | UNIQUE | uq\_plans\_name |
| Precio positivo y al menos un perfil por plan | CHECK | ck\_plans\_price, ck\_plans\_maxprofiles |
| Clasificación de edad entre 0 y 18 | CHECK | ck\_profiles\_age |
| Estado de perfil solo 'Y' o 'N' | CHECK | ck\_profiles\_active |
| Suscripción de 30 días exactos | CHECK | ck\_subs\_30days |
| Sin períodos superpuestos por cuenta | EXCLUDE con rango semiabierto | ex\_subs\_no\_overlap |
| Un solo pago por suscripción | UNIQUE | uq\_payments\_subscription |
| Toda suscripción tiene pago | Constraint trigger diferido | ctr\_subscription\_requires\_payment |
| Referencia de pago única | UNIQUE | uq\_payments\_reference |
| Perfiles activos dentro del máximo del plan | Trigger con bloqueo de la cuenta | trg\_profiles\_check\_limits |
| Crear perfiles exige suscripción vigente | Trigger | trg\_profiles\_check\_limits |
| Contratar sin suscripción vigente y con perfiles dentro del nuevo plan | Función con bloqueo de la cuenta | sp\_contratar\_suscripcion |
| Pago y suscripción en una sola transacción | Función | sp\_contratar\_suscripcion |
| Privilegios mínimos de la aplicación | Roles y GRANT | cineconecta\_app, cineconecta\_user |

Reglas que se validan solo en la aplicación y no en la base relacional:

- Que un usuario autenticado vea y seleccione únicamente los perfiles activos de su propia cuenta.  
- Que las búsquedas muestren solo contenidos cuya clasificación no exceda la del perfil. El catálogo está en MongoDB.  
- La autenticación de los usuarios administrativos, que se almacenan en MongoDB.  
- La simulación de aprobación o rechazo del pago, que llega como parámetro p\_aprobado.  
- El formato completo del correo y la fortaleza de la contraseña. La base solo exige un arroba y un hash de al menos 60 caracteres.

## 11\. Limitaciones y decisiones abiertas

- No se crearon vistas, porque las consultas se resuelven con índices y funciones.  
- No se agregó un CHECK separado de endsAt mayor que startsAt, porque ck\_subs\_30days ya lo garantiza.  
- Las claves foráneas no tienen borrado en cascada, para conservar el historial de suscripciones y pagos.  
- Las tablas de suscripciones y pagos no admiten UPDATE ni DELETE para el rol de la aplicación.  
- El pago es simulado. No hay integración con una pasarela real.  
- El REVOKE CONNECT sobre la base queda como paso de despliegue y no está en el script.

   