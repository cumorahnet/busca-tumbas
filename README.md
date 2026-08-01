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
