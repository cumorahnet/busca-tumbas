# Busca Tumbas para Android

Proyecto Capacitor 8 que empaqueta la interfaz web localmente. Android Studio abre la carpeta `android`. Identificador inicial: `com.cumorahnet.buscatumbas`. Confírmalo antes de la primera publicación: Google Play no permite cambiar el identificador de una aplicación existente.

## Preparar y abrir

Requiere Node 22 o superior, Android Studio 2025.2.1 o superior, Java 21 y Android SDK 36. El script detecta el JDK incluido en Android Studio y el SDK estándar en Windows. También respeta JAVA_HOME y ANDROID_HOME.

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

Resultado: `android/app/build/outputs/bundle/release/app-release.aab`. Este comando genera un AAB **sin firma de publicación**. Para publicar, en Android Studio elige **Build > Generate Signed App Bundle / APK > Android App Bundle**, selecciona el módulo app y crea o elige tu clave de carga. Guarda la clave y contraseñas fuera del repositorio. No se crea una clave de publicación automáticamente.

La configuración apunta a API 36, Android mínimo 7 (API 24), versionCode 1 y versionName 2.14.0. Incrementa versionCode para cada carga nueva y actualiza versionName al publicar una versión distinta.

## Integraciones y permisos

- Firebase sigue usando el SDK web y el proyecto existente; este flujo no necesita google-services.json.
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

- APK debug y AAB release compilados correctamente.
- Seis pruebas automáticas de navegación y empaquetado aprobadas con `npm run test:android`.
- Android Lint del módulo app: 0 errores y 19 advertencias; incluye recursos de la plantilla sin utilizar. Capacitor utiliza además su baseline de lint.
- No se ha probado en un teléfono físico ni se han validado cámara, GPS o autenticación contra producción desde Android.
- La prueba instrumentada de contexto contiene el identificador correcto, pero no se ha ejecutado en un dispositivo.
