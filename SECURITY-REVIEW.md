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
