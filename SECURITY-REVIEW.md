# Revision de seguridad y errores - 2026-09-30

## Alcance
Revision local de index.html, funciones, reglas Firestore/Storage, configuracion de Hosting y empaquetado Android. Se conservaron los cambios previos del usuario. No se desplegaron cambios ni se modificaron datos de produccion.

## Corregido
- Se exige correo verificado tambien para la cuenta administradora en cliente, funciones y reglas. El administrador debe verificar su correo antes de volver a entrar.
- Se codifican los argumentos dinamicos de botones para los contextos JavaScript y HTML. Se eliminan rutas de XSS almacenado por nombres e identificadores maliciosos, incluido el panel administrativo.
- Las solicitudes de correccion comprueban el propietario real del registro y la identidad del remitente. Las notificaciones de panteones solo pueden crearlas administradores.
- Las conversaciones permiten agregar mensajes propios, sin reescribir el historial ni suplantar al otro participante.
- La edicion comunitaria de panteones limita los campos modificables y valida nombre, alias y localidad. Se bloquea la inyeccion de campos arbitrarios, incluyendo id.
- Las tumbas no permiten atribuir contributorId a otro usuario y requieren timestamp valido.
- Se rechazan coordenadas nulas, cadenas, booleanos y valores fuera de rango. No se reenvian mensajes internos del proveedor Gemini al cliente.
- El administrador puede revisar sus propios panteones sin intentar generar una conversacion consigo mismo, que las reglas rechazan.
- Hosting incorpora proteccion contra framing, objetos embebidos y cambios de base URI; excluye pruebas e informes.
- Se actualizaron dependencias y archivos lock. Los overrides de gRPC y OpenTelemetry fijan versiones corregidas. UUID 11.1.1 se aplica solo a gaxios 6.7.1 y xcode 3.0.1, cuyos consumidores usan v4 y fueron comprobados.

## Verificacion
- 14 pruebas de funciones aprobadas, tambien con Node 22 (runtime de produccion).
- 4 pruebas de integracion de reglas aprobadas en Firestore/Storage Emulator con proyecto demo-buscatumbas-security. Cada prueba incluye varias operaciones permitidas y denegadas.
- 2 pruebas del cliente aprobadas: argumentos maliciosos y compilacion de scripts.
- 6 pruebas de empaquetado y comportamiento Android aprobadas.
- ESLint aprobado. git diff --check sin errores.
- npm audit: 0 vulnerabilidades conocidas en raiz y functions tras las actualizaciones; esto no demuestra ausencia de vulnerabilidades desconocidas.
- Comprobacion de CLI Firebase/Capacitor y consumidores UUID aprobada.

Comandos: npm --prefix functions test; npm --prefix functions run lint; npm run test:security:client; npm run test:security:rules; npm run test:android.
Para emuladores se necesita Java en PATH; en este equipo se utilizo el JBR de Android Studio. Node local es 26; se recomienda ejecutar las herramientas con Node 22 por sus restricciones de engines.
Las pruebas siguen el enfoque oficial: https://firebase.google.com/docs/rules/unit-tests

## Pendientes y limites
- Estas correcciones son locales: no protegen la version publicada hasta desplegar cliente, funciones y reglas conjuntamente.
- No se inspeccionaron IAM, proveedores Auth habilitados, restricciones de claves, configuracion App Check ni reglas efectivamente desplegadas. Las funciones siguen con enforceAppCheck:false. Activarlo requiere registrar y configurar los clientes web/Android antes, para no bloquearlos.
- El programa de recompensas cuenta documentos de tumbas creados directamente por usuarios. La deduplicacion del cliente no evita que un usuario verificado escriba registros ficticios mediante la API. Evitar ese abuso requiere validacion/moderacion de aportes en servidor antes de conceder recompensas; no se cambio el criterio comercial automaticamente.
- Los documentos compartidos contienen correos de aportadores legibles por usuarios verificados. Si deben ser privados, hay que migrarlos a documentos restringidos y adaptar su lectura administrativa. Las URL de descarga con token de Storage tambien pueden compartirse fuera de la aplicacion.
- No se probaron Gemini/INEGI con credenciales reales, pagos, navegador de extremo a extremo ni APK en dispositivo. Las pruebas Android realizadas verifican JavaScript y recursos empaquetados, no equivalen a una certificacion del APK.
- Los cambios no limpian documentos maliciosos o invalidos que ya pudieran existir en produccion. Se necesita una revision de esos datos antes de afirmar que no hay inconsistencias existentes.
- No se garantiza ausencia absoluta de errores o vulnerabilidades.

## 19/10/2026: clave cliente Android y alerta GitHub 3

La clave de android/app/google-services.json es configuración pública de Firebase, no una clave de cuenta de servicio ni el secreto de Gemini. Se restringió en Google Cloud al paquete com.cumorahnet.buscatumbas y a las huellas SHA-1 registradas en Firebase. Solo admite identitytoolkit.googleapis.com, securetoken.googleapis.com y firebaseinstallations.googleapis.com. Las reglas de datos y la autenticación siguen determinando el acceso a Firebase.

Comprobar con `npm run firebase:key:check`. Después de registrar una firma de publicación o Play App Signing, ejecutar `npm run firebase:key:restrict` para incluir sus huellas. Estos comandos no imprimen los valores de las claves ni los tokens de acceso. La clave web es distinta y esta revisión no cambia sus restricciones.

Referencia oficial: https://firebase.google.com/docs/projects/api-keys

La alerta GitHub #3 quedó resuelta como false_positive por tratarse de configuración pública de cliente. Verificación posterior a la propagación: HTTP 403 sin identidad Android y HTTP 200 con el paquete y certificado registrados. No se revocó la clave ni se eliminó del historial: su valor forma parte de la configuración distribuida en la app y las restricciones se aplican en Google Cloud.

## 2026-10-28: revision local 2.60.0

Alcance: web/PWA, backend, reglas Firestore/Storage, dependencias y Hosting. Se conservaron los cambios previos. Sin despliegue ni cambios en datos de produccion.

Correcciones:
- Reparado EOVERRIDE de xcode que impedia npm audit. Actualizaciones compatibles en ambos lockfiles. Backend: @fastify/busboy 3.2.4, body-parser 2.4.0, proxy-addr 2.0.8 y qs 6.17.1. Auditorias finales de raiz y functions: cero vulnerabilidades conocidas. El aviso critico de proxy-addr depende de la configuracion de proxies; no demuestra una explotacion. Referencia: https://github.com/advisories/GHSA-jqcg-44mw-7w3h
- Disputas: mismo usuario y privilegios reutilizan suscripciones. Cambiar privilegios o salir cancela las anteriores; generaciones descartan callbacks antiguos y un error permite reintentar.
- Editar tumbas ya no descarga todo el catalogo del cliente. Se conserva la validacion transaccional del servidor y la tarjeta de comparacion. Fallos de hashes quedan dentro del manejo de errores.
- Choices.js fijado a 11.1.0 en web y empaquetador nativo. Hosting excluye mjs, documentacion, outputs y archivos de firma.
- Prueba de terminos adaptada al formulario obligatorio actual, sin retirar validaciones. Prueba movil de version usa version.json.

Comprobaciones:
- 338 pruebas locales aprobadas; 10 con emuladores, incluyendo permisos, perfiles incompletos, suspension, mensajes, archivos ajenos, disputas y creaciones concurrentes de duplicados. Metodo oficial: https://firebase.google.com/docs/rules/unit-tests
- Backend probado tambien con Node 22. ESLint y git diff --check aprobados.
- Chromium y WebKit: inicio publico, detalle, controles para invitados y cancelacion; areas seguras en cinco perfiles por navegador. Datos controlados, sin sesion real en produccion.
- Fuentes, www y recursos Android/iOS sincronizados en 2.60.0, codigos nativos 33. Verificador estructural iOS aprobado. Sin APK/IPA ni compilacion Xcode.

Limites y pendientes:
- No se certifica ausencia absoluta de fallos. No se midieron carga o latencia en produccion ni se probaron camara/GPS en telefono o Gemini/INEGI con operaciones reales.
- No se confirmaron IAM, configuracion Auth ni reglas desplegadas. App Check sigue desactivado en funciones; habilitarlo requiere configurar clientes.
- Las reglas dejan leer documentos compartidos a cuentas verificadas; pueden contener correos de colaboradores o estados pendientes/rechazados. La proyeccion anonima filtra informacion privada. Restringir tambien el acceso autenticado requiere separar datos privados mediante una migracion compatible, pendiente.
- Persisten lecturas amplias del catalogo en validaciones del servidor y listas sin paginacion completa. Requieren medicion e indices/paginacion que conserven comparacion aproximada y exclusion mutua. No se afirma una mejora medida de latencia.
- Permisos y deduplicacion no certifican la veracidad de los aportes ni evitan por si solos abusos del programa de recompensas.
- Cambios guardados localmente; necesitan despliegue posterior de Hosting y funciones con lockfiles actualizados para aplicarse a produccion.

### Publicacion posterior de 2.60.0 (2026-10-28)

Hosting y las 38 funciones desplegados. Una funcion agoto el plazo de aprovisionamiento de Cloud Run en el primer intento; el reintento termino correctamente. Ambos dominios sirven archivos identicos a las fuentes y excluyen los archivos internos comprobados. Las llamadas anonimas a actualizarAportacionTumba y gestionarAporteAdmin devuelven 401. No se modificaron reglas ni datos reales para las verificaciones. Los limites de la auditoria anteriores siguen vigentes. Codigo subido a origin/main, commit a36edfe5; sin APK/IPA nuevo.
