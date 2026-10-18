# Lanzamiento y monetización

- Periodo global sin anuncios: 17 de octubre de 2026 a 14 de enero de 2027 inclusive, Ciudad de México (90 días).
- Revisión propuesta: 1 de enero de 2027. La fecha es un pendiente de trabajo, no un recordatorio automático.
- Primera fecha posible para monetizar: 15 de enero de 2027. No se activa nada automáticamente.

La configuración del servidor está en functions/monetization-config.json. adsEnabled y plusSalesEnabled permanecen en false. Antes del fin de la gracia el servidor rechaza monetizar aunque se cambien a true. Después, se necesita habilitar expresamente cada interruptor y desplegar obtenerEstadoBeneficios y activarPlusAdmin. Plus requiere que también estén habilitados los anuncios. Una configuración de fechas inválida mantiene todo desactivado.

Mientras no haya anuncios, se cuentan las aportaciones pero no se consumen nuevos hitos de recompensa: los meses pendientes se conceden una sola vez al consultar beneficios cuando se activen los anuncios. Las fechas de beneficios ya concedidos se mantienen; no se modifican cobros existentes ni se crean suscripciones. El acceso Plus nativo sigue oculto hasta integrar un flujo de compra compatible.

Antes de activar: elegir proveedor y unidades de anuncios, implementar los anuncios reales (actualmente son espacios de patrocinio), revisar privacidad y consentimiento, definir precios de Plus y su cobro y validación, preparar Play Billing para Android donde corresponda y comunicar el cambio. Verificar cuentas gratuitas, administrativas, con recompensas y con Plus. La app oculta anuncios y compras si no puede comprobar beneficios; un cliente anterior al cambio no podrá activar Plus mientras el servidor lo bloquee.

Para detener la monetización, volver a poner ambos interruptores en false y desplegar esas funciones. Los clientes nuevos vuelven a consultar el estado al regresar al menú; no hay actualización en tiempo real de una pantalla ya abierta. No hay SDK publicitario ni facturación automática nuevos en este cambio.
