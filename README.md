# Busca Tumbas

Aplicación web estática para registrar y buscar lápidas mediante Firebase y
extraer datos de fotografías con Gemini.

## Fotografías y ubicación de tumbas existentes

Desde v2.28, cualquier usuario con sesión y correo verificado puede aportar una
fotografía desde el detalle de una tumba. Se guarda en su galería, con autor y
fecha, sin reemplazar la foto original ni cambiar datos de identidad. La carga
convierte la imagen a JPEG y conserva el intento para reintentar su registro.
En v2.29, «Tomar foto aquí con GPS» solicita la cámara trasera del celular y
obtiene el GPS actual al regresar de la captura. Tras confirmación, guarda las
coordenadas y los datos de captura con la foto y completa la ubicación de la tumba
solo si falta. Si el GPS falla, permite aportar la foto sin ubicación. Seleccionar
una foto guardada no asocia automáticamente el GPS actual con una captura anterior.
Si la tumba carece de coordenadas, se puede completar su ubicación mediante GPS,
con confirmación estando frente a ella. La transacción impide sobrescribir una
ubicación existente, incluso con aportaciones simultáneas. Las cuentas suspendidas
no pueden aportar. `aportarFotoOUbicacionTumba` es la única ruta para registrar
estas aportaciones; deben desplegarse función, reglas de Firestore/Storage y web.

## Prevención y auditoría de duplicados

En v2.26, «Buscar duplicados ya publicados» audita el catálogo sin modificarlo,
muestra un par a la vez y presenta la resolución anterior cuando exista.
`npm run audit:duplicates` genera un informe privado en `.record-audit/`.
La auditoría compara nombres y fechas normalizados con la regla vigente, además
de identidades exactas o compatibles. Agrupa candidatos por fecha o nombre para
evitar comparar todos los pares de tumbas; sigue leyendo el catálogo completo.
En catálogos masivos, esa lectura y los grupos frecuentes requieren procesamiento
por lotes. Ninguna búsqueda garantiza detectar errores de captura arbitrarios.
Las ediciones de tumbas también comprueban posibles duplicados por similitud.

En v2.20, «Comparar ambas publicaciones» carga desde servidor la publicación
existente y la propuesta, muestra fotografías ampliables y datos completos en
paralelo, explica el motivo de la disputa y permite seleccionar visualmente la
correcta. Se puede conservar la existente, sustituirla por la propuesta o declarar
que son distintas y conservar ambas. El motivo de resolución es obligatorio.
La sustitución mantiene el identificador existente y sus referencias, archiva
el original en `_mergedRecords` y registra la selección en la disputa y auditoría.
Se exige que la versión del registro coincida con la vista comparada; cualquier
cambio simultáneo obliga a actualizar la comparación antes de sustituirlo.

Desde v2.25, las tumbas requieren similitud global **mayor al 50 %**, nombre
**mayor al 80 %** y al menos una fecha de nacimiento o defunción coincidente
tras normalizar su formato. Fechas ausentes o parcialmente compatibles no bastan.
Los panteones conservan su comparación por datos del lugar. Las controversias se
presentan una a la vez, con controles Anterior y Siguiente. Los casos anteriores
conservan su evidencia y requieren resolución administrativa.

Las nuevas altas que cumplen los requisitos de controversia y no son exactas
se guardan como propuestas privadas en `_duplicateDisputes`, sin entrar al catálogo.
El 50 % exacto no abre disputa; el 100 % bloquea el alta. La comprobación incluye
propuestas pendientes para impedir repetir un duplicado exacto en otra disputa.
Administración recibe un aviso persistente en la aplicación y un aviso en tiempo
real mientras tiene sesión administrativa. El aportador puede aclarar el caso
en Mis aportaciones. `aclararDisputaDuplicado` permite mensajes del aportador y
administración; `resolverDisputaDuplicado` exige sesión administrativa y motivo.
Autorizar un registro distinto vuelve a comprobar duplicados exactos dentro de la
transacción; confirmar el duplicado conserva la propuesta sin publicarla.

La métrica compara datos normalizados: en tumbas, nombre (50), nacimiento (15),
defunción (20), panteón y localidad (15), y país (5 cuando está informado).
En panteones, nombres y alias (40), estado (10), municipio (15), localidad (25),
GPS (10 si ambos lo tienen) y referencia INEGI (20 si ambos la tienen).
Se divide por el peso de los campos presentes en al menos uno de los registros;
faltantes en ambos no suman coincidencia. Las excepciones de GPS e INEGI evitan
que añadir una ubicación a un lugar conocido lo haga parecer distinto. La misma
referencia INEGI prueba identidad exacta; GPS dentro de 150 m se considera
equivalente. Fechas parciales compatibles cuentan 75 % en ese campo, sin inventar
componentes; los textos usan distancia de edición. Estos porcentajes expresan
similitud de los datos, no una probabilidad ni un porcentaje de píxeles de la foto.
El panel muestra los campos y fotos que sustentan cada comparación.

Las altas de tumbas y panteones pasan por `crearAportacionTumba` y
`crearAportacionPanteon`. Las ediciones de identidad también pasan por servidor.
Las reglas impiden altas y cambios de identidad directos desde Firestore.
Cada colección tiene un bloqueo transaccional compartido en `_uniquenessLocks`:
la comparación y escritura se ejecutan juntas, incluso con guardados simultáneos.
Se ignoran tildes, mayúsculas y variantes del formato de fecha. Las fechas
parciales conservan su precisión. Los panteones se comparan por referencia INEGI
o por nombres y alias dentro del municipio y localidad, sin depender de pequeñas
variaciones del GPS. Una coincidencia devuelve `already-exists`.

`node scripts/deduplicate-records.mjs` audita los duplicados existentes;
`--apply` consolida los confirmados, actualiza referencias y conserva los originales
con sus fotografías y autoría en `_mergedRecords`. Los respaldos locales quedan
en `.record-audit/`, excluido de Git y Hosting.

## Captura de varias lápidas en un mismo lugar

En «Subir lápidas de un panteón», primero se elige y confirma el panteón o lugar, con país, estado, municipio y
colonia. La selección se mantiene durante la sesión al guardar, limpiar o
reintentar una fotografía y al regresar del menú. El escaneo solo completa los
datos del difunto. Después de guardar se puede subir directamente la siguiente
foto. Se pueden seleccionar varios archivos de imagen de una vez: un contador
muestra el progreso y, después de guardar una lápida, se carga la siguiente para
revisar y escanear. Un fallo de guardado conserva la fotografía y la cola.
Volver al menú descarta los archivos pendientes y conserva el lugar.
«Cambiar panteón o lugar» permite elegir otro; cerrar sesión elimina la
selección. INEGI se ofrece exclusivamente para México. Otros países permiten
captura manual; los futuros catálogos se registran en `tombCemeteryCatalogProviders`
con un cargador que devuelve el mismo esquema de ubicaciones. Los nombres
manuales guardados en lápidas aparecen en consultas posteriores del municipio,
identificados como «Registrado en lápidas», sin atribuirlos a INEGI.

## Notas y aportaciones comunitarias

El formulario «Agregar panteón u otro lugar» permite registrar panteones, iglesias,
hospitales, conventos y otros lugares con un tipo personalizado obligatorio.
Las aportaciones anteriores conservan el tipo panteón. Solo los panteones se
comparan con el catálogo INEGI de cementerios; todos los tipos se comparan con
las aportaciones comunitarias y pasan por la revisión administrativa habitual.

Los usuarios con correo verificado pueden enviar una nota desde el detalle de una
tumba o panteón comunitario. El autor la recibe en su bandeja de correcciones.
Cada usuario aporta una nota por entrada; las respuestas se mantienen en la misma
conversación. Al llegar a tres usuarios distintos, el caso aparece en «Errores
para verificar» del panel de superusuario, con las notas y conversaciones.
El administrador verifica la entrada, corrige o retira el aporte con las acciones
existentes y registra el resultado para cerrar el caso. Cerrar una conversación
como autor no cancela la revisión administrativa. Una nueva nota de otro usuario
reabre un caso ya revisado. Las notas anteriores a esta función no se contabilizan.

Se deben desplegar juntos `functions`, `firestore:rules` y `hosting` para activar
el flujo. El contador y el registro de revisiones son privados y se escriben
exclusivamente desde el servidor.

## Permisos de fotografías en producción

Las reglas de Storage consultan `_moderation` en Firestore para comprobar
suspensiones. El agente de Cloud Storage for Firebase necesita el rol
`roles/firebaserules.firestoreServiceAgent`. Un despliegue con `--non-interactive`
no comprueba ni concede ese permiso aunque publique correctamente las reglas.

Usa `npm run storage:permissions:check` para comprobarlo y
`npm run storage:permissions:fix` para conceder únicamente el rol necesario al
agente del proyecto. `npm run storage:verify` prueba en producción la subida de
JPEG para lugares y lápidas, los rechazos a rutas ajenas y la suspensión; crea
una cuenta temporal y elimina la cuenta y todos sus datos al terminar.

## Ejecución local

La aplicación no requiere compilación. Debe servirse por HTTP para que la
cámara, la geolocalización y las solicitudes externas funcionen correctamente:

```powershell
python -m http.server 8000
```

Después, abre `http://localhost:8000`.

## Estructura

- `index.html`: interfaz, estilos y lógica de la aplicación.
- `version.json`: versión visible de la aplicación.
- `index.html.backup`: respaldo histórico ignorado por Git.
- `functions/`: backend privado para INEGI y Gemini.
- `firestore.rules` y `storage.rules`: permisos del catálogo colaborativo.
- `firestore.indexes.json`: índices necesarios para las búsquedas.

## Servicios externos

- Firebase Authentication para las cuentas.
- Cloud Firestore para los registros.
- Firebase Storage para las imágenes.
- Gemini para extraer los datos de las lápidas.
- DENUE de INEGI para localizar panteones y completar estado, municipio,
  colonia y coordenadas.

La API key de Firebase identifica el proyecto, pero la seguridad real depende de
las reglas de Authentication, Firestore y Storage configuradas en Firebase.
Cada consulta y escritura debe limitarse al `uid` autenticado.

Las credenciales de Gemini e INEGI se administran centralmente como secretos de
Cloud Functions. Ningún usuario necesita proporcionar tokens y las credenciales
no se envían al navegador.
La búsqueda usa la ubicación del dispositivo cuando está disponible y también
permite escribir manualmente un municipio o estado cuando el GPS está bloqueado.
La ubicación de captura solo se obtiene al tomar una fotografía con la cámara.
Los archivos subidos no solicitan GPS; en ese flujo la búsqueda del panteón se
hace por municipio o estado. Las coordenadas oficiales del panteón provenientes
de INEGI se almacenan por separado.

Cuando el nombre conocido por la comunidad difiere del nombre de INEGI, el
aporte conserva ambos. El nombre comunitario queda pendiente de revisión y el
nombre original de INEGI se mantiene como referencia y alias de búsqueda. Una
propuesta aprobada se muestra como nombre preferido sin alterar el catálogo
oficial de INEGI.

Los registros nuevos de personas separan nombre(s), apellido paterno y apellido
materno, conservando también `nombre_finado` como nombre completo compatible con
los registros anteriores. La búsqueda permite elegir por separado coincidencia
exacta o sonido parecido para cada parte del nombre. En registros antiguos sin
campos separados, la comparación utiliza las palabras del nombre completo.

## Configuración de Firebase

El proyecto usa Cloud Functions de segunda generación con Node.js 22. Para
desplegarlas, el proyecto Firebase debe estar en el plan Blaze.

Inicia sesión con la CLI:

```powershell
npx firebase-tools login
npx firebase-tools use buscatumbas-2e7cc
```

Registra los secretos de forma interactiva; no los escribas en archivos:

```powershell
npx firebase-tools functions:secrets:set INEGI_TOKEN
npx firebase-tools functions:secrets:set GEMINI_API_KEY
```

Despliega backend, reglas, índices y sitio:

```powershell
npx firebase-tools deploy --only functions,firestore,storage,hosting
```

Las funciones exigen autenticación y aplican límites por usuario. Antes de
habilitar `enforceAppCheck` en producción se debe registrar la aplicación web
con App Check y comprobar sus métricas.

## Correos de registro en español

Firebase Authentication envía los correos de activación; GitHub no participa
en este flujo. La aplicación configura el español al iniciar Authentication y
antes de enviar la verificación, su reenvío o la recuperación de contraseña.
Los avisos explican cómo activar la cuenta en tres pasos.

La plantilla del correo se configura por separado del código, en
[Firebase Authentication → Plantillas](https://console.firebase.google.com/project/buscatumbas-2e7cc/authentication/emails).
Revisar allí el idioma español, el nombre del remitente `Busca Tumbas` y el
asunto de verificación `Activa tu cuenta de Busca Tumbas`.
El cuerpo del correo de verificación estándar tiene personalización limitada;
editar el HTML de la aplicación no lo modifica. Para un cuerpo completamente
propio se necesita generar el enlace desde un backend y enviarlo mediante un
servicio de correo configurado, conservando la verificación de Firebase.

Después de desplegar, comprobar con una cuenta de prueba el mensaje recibido
(idioma, remitente y asunto), la página que abre el enlace y el inicio de sesión.
Comprobar también el reenvío y la recuperación de contraseña. Una solicitud de
envío aceptada no confirma la llegada del mensaje a la bandeja de entrada.

## Plan Plus y anuncios

La aplicación consulta `obtenerEstadoBeneficios` al iniciar sesión. Las cuentas
gratuitas muestran espacios publicitarios discretos en el menú y en la
búsqueda. Plus elimina esos espacios.

Cada 10 aportaciones válidas se conceden 30 días sin anuncios. Cuentan las
tumbas publicadas y los panteones aprobados. Las recompensas son acumulables y
se guardan en `_entitlements`, una colección accesible solamente mediante Cloud
Functions. Al desplegar por primera vez, las aportaciones anteriores también se
reconocen.

El botón `Obtener Plus` prepara una solicitud por correo. Después de comprobar
el pago, el administrador puede usar `Activar Plus` en el panel administrativo
para conceder 30, 90 o 365 días; esta acción llama a `activarPlusAdmin`. Para
cobro automático aún se debe elegir proveedor, definir
precios y conectar su webhook para actualizar `paidUntil`; nunca se debe
aceptar la confirmación de pago enviada directamente por el navegador.

## Mantenimiento

Al publicar una versión, actualiza de forma conjunta:

- `APP_VERSION` en `index.html`.
- `mayor` y `menor` en `version.json`.

Antes de publicar, valida la carga de la aplicación, autenticación, captura y
subida de imágenes, guardado, búsqueda combinada y cierre de sesión.

## Android y Google Play

### Distribución por liga (web/PWA)

La app pública está en https://buscatumbas.cumorahnet.com/. Puede compartirse desde
el botón **Compartir app**, disponible antes y después de iniciar sesión. Comparte
solo la dirección pública, sin datos de la cuenta ni parámetros de la página.
Si el navegador no ofrece compartir, se muestra la liga con opción de copiarla.

En Android, abre la liga en Chrome y toca **Instalar app**. En iPhone, ábrela en
Safari y utiliza **Compartir → Agregar a pantalla de inicio**. Si la liga se abre
dentro de otra aplicación, usa la opción de abrirla en el navegador del teléfono.
La app necesita conexión a internet. Las actualizaciones web se publican en
Firebase Hosting; no requieren AAB ni firma Android. Este uso no cuenta como
inscripción en las pruebas cerradas de Google Play.

El proceso de Play Store queda en pausa mientras se distribuye la web/PWA.

Consulta [ANDROID.md](ANDROID.md) para abrir el proyecto en Android Studio, generar APK/AAB y preparar la publicación. Ejecuta `npm run android:open` para sincronizar y abrir Android.

### Mismo correo, contraseñas distintas

Desde la pantalla inicial, con doble clic sobre la versión abre el acceso global
e introduce el correo y la contraseña independiente de superusuario. No requiere
iniciar sesión previamente como usuario. El correo y UID se conservan. La contraseña administrativa no se
usa para iniciar sesión normal en Firebase ni modifica la contraseña del usuario.

Para configurarla, desde una terminal interactiva con Firebase CLI conectado:

```powershell
npm run superuser:password -- UID CORREO
```

El comando verifica identidad y rol, pide la contraseña actual del usuario con
entrada oculta y luego pide dos veces la nueva contraseña de superusuario de
16–128 caracteres. Comprueba la contraseña normal en Firebase y rechaza que ambas
sean iguales. Guarda solo sal y hash scrypt en `_superuserCredentials`, mediante
creación exclusiva; los clientes no pueden leer ni escribir esa colección.

Diagnóstico de solo lectura: `npm run superuser:password:check -- UID CORREO`.
Rotación explícita: `npm run superuser:password:rotate -- UID CORREO`. No se aceptan
contraseñas por argumentos, archivos, variables de entorno ni chat.

El servidor limita a cinco intentos cada quince minutos por cuenta y veinte por
dirección IP, identifica la cuenta directamente por correo y comprueba
el rol vigente y emite un token personalizado para el mismo UID con autorización
administrativa que vence en una hora. Functions y Firestore exigen esa autorización
además del claim `platform_admin`; la contraseña normal y el rol permanente no
bastan para realizar operaciones globales. Al salir se cierra la sesión elevada.

Para activar el flujo hay que publicar Functions, reglas Firestore y Hosting
juntos. El servicio de ejecución de Functions necesita permiso IAM `signBlob`
para firmar tokens personalizados (Service Account Token Creator sobre la cuenta
firmante). La contraseña se configura por separado y no se incluye en el despliegue.

Los comandos antiguos de cuentas independientes se conservan para mantenimiento;
no intervienen en este acceso. Pruebas: `npm run test:superuser` y las suites de
Functions y reglas.

## iPhone

La web se puede usar en Safari y agregar a la pantalla de inicio. El proyecto nativo iOS, las pruebas de compatibilidad y los pasos pendientes para App Store están documentados en [IOS.md](IOS.md). La compilación iOS requiere un Mac con Xcode; preparar el proyecto en Windows no equivale a una validación en iPhone.

## Consulta sin cuenta e inicio simplificado

El inicio ofrece Buscar tumbas y Aportar, seguido de las lápidas recientes.
La navegación inferior contiene Inicio, Tumbas y Mensajes. Las herramientas
de cuenta y registro de lugares están en el desplegable de cuenta.
Los visitantes pueden buscar y abrir fichas sin registrarse. Aportar,
modificar registros, consultar mensajes y preparar descargas requiere una
cuenta verificada; el acceso retoma la acción pendiente y permite cancelar
para seguir explorando. Las modificaciones conservan los permisos existentes
del propietario o administrador y el flujo de propuestas de corrección.

La función `consultarCatalogoPublico` publica una proyección de campos del
catálogo, sin correos ni identificadores de cuenta. Firestore y Storage
conservan sus reglas privadas. Como las fotografías se muestran al visitante,
la exigencia de cuenta controla la descarga ofrecida por la app y no impide
que el navegador guarde una imagen visible.

Publicar primero `functions:consultarCatalogoPublico` y después Hosting;
no se necesitan cambios de reglas ni migraciones. Para Android, generar
y sincronizar los recursos antes de crear una nueva distribución.
Validación: `npm run test:public`, `npm run test:public:ui`,
`npm run test:security:client`, `npm run test:android`.

## Descarga e historial de lápidas

La preparación para FamilySearch descarga por `/api/tomb-photo` desde el
mismo origen de la app. La función `descargarFotografiaTumba` comprueba el
token Firebase y el correo verificado antes de recuperar el archivo original
del bucket del proyecto. No acepta direcciones externas del navegador.

Los disparadores `registrarHistorialTumba` y `registrarHistorialFotografia`
registran los cambios de datos, fotografías y ubicación en la subcolección
privada `tumbas/{id}/history`, con identificadores de evento estables, fecha
de Firestore, valores anteriores/nuevos y el autor conocido. Las operaciones
de mantenimiento sin usuario identificable se marcan como sistema. La lectura
pasa por `obtenerHistorialTumba`, que no publica identificadores de cuenta ni
correos. Los registros anteriores muestran su aportación y la última edición
conocidas; no se inventan cambios anteriores a la activación del historial.

Desde el historial, una cuenta verificada puede enviar un agradecimiento,
consulta o controversia mediante `contactarColaboradorTumba`. El destinatario
se resuelve en el servidor desde la entrada seleccionada y la conversación
continúa en Mensajes, sin revelar el correo de ninguna de las partes.

Publicar primero las cinco funciones nuevas y `resolverDisputaDuplicado`
(actualiza la atribución de las sustituciones), y después Hosting con su
reescritura de descarga. Las reglas existentes ya bloquean el acceso directo
a la subcolección de historial.
Pruebas: `npm run test:history`, `npm run test:public:ui` y la suite de funciones.
`npm run verify:history` crea una cuenta y una lápida privadas temporales,
comprueba los disparadores y la descarga real y elimina los datos de prueba.
No envía mensajes a usuarios.
