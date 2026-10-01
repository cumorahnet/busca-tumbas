# Busca Tumbas

Aplicación web estática para registrar y buscar lápidas mediante Firebase y
extraer datos de fotografías con Gemini.

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

Consulta [ANDROID.md](ANDROID.md) para abrir el proyecto en Android Studio, generar APK/AAB y preparar la publicación. Ejecuta `npm run android:open` para sincronizar y abrir Android.

### Superusuario independiente

El usuario normal y el superusuario son identidades distintas en Firebase Auth.
La cuenta de contacto no obtiene permisos por su correo. Las funciones y reglas
requieren correo verificado y el claim booleano `platform_admin: true`, emitido
por Firebase Admin. El doble clic sobre la version abre el acceso con contrasena
independiente y persistencia en memoria.

Configuracion pendiente: indicar un correo tecnico propio y distinto del usuario
normal en `superuser-config.json`; comprobar tambien `projectId` y `uid`.
Este archivo es publico y nunca contiene contrasenas.

Desde la raiz del proyecto:

```powershell
node scripts/superuser-admin.mjs --check
node scripts/superuser-admin.mjs --create
```

También puedes ejecutar `npm run superuser:check` y `npm run superuser:create`.
El rol global se guarda en claims de Authentication; este proyecto no necesita
un perfil administrativo en Firestore. Los clientes no pueden emitir esos claims.
Ejecuta `npm run test:superuser` para verificar el flujo y las protecciones del comando.

`--check` solo consulta, incluso sin terminal interactiva. Utiliza el operador
seleccionado en Firebase CLI; `--operator CORREO` selecciona otro operador ya
conectado. `--create` pide dos veces una contrasena oculta de 16 a 128 caracteres.
No pasar contrasenas en argumentos, variables de entorno, archivos ni chat.
No promueve cuentas existentes ni cambia la contrasena del usuario normal.

Tras crear la cuenta, ingresar con su correo tecnico por el formulario normal y
completar la verificacion de correo existente antes del acceso de superusuario.
No se envia correo automaticamente desde la herramienta.

Si el alta se interrumpe despues de crear Auth, la cuenta queda deshabilitada.
`--complete` es una recuperacion explicita para esa identidad dedicada, con el
mismo UID/correo, marcador de alta y sin roles incompatibles. Nunca recupera una
cuenta normal. Una cuenta previamente completa y deshabilitada requiere revision
manual del operador. Para cambiar una contrasena existente, usar explicitamente
`node scripts/superuser-admin.mjs --rotate`; revoca tokens de renovacion, pero los
tokens de acceso ya emitidos pueden seguir vigentes hasta expirar.

La separacion local requiere publicar tanto `functions` como `firestore:rules`
ademas de Hosting. Mientras no se publiquen, el servidor remoto conserva sus
reglas anteriores. Crear la cuenta y publicar son pasos separados; comprobar el
acceso con la cuenta dedicada y el rechazo de la normal tras la publicacion.
Actualizar `www` con `npm run build:android` despues de configurar el correo.

Referencia: https://firebase.google.com/docs/auth/admin/custom-claims
