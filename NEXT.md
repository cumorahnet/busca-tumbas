# Próximas tareas

> Generado por CDC a partir de la sesión `session-20261017202008-b5867a`.

## Pendientes

- **Prioridad de lanzamiento: revisar anuncios y Plus el 1 de enero de 2027.** Gracia global del 17 de octubre de 2026 al 14 de enero de 2027 inclusive (90 días, Ciudad de México). El 15 de enero es la primera fecha posible de activación, no una activación automática.
  - Preparar proveedor de anuncios, privacidad/consentimiento y límites de frecuencia; definir precio, duración y cobro de Plus.
  - Para Android, integrar y validar Play Billing antes de ofrecer compras donde corresponda; el botón de compra nativo sigue deshabilitado.
  - Habilitar explícitamente `adsEnabled` y `plusSalesEnabled` en `functions/monetization-config.json` y desplegar las funciones de beneficios. Mantenerlos en `false` hasta completar la revisión.
  - Probar cuentas gratuitas, Plus, administrativas y con recompensas; avisar a los usuarios antes de activar. No se ha programado un recordatorio automático.

- **Prioridad primordial: integrar Busca Tumbas con FamilySearch.** Permitir que el usuario autorice la exportación de fotografías de lápidas como Recuerdos y las vincule con la persona correspondiente del Árbol Familiar.
  - Gestionar acceso de desarrollador, autorización del usuario y revisión/aprobación de FamilySearch antes de habilitar la integración en producción.
  - Confirmar los permisos de uso de las fotografías y las condiciones de ambas plataformas.
  - Pendiente de implementación; esta tarea solo registra la prioridad.

## Próximos pasos

- Revisar y resolver los riesgos detectados en este cierre.
- Definir el siguiente objetivo de trabajo del proyecto.

## Riesgos que deben revisarse

- No se detectaron archivos modificados. Confirma que el trabajo se haya guardado dentro del proyecto y fuera de carpetas ignoradas.
- El análisis incluye archivos que ya tenían cambios al iniciar la sesión.
- Cambió la definición de dependencias; valida instalación y seguridad.
