# Lanzamiento y monetización

- Periodo global sin anuncios: 17 de octubre de 2026 a 1 de enero de 2027 inclusive, Ciudad de México.
- Revisión propuesta: 1 de enero de 2027. La fecha es un pendiente de trabajo, no un recordatorio automático.
- Primera fecha posible para monetizar: 2 de enero de 2027. No se activa nada automáticamente.

La promoción del primer mes concede un año sin anuncios a quien alcance 50 aportaciones válidas durante el primer mes calendario desde la creación de su cuenta en Firebase Auth. Se deduplican las tumbas por ID y se cuentan tumbas publicadas (incluidos registros heredados sin estado) y lugares aprobados, usando sus fechas de creación guardadas por el servidor. Se excluyen registros privados, rechazados, pendientes, sin fecha, anteriores a la cuenta, futuros o en el instante exacto del vencimiento del mes. Un lugar aprobado después cuenta por la fecha en que fue aportado. Las fotos adicionales de una tumba no son registros nuevos para esta promoción.

El año se cuenta desde la fecha de la aportación válida número 50, por decisión expresa del usuario, incluso si se consulta el beneficio más tarde. Mes y año son periodos de calendario con ajuste al último día para fechas como 31 de enero o 29 de febrero. El derecho se guarda una sola vez en `_entitlements`; las consultas posteriores no reinician el plazo. Los beneficios de pago y las recompensas habituales se conservan; se aplica la fecha de cobertura más larga, sin sumar automáticamente el año promocional a otro plazo. Los anuncios permanecen desactivados globalmente hasta su habilitación explícita.

La configuración del servidor está en functions/monetization-config.json. adsEnabled y plusSalesEnabled permanecen en false. Antes del fin de la gracia el servidor rechaza monetizar aunque se cambien a true. Después, se necesita habilitar expresamente cada interruptor y desplegar obtenerEstadoBeneficios y activarPlusAdmin. Plus requiere que también estén habilitados los anuncios. Una configuración de fechas inválida mantiene todo desactivado.

Mientras no haya anuncios, se cuentan las aportaciones pero no se consumen nuevos hitos de recompensa: los meses pendientes se conceden una sola vez al consultar beneficios cuando se activen los anuncios. Las fechas de beneficios ya concedidos se mantienen; no se modifican cobros existentes ni se crean suscripciones. El acceso Plus nativo sigue oculto hasta integrar un flujo de compra compatible.

Antes de activar: elegir proveedor y unidades de anuncios, implementar los anuncios reales (actualmente son espacios de patrocinio), revisar privacidad y consentimiento, definir precios de Plus y su cobro y validación, preparar Play Billing para Android donde corresponda y comunicar el cambio. Verificar cuentas gratuitas, administrativas, con recompensas y con Plus. La app oculta anuncios y compras si no puede comprobar beneficios; un cliente anterior al cambio no podrá activar Plus mientras el servidor lo bloquee.

Para detener la monetización, volver a poner ambos interruptores en false y desplegar esas funciones. Los clientes nuevos vuelven a consultar el estado al regresar al menú; no hay actualización en tiempo real de una pantalla ya abierta. No hay SDK publicitario ni facturación automática nuevos en este cambio.
