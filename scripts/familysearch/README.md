# Integración de Busca Tumbas con FamilySearch

Investigación y propuesta: 18 de octubre de 2026.

Estado: implementada la preparación manual de fotografías y textos. La integración
automática mediante API sigue siendo una propuesta pendiente de registrar la
aplicación y recibir acceso de FamilySearch. No hay conexión OAuth ni callback.

## Flujo manual disponible

En los resultados de búsqueda, abre una lápida y elige **Preparar para FamilySearch**.
También aparece en Mis aportaciones. Cualquier cuenta verificada puede preparar
fotografías del catálogo colaborativo, conservando el nombre del aportador original.

1. Descarga la fotografía original. Si el navegador bloquea la descarga, abre la
   foto original y usa su opción Guardar imagen.
2. Revisa el título y la descripción. Copia cada texto o descarga ambos en `.txt`.
   Editarlos en esta ventana no cambia el registro de Busca Tumbas.
3. Abre FamilySearch y completa personalmente la carga desde Recuerdos → Galería.
   Vincula la foto a la persona correcta después de revisar nombre, fechas y lugar.

La preparación no publica, no solicita credenciales de FamilySearch y no hace
peticiones a su API. Los textos omiten correos, coordenadas de captura y URLs con
tokens de descarga. La preparación exige sesión con correo verificado;
el cambio de cuenta cierra la preparación y evita guardar descargas pendientes.

Código: `mobile/familysearch.js`; pruebas: `mobile-tests/familysearch.test.mjs`;
verificación visual: `node scripts/verify-familysearch-ui.mjs`, tras preparar `www`
con `npm run build:android`. La verificación usa una foto de prueba y simula el
portapapeles y la descarga; no inicia sesión ni publica recuerdos en FamilySearch.

## Solicitud de acceso

El portal oficial indica solicitar acceso como proveedor externo, esperar la
aprobación y recibir la App Key. Beta y producción son entornos diferentes;
el acceso a Beta no garantiza aprobación para producción. Para escribir recuerdos
en producción se debe completar la revisión correspondiente de compatibilidad.

- Portal: https://developers.familysearch.org/
- Formulario enlazado actualmente desde Get Started: https://forms.office.com/r/EstYaQAZSm
- Inicio: https://developers.familysearch.org/main/docs/getting-started
- Consideraciones: https://developers.familysearch.org/main/docs/app-approval-considerations
- Revisión: https://developers.familysearch.org/main/docs/compatibility-review-process
- Soporte: https://developers.familysearch.org/main/docs/developer-support

Datos públicos para la solicitud:

| Campo | Valor |
| --- | --- |
| Aplicación | Busca Tumbas |
| Sitio | https://buscatumbas-2e7cc.web.app/ |
| Plataforma inicial propuesta | Web / PWA, utilizada en Chrome para Android |
| Público e idioma | Usuarios de habla hispana, con enfoque inicial en México |
| Función solicitada | Subir fotografías propias de lápidas como recuerdos y asociarlas con personas fallecidas existentes del Árbol Familiar |
| Lectura necesaria | Consultar y confirmar la persona seleccionada por su identificador de FamilySearch |
| Escritura necesaria | Crear recuerdos y vincularlos a la persona confirmada |
| Privacidad actual | https://buscatumbas-2e7cc.web.app/privacy.html |
| Condiciones actuales | https://buscatumbas-2e7cc.web.app/terms.html |

El responsable debe completar su nombre, correo de contacto, situación jurídica
y datos de organización si corresponde. No están determinados por esta revisión.
Confirmar con FamilySearch la modalidad de admisión y los requisitos aplicables
a ese responsable antes de comprometer una fecha de integración.

## Descripción preparada para el formulario

### Español

Busca Tumbas es una aplicación web y PWA en español para documentar sepulturas
mediante fotografías aportadas por sus usuarios. Queremos integrar FamilySearch
para que cada usuario pueda autorizar su propia cuenta, seleccionar una fotografía
de lápida que tenga derecho a compartir, confirmar la persona fallecida del Árbol
Familiar y publicarla como recuerdo. La integración propuesta incluirá revisión
previa del título y la descripción, atribución del fotógrafo y referencia al lugar
de sepultura. Solicitamos acceso Beta y orientación para las revisiones de lectura
de personas y escritura de recuerdos en producción. El envío será individual y
confirmado por el usuario; no se propone una sincronización masiva ni crear o
modificar personas automáticamente.

### English

Busca Tumbas is a Spanish-language web application and PWA for documenting
burials through user-contributed gravestone photographs. We would like to
integrate FamilySearch so users can authorize their own accounts, select a
gravestone photograph they have permission to share, confirm the deceased person
in Family Tree, and upload the photograph as a Memory. The proposed workflow
includes a preview of the title and description, photographer attribution, and
burial-place context. We request Beta access and guidance on the compatibility
reviews for reading person information and writing Memories in production.
Uploads would be individually confirmed by the user; we are not proposing bulk
synchronization or automatic creation or modification of Tree persons.

Transparencia adicional para la revisión: Busca Tumbas ya dispone de extracción
asistida por Gemini. Declarar esta función a FamilySearch y acordar el tratamiento
permitido de metadatos transcritos antes de habilitar cualquier envío de esos datos.
La fotografía enviada sería la imagen original, no una imagen generada con IA.

## Flujo propuesto dentro de la aplicación

1. Desde una aportación propia, elegir «Enviar a FamilySearch».
2. Conectar la cuenta mediante la pantalla oficial de autorización de FamilySearch.
3. Introducir el ID de una persona existente del Árbol Familiar. Consultar y mostrar
   su nombre y fechas; el usuario confirma que corresponde a la lápida.
4. Revisar fotografía, título, descripción, autor y lugar, y confirmar la publicación.
5. Mostrar el enlace al recuerdo creado. Registrar los identificadores devueltos
   para evitar repetir el envío al recargar o hacer doble clic.

Primera versión propuesta: una foto y una persona fallecida confirmada por envío.
La búsqueda de candidatos, etiquetas para varias personas y envíos por lotes
requieren una fase posterior y revisión del alcance con FamilySearch.

## Diseño técnico propuesto

- Conservar Firebase Auth para la sesión de Busca Tumbas. FamilySearch se conecta
  como cuenta externa autorizada por cada usuario, mediante Authorization Code.
- Recibir la respuesta OAuth en el backend, validar `state` de un solo uso y su
  caducidad, e intercambiar el código por el token. No guardar tokens en
  `localStorage`, documentos públicos o registros de diagnóstico.
- Reservar, sujeto a implementación y registro, este callback web:
  `https://buscatumbas-2e7cc.web.app/integraciones/familysearch/callback`.
  Esta ruta no existe todavía; deberá conectarse a una Cloud Function antes de
  utilizarla. FamilySearch exige registrar previamente el URI exacto.
- Revisar por separado el flujo de una futura aplicación Android nativa y los
  requisitos de PKCE. El alcance inicial propuesto es la web/PWA.
- Leer el registro y el archivo original desde Firestore/Storage en servidor,
  comprobar autoría y autorización; no aceptar una URL remota arbitraria del cliente.
- Mantener tokens y estados en colecciones privadas accesibles solo al backend,
  con caducidad y desconexión. Las reglas actuales deniegan colecciones desconocidas.
- Tratar el identificador de persona como dato confirmado por el usuario, no como
  una coincidencia automática basada únicamente en el nombre.
- Registrar un estado de envío por fotografía, usuario, entorno y persona.
  Una respuesta incierta de la API debe reconciliarse antes de reintentar, para
  evitar duplicar recuerdos tras un timeout.
- Crear el recuerdo mediante la API documentada y conservar el identificador
  y enlaces de la respuesta. No copiar cookies ni automatizar formularios web.

## Contrato oficial a validar en Beta

La documentación permite crear un recuerdo asociado a una persona mediante
`POST /platform/tree/persons/{pid}/memories`, con autorización Bearer, fotografía
binaria y metadatos como título, descripción, nombre del archivo y tipo.
El contrato exacto y permisos se probarán con la App Key recibida.

- OAuth: https://developers.familysearch.org/main/docs/authorization-code-flow
- Crear recuerdo para persona: https://developers.familysearch.org/main/reference/createpersonmemory
- Recuerdos: https://developers.familysearch.org/main/docs/memories-dir
- Registro del callback: https://developers.familysearch.org/main/docs/api-key-management

Antes de producción: probar cancelación de OAuth, sesiones caducadas, permisos,
persona equivocada, acceso a fotos ajenas, fallos parciales y duplicados; actualizar
la política de privacidad para describir la transferencia y obtener la aprobación
de FamilySearch para el alcance implementado.
