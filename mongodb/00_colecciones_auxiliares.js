// Colecciones restantes y contador de identificadores
db.createCollection("user_lists");
db.createCollection("watch_activity");
db.createCollection("admin_users");
db.createCollection("counters");
// Generación atómica de ids estables (ejemplo): 
// db.counters.findOneAndUpdate({_id:"content"},{$inc:{seq:1}},{upsert:true,returnDocument:"after"})
