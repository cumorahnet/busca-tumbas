# Instrucciones permanentes del proyecto

## Versionado obligatorio

Por petición expresa del usuario del 23 de octubre de 2026, cada tarea que cambie el funcionamiento, contenido, interfaz, configuración o backend de la app debe incluir una actualización de versión antes de darse por terminada. No esperar a que el usuario lo recuerde ni solicitar confirmación para este paso.

- Incrementar la versión una vez por tarea o conjunto de cambios entregado, no por cada archivo ni por cada corrección intermedia. Seguir la secuencia actual: `2.30.0` → `2.31.0` → `2.32.0`, salvo otra indicación del usuario. Revisar la versión más alta existente para no retroceder ni reutilizar números.
- Mantener sincronizados `version.json` (`mayor` y `menor`), el título y `APP_VERSION` de `index.html`, `versionName` de `android/app/build.gradle` y todos los `MARKETING_VERSION` de `ios/App/App.xcodeproj/project.pbxproj`.
- Incrementar también `versionCode` de Android y todos los `CURRENT_PROJECT_VERSION` de iOS cuando se cambie la versión. Deben ser enteros crecientes respecto de los valores existentes y de las entregas conocidas.
- Registrar en `CHANGELOG.md` la nueva versión, la fecha, los cambios y las comprobaciones realizadas. No sobrescribir entradas ni trabajo previo.
- Antes de terminar, comprobar que las versiones coincidan. Si se generan recursos en `www/` o proyectos nativos, verificar que incluyan la versión nueva; no editar solamente una copia generada.
- Los parámetros de caché, como `app.css?v=18`, no sustituyen la versión de la app.
- Informar al usuario de la nueva versión y su estado real: cambios guardados, compilación generada y/o publicación completada. Solo afirmar lo que se haya realizado y comprobado. El aumento de versión no significa que la app instalada o publicada ya esté actualizada.
- Esta regla no autoriza por sí misma publicaciones, instalaciones ni despliegues. Respetar el alcance autorizado por el usuario.
- Las consultas y los cambios exclusivos de documentación o instrucciones, sin cambios en la app, no requieren aumentar su versión.

## Cambios pendientes al registrar esta regla

El bloqueo del gesto de recarga y el mensaje motivador de la pantalla principal se incluyeron en `2.31.0`, junto con la migración a `buscatumbas.lat`. Web, Android e iOS están sincronizados; Hosting ya está publicado y comprobado por HTTPS en ambos dominios. No se generó un APK nuevo. Consultar `DOMAIN-MIGRATION.md` para confirmar `CERT_ACTIVE` y completar la redirección pendiente del dominio antiguo.
