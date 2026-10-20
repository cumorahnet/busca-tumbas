# iPhone y areas seguras

La web/PWA se usa en Safari y se puede agregar a la pantalla de inicio. El proyecto nativo esta en ios/App/App.xcodeproj y apunta a iOS 16.4 o posterior. La interfaz comparte las mismas funciones del catalogo, aportaciones, busqueda, camara, GPS, Google y preparacion manual para FamilySearch.

## Comprobaciones realizadas en Windows

- Chromium y WebKit: areas seguras en vertical, horizontal, pantalla pequena y altura reducida por teclado. Se comprueban registro, camara, dialogos, detalles y mensajes.
- WebKit: copia de los datos colaborativos y preparacion de la foto para compartir mediante un segundo toque del usuario. El sistema permite elegir Guardar imagen o Guardar en Archivos; la web no asegura que se guardo solo por abrir ese menu.
- WebKit: descarga real de una fotografia desde el dominio publico de la app, con CORS del bucket configurado en storage.cors.json.
- Revision estructural del proyecto iOS, permisos, callback de Google y registro del complemento PublicDownloads.

Estas pruebas no sustituyen compilar con Xcode ni probar en un iPhone real. No se ha generado un IPA ni se ha enviado nada a App Store.

## Preparar en un Mac

Requiere un Mac con Xcode compatible con Swift 6.1 o posterior, Node compatible con Capacitor y una cuenta de Apple Developer para distribucion.

1. Ejecutar npm ci y firebase login con un operador autorizado.
2. Ejecutar npm run ios:firebase. Descarga GoogleService-Info.plist localmente y configura el callback de Google; el archivo esta excluido de Git y del hosting.
3. Ejecutar npm run ios:sync y npm run ios:verify.
4. Ejecutar npm run ios:open. Elegir el Team de Apple y activar la firma para com.cumorahnet.buscatumbas.
5. Probar en iPhone real Google, correo/verificacion/recuperacion, camara y galeria, GPS, aportaciones, busquedas, edicion autorizada, descargas FamilySearch, copia, enlaces externos, teclado y orientacion.

Firebase tiene registrada la app iOS com.cumorahnet.buscatumbas. Su clave dedicada se restringio al bundle y a Identity Toolkit, Secure Token e Installations. No depende de la clave Android.

## Guardado nativo

PublicDownloadsPlugin.swift guarda en Documents/FamilySearch y relee el archivo para verificar bytes y SHA-256 antes de confirmar. Con Compartir archivos activado se encuentra en Archivos > En mi iPhone > Busca Tumbas > FamilySearch. Abrir foto guardada utiliza Quick Look, con su opcion para compartir. No se solicitan permisos amplios ni guardado automatico en Fotos.

## Pendientes para publicar en App Store

El usuario no dispone todavia de Mac ni cuenta de Apple Developer. Quedan pendientes la compilacion y firma, pruebas en iPhone/TestFlight y configuracion de App Store Connect.

Como existe Google como acceso social, debe configurarse el servicio de acceso equivalente exigido por la regla 4.8 de Apple, normalmente Sign in with Apple, antes de presentar la app. No se muestra un boton que no este configurado. La eliminacion de cuenta actual se solicita por correo; tambien debe adaptarse al requisito de iniciar la eliminacion desde la app antes de presentarla. Completar la informacion real de privacidad, clasificacion y revision del catalogo colaborativo.

Referencias: https://developer.apple.com/app-store/review/guidelines/ y https://capacitorjs.com/docs/ios
