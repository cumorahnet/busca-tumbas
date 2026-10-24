# Migración a buscatumbas.lat

Fecha: 23 de octubre de 2026. Versión preparada: 2.31.0.

## Estado

- Se conserva el proyecto Firebase `buscatumbas-2e7cc`, con las mismas cuentas, datos y fotografías.
- `buscatumbas.lat` registrado en Firebase Hosting y añadido a los dominios autorizados de Authentication.
- CORS del almacenamiento actualizado conservando las reglas anteriores y agregando ambos dominios personalizados.
- Código, enlaces compartidos, metadatos y recursos web de `www/` preparados con el dominio nuevo.
- Android: 2.31.0, código 4. iOS: 2.31.0, compilación 2. No se generó APK ni archivo de distribución iOS.
- Compilación de recursos web completada. Pasaron 20 pruebas de compartir, runtime nativo y autenticación Google.
- Publicación de Hosting completada por solicitud del usuario. Se comprobó HTTP 200 por HTTPS en `buscatumbas.lat`, `buscatumbas.cumorahnet.com` y el dominio `web.app`; todos sirven 2.31.0, el mensaje motivador y el bloqueo del gesto de recarga. También se comprobó `version.json` en los tres dominios.
- Firebase confirma `HOST_ACTIVE` y `OWNERSHIP_ACTIVE`. El certificado responde correctamente en la comprobación HTTPS, pero su estado administrativo sigue en `CERT_PROPAGATING`.
- Pendiente: confirmar `CERT_ACTIVE` antes de activar la redirección. El dominio antiguo continúa activo, sin redirección; la comprobación previa impidió modificarlo mientras el certificado sigue propagándose.

## DNS de Spaceship

En Advanced DNS, seleccionar `buscatumbas.lat`. Conservar los nameservers actuales `launch1.spaceship.net` y `launch2.spaceship.net`.

Firebase solicitó los siguientes cambios (consulta del 23 de octubre de 2026):

| Acción | Tipo | Host | Valor |
| --- | --- | --- | --- |
| Eliminar | A | @ | 34.216.117.25 |
| Eliminar | A | @ | 54.149.79.189 |
| Añadir | A | @ | 199.36.158.100 |
| Añadir | TXT | @ | hosting-site=buscatumbas-2e7cc |
| Añadir | TXT | _acme-challenge | sx4VW2CVa72IPaZyUWuAsi0blR2IxCInzBaucCqb90o |

Usar el TTL predeterminado. El último TXT es el desafío de certificado devuelto por Firebase y puede cambiar; consultar de nuevo si la configuración se retoma después. Mantener el TXT de propiedad. No modificar registros de correo ni otros servicios.

## Finalización

1. Confirmar propagación DNS y estados `HOST_ACTIVE`, `OWNERSHIP_ACTIVE` y `CERT_ACTIVE` de Firebase Hosting.
2. Verificar restricciones de origen de la clave web y ejecutar `npm run google:check`. La configuración `authDomain` conserva el dominio de Firebase para no cambiar el flujo OAuth durante esta transición.
3. Publicar Hosting y comprobar HTTPS, versión 2.31.0, catálogo público, inicio de sesión, instalación PWA, compartir y descarga de fotografías desde el nuevo origen.
4. Solo después de verificar el dominio nuevo, configurar en Firebase Hosting el `redirectTarget` del dominio antiguo hacia `buscatumbas.lat`. Comprobar rutas, parámetros y enlaces existentes.
5. Las sesiones y la instalación PWA pertenecen a cada origen: puede ser necesario iniciar sesión e instalar de nuevo desde el dominio nuevo. No se migran automáticamente las sesiones del navegador.
6. `www.buscatumbas.lat` no está registrado ni configurado; el dominio principal solicitado es `buscatumbas.lat`.

Documentación: https://firebase.google.com/docs/hosting/custom-domain
