# Decisiones del proyecto

<!-- cdc-session:session-20260801223240-09c79a -->
## 01/08/2026, 09:07 p.m. — session-20260801223240-09c79a

- ponerlo guapo


## 01/10/2026 — Contraseñas distintas para un mismo correo

Firebase conserva la contraseña normal. La segunda contraseña administrativa se
verifica con scrypt en servidor y emite un token personalizado para el mismo UID.
El claim platform_admin identifica cuentas elegibles, pero no sustituye la segunda
contraseña. Functions y Firestore exigen superuser_session y superuser_until vigente.
Esta decisión sustituye el acceso global con la misma contraseña del usuario y la
exigencia anterior de una cuenta con correo dedicado.

## 01/10/2026 — Entrada global sin sesión normal previa

El acceso de superusuario autentica directamente correo y contraseña administrativa
en servidor. No requiere Auth de usuario previo. La cuenta se identifica por correo;
la comprobación del rol y la emisión del token se realizan solo después de validar
la identidad habilitada y la contraseña independiente. Conserva el mismo UID y
los límites temporales de autorización. Sustituye el requisito de entrada normal
previa introducido en v2.15.
