// =============================================================================
// CineConecta - Usuario de MongoDB con privilegios mínimos para la aplicación
// =============================================================================
// La aplicación NO se conecta con un usuario administrador. Este script crea un
// rol con solo las acciones que usa el backend sobre cada colección y un usuario
// que tiene únicamente ese rol.
//
// Uso (MongoDB local o autoadministrado, con un usuario que pueda crear roles):
//   APP_MONGO_PASSWORD='...' mongosh "mongodb://admin@localhost:27017/cineconecta" mongodb/06_usuario_aplicacion.js
//
// La contraseña se lee de una variable de entorno para no dejarla en el repositorio.
//
// En MongoDB Atlas los roles y usuarios se crean desde la interfaz
// (Database Access > Custom Roles): replicar las mismas acciones por colección.
// =============================================================================

const DB_NAME = 'cineconecta';
const APP_USER = 'cineconecta_app';
const ROLE = 'cineconecta_app_role';
const password = process.env.APP_MONGO_PASSWORD;

if (!password) {
  throw new Error('Defina la variable de entorno APP_MONGO_PASSWORD');
}

const target = db.getSiblingDB(DB_NAME);
const on = (collection) => ({ db: DB_NAME, collection });

// Acciones por colección según lo que hace el backend:
// - catalog_items: lectura del catálogo; el administrador crea y actualiza
//   (publicar/retirar es un cambio de estado). Nunca se borra: los IDs no se reutilizan.
// - counters: generación de IDs estables (mov_, ser_, doc_, epi_).
// - user_lists: "Mi lista" (agregar y quitar).
// - watch_activity: sesiones de reproducción (crear y actualizar; no se borran).
// - admin_users: login de administradores (lectura y lastLoginAt).
const privileges = [
  { resource: on('catalog_items'), actions: ['find', 'insert', 'update'] },
  { resource: on('counters'), actions: ['find', 'insert', 'update'] },
  { resource: on('user_lists'), actions: ['find', 'insert', 'update', 'remove'] },
  { resource: on('watch_activity'), actions: ['find', 'insert', 'update'] },
  { resource: on('admin_users'), actions: ['find', 'update'] },
];

if (target.getRole(ROLE)) {
  target.updateRole(ROLE, { privileges, roles: [] });
  print(`Rol ${ROLE} actualizado`);
} else {
  target.createRole({ role: ROLE, privileges, roles: [] });
  print(`Rol ${ROLE} creado`);
}

if (target.getUser(APP_USER)) {
  target.updateUser(APP_USER, { pwd: password, roles: [{ role: ROLE, db: DB_NAME }] });
  print(`Usuario ${APP_USER} actualizado`);
} else {
  target.createUser({ user: APP_USER, pwd: password, roles: [{ role: ROLE, db: DB_NAME }] });
  print(`Usuario ${APP_USER} creado`);
}

print(`Cadena de conexión para backend/.env:`);
print(`MONGODB_URI=mongodb://${APP_USER}:<password>@localhost:27017/${DB_NAME}?authSource=${DB_NAME}`);
