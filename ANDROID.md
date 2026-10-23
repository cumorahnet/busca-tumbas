# Busca Tumbas para Android

Proyecto Capacitor 8 que empaqueta la interfaz web localmente. Android Studio abre la carpeta `android`. Identificador inicial: `com.cumorahnet.buscatumbas`. Confírmalo antes de la primera publicación: Google Play no permite cambiar el identificador de una aplicación existente.

## Preparar y abrir

Requiere Node 22 o superior, Android Studio 2025.2.1 o superior, Java 21 y Android SDK 36. El script detecta el JDK incluido en Android Studio y el SDK estándar en Windows. También respeta JAVA_HOME y ANDROID_HOME.

Si Android Studio incluye Java 25, el script busca un JDK 21 en la caché `~/.gradle/jdks`. Si no lo encuentra, configura JAVA_HOME con la instalación de Java 21.

```powershell
npm ci
npm run android:open
```

Después de modificar la web, ejecuta `npm run android:sync` para copiar los cambios a Android. El empaquetado incluye bibliotecas, fuentes y catálogo local, descarga versiones fijadas por URL y guarda una caché en `.android-cache`. Firebase, Gemini, INEGI y fotografías remotas necesitan internet. No se implementa guardado sin conexión.

## Generar instalador de prueba

```powershell
npm run android:apk
```

Resultado: `android/app/build/outputs/apk/debug/app-debug.apk`. Es de prueba y usa firma de desarrollo.

## Generar el paquete de Google Play

```powershell
npm run android:bundle
```

Resultado: `android/app/build/outputs/bundle/release/app-release.aab`, firmado con la clave de carga configurada. Copia `android/keystore.properties.example` a `android/keystore.properties` y configura la ruta de tu clave existente, su alias y sus contraseñas localmente. El archivo de contraseñas y los archivos .jks/.keystore están ignorados por Git. También se admiten las variables ANDROID_KEYSTORE_FILE, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS y ANDROID_KEY_PASSWORD, con prioridad sobre el archivo. Las rutas relativas parten de android/; en Windows utiliza / en las rutas del archivo properties.

La compilación release se detiene si faltan datos de firma o el archivo de clave; no sustituye la clave existente ni utiliza la de depuración. Guarda una copia de seguridad de la clave y sus credenciales fuera del repositorio. La clave de carga debe coincidir con la registrada en Play Console. Play App Signing utiliza su certificado de firma de aplicaciones para la distribución; ese certificado es el que debes registrar también en Firebase para el acceso con Google.

La configuración apunta a API 36, Android mínimo 7 (API 24), versionCode 2 y versionName 2.14.1. Incrementa versionCode para cada carga nueva y actualiza versionName al publicar una versión distinta.

## Integraciones y permisos

- Correo y contraseña siguen usando el SDK web. Google usa @capacitor-firebase/authentication con skipNativeAuth y transfiere el token al SDK web; requiere android/app/google-services.json.
- Si Authentication rechaza el origen local, revisa los dominios autorizados de Firebase y agrega localhost. Prueba el acceso por correo, verificación y recuperación.
- Cámara y ubicación se solicitan únicamente al utilizar sus funciones. No se solicitan permisos de micrófono, almacenamiento amplio ni ubicación en segundo plano.
- El botón Atrás cierra primero los diálogos y luego vuelve al menú; pide confirmación al abandonar captura. En la raíz minimiza la app.
- La cámara se cierra al pasar a segundo plano.
- Android usa áreas seguras nativas y ajuste al teclado.
- Comprar Plus por correo está deshabilitado en Android. Los beneficios existentes se conservan. Para vender beneficios digitales integra Play Billing y verificación en backend.
- El icono vectorial incluido es una marca inicial de ubicación y lápida; se puede reemplazar con Image Asset en Android Studio.

## Antes de enviar a revisión

1. Prueba en un teléfono físico: crear cuenta, verificar correo, entrar, salir, tomar foto, elegir archivo, permitir/rechazar GPS, extraer datos, guardar, buscar, girar pantalla, teclado, Atrás y pérdida de red.
2. Publica `privacy.html` y `delete-account.html` en el hosting y verifica sus URLs públicas. Revisa que la política refleje tus prácticas reales y el responsable del servicio antes de publicarla.
3. La eliminación se solicita por correo y **requiere atención manual del administrador**. Al recibir una solicitud, verifica al titular y elimina la cuenta de Auth y sus datos vinculados en Firestore/Storage, incluidos beneficios, solicitudes/correcciones y aportaciones. No basta con borrar solo el usuario de Auth. Confirma la eliminación al usuario. No hay borrado automático implementado.
4. Completa Seguridad de los datos, clasificación, público objetivo, declaración de anuncios, ficha, icono de tienda de 512×512, capturas y gráfico de funciones en Play Console. Declara los tratamientos de Firebase y Gemini y las prácticas reales de anuncios.
5. Proporciona acceso de revisión si la app requiere cuenta y completa las pruebas que Play Console exija para tu cuenta de desarrollador.
6. Firma el AAB con tu clave de carga y envíalo primero a pruebas internas.

No se ha publicado ni desplegado esta versión. La compilación técnica no garantiza aprobación de Google Play.

Fuentes:
- https://capacitorjs.com/docs/getting-started/environment-setup
- https://developer.android.com/google/play/requirements/target-sdk
- https://support.google.com/googleplay/android-developer/answer/13327111
- https://support.google.com/googleplay/android-developer/answer/9858738

## Verificación realizada

- 21/10/2026: `npm run android:bundle` completado con clave de carga existente (alias buscatumbas-upload). AAB 2.14.1 (2) firmado en android/app/build/outputs/bundle/release/app-release.aab y comprobado con jarsigner (`jar verified`). SHA-256 del archivo: 0C5BA5E627110C62F116593C5729FCE9704F00689B912930591B4DF0303CEA5D. La aceptación de la clave registrada y del paquete debe comprobarse al cargarlo a Play Console.
- APK debug y AAB release compilados correctamente.
- Seis pruebas automáticas de navegación y empaquetado aprobadas con `npm run test:android`.
- Android Lint del módulo app: 0 errores y 19 advertencias; incluye recursos de la plantilla sin utilizar. Capacitor utiliza además su baseline de lint.
- No se ha probado en un teléfono físico ni se han validado cámara, GPS o autenticación contra producción desde Android.
- La prueba instrumentada de contexto contiene el identificador correcto, pero no se ha ejecutado en un dispositivo.

## Instalación web temporal antes de Play Store

La web ofrece instalar la PWA desde Android y agregarla a inicio en Safari de iPhone/iPad. El aviso de primera visita se guarda con la clave buscatumbas_pwa_install_seen_v1; los botones de acceso y cabecera permiten recuperar la opción. El navegador decide si ofrece instalación nativa y solo se abre tras una acción del usuario. No se muestra dentro de Capacitor ni en modo standalone.

El módulo es mobile/install.js y el service worker sw.js utiliza la red sin precachear datos, sesiones ni fotos; la app sigue necesitando internet. El worker no se registra desde la app nativa. Los iconos se comparten con la identidad visual del proyecto.

Al publicar en Play Store, poner data-temporary-install="off" en el elemento html de index.html y sustituir los botones por el enlace real de la ficha. No hay enlace de tienda ficticio ni fecha de publicación automática. Si se modifica la experiencia, actualizar la versión del script y la clave de aviso solo cuando corresponda.

Verificación: npm run test:android cubre primera visita, segunda visita, evento tardío, aceptación, rechazo, instalación completada, iOS, errores y PNG reales. El diálogo nativo se simula en automatización; debe confirmarse en un teléfono compatible.

## Acceso con Google (web/PWA y Android)

El botón Continuar con Google exige aceptar los términos antes de abrir Google. En web usa una ventana emergente de Firebase; Android usa el selector nativo y crea la sesión del SDK web con el token obtenido, sin mantener una segunda sesión nativa.

Configuración para mantener o reproducir la activación (proveedor Google y firma de desarrollo comprobados el 19 de octubre de 2026):

1. En https://console.firebase.google.com/project/buscatumbas-2e7cc/authentication/providers agrega Google, selecciona el correo de asistencia y guarda. Esto crea el cliente OAuth necesario.
2. Ejecuta `npm run google:sync` para comprobar el proveedor y descargar google-services.json con los clientes OAuth. La app Android com.cumorahnet.buscatumbas ya está registrada y tiene la huella SHA-1 de desarrollo 35:6D:61:93:6D:E5:FB:7F:C7:5E:91:D1:F0:B2:44:A1:86:42:8F:0D.
3. Ejecuta `npm run android:apk` con Java 21 y verifica crear cuenta, salir y entrar con Google en un teléfono real. No publiques la integración hasta completar esta prueba y la configuración del proveedor.
4. Para distribución en Google Play agrega también la SHA-1 del certificado de firma de aplicaciones de Play Console y vuelve a ejecutar `npm run google:sync`.

`npm run google:check` consulta requisitos sin cambiar archivos. No imprime tokens ni secretos OAuth. Para web/PWA usa los dominios autorizados del proyecto (.web.app y .firebaseapp.com); un dominio propio también debe autorizarse en Authentication.

El empaquetado Android copia la biblioteca JavaScript de @capacitor/core a www/vendor/capacitor.js y la carga antes del resto del código. El puente inyectado por la WebView requiere esta biblioteca para registrar los complementos. La prueba mobile-tests/native-runtime.test.mjs comprueba el flujo con esa biblioteca real.

Verificación del 19 de octubre de 2026: APK compilado, instalado y registro con Google confirmado por el usuario en Samsung SM-A055M. Web/PWA publicada y proveedor Google comprobado con npm run google:check.

## Descargas de FamilySearch en Android

PublicDownloadsPlugin guarda fotografías en Descargas/Busca Tumbas mediante MediaStore desde Android 10. En Android 7–9 se usa el selector del sistema para elegir el destino, sin permisos amplios de almacenamiento. La app relee el archivo y verifica tamaño y SHA-256 antes de confirmar el guardado. El botón Abrir foto guardada abre el archivo confirmado mediante su URI de contenido.

Las fotografías se transfieren con HTTP nativo para evitar bloqueos CORS de la WebView; se mantienen los bytes originales. El navegador web conserva la descarga estándar y solo informa que se envió al navegador.

Verificación en Samsung SM-A055M: descarga real desde el catálogo, extracción del archivo de /sdcard/Download/Busca Tumbas y comparación SHA-256 con el original.

## Areas seguras e iPhone

Las pantallas, dialogos, controles de camara y mensajes comparten un rectangulo seguro que suma los insets nativos o del navegador a su margen. npm run test:mobile:layout comprueba distintos tamanos y orientaciones en Chromium y WebKit. La preparacion nativa de iPhone y las limitaciones de validacion se documentan en IOS.md.
