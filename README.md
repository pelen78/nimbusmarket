# Nimbus Marketplace · acceso privado

Primera etapa: cuentas reales con correo y contraseña, confirmación del correo e invitaciones personales de un solo uso. No incluye todavía anuncios, fotos ni chat. El prototipo anterior está conservado en el historial de Git.

## Estado de entrega

Código y reglas comprobados en emuladores locales. Las reglas se publicaron en Firebase real el 29 de septiembre de 2026, y se creó una invitación inicial para la cuenta existente de la propietaria. Falta publicar los archivos del sitio y completar el inicio de sesión de la propietaria. Copiar archivos al sitio no despliega las reglas. No se habilitaron Storage ni facturación para esta etapa.

## Activación en producción

1. En Firebase Console, selecciona **nimbus-market**. Conserva una copia de las reglas actuales y publica el contenido de `firestore.rules` en Firestore → Rules, después de autorizar el cambio.
2. Authentication → Email/Password ya está habilitado. Revisa las plantillas de verificación y recuperación en español. Esta versión utiliza el gestor de acciones alojado por Firebase; no necesita acceso a tu correo ni guarda credenciales administrativas.
3. Crea una invitación para la cuenta existente de la propietaria siguiendo el procedimiento de abajo. No cambies su contraseña ni crees otra cuenta. El código antiguo consumido no es compatible ni necesario.
4. Publica los archivos del sitio: `index.html`, `access.css`, `access.js`, `access-service.js`, `firebase-config.js` y `logo.png`. El destino de publicación sigue siendo el del repositorio actual.
5. La propietaria inicia sesión, confirma su correo si aún no lo ha hecho y canjea su invitación. Comprueba después que una cuenta sin invitación no pueda obtener acceso.

## Invitar a un conocido

Solo quien administra el proyecto desde Firebase Console puede crear invitaciones; los visitantes y miembros no tienen ese permiso.

Ejecuta `node tools/prepare-invitation.mjs persona@ejemplo.com`. El comando solo prepara los datos, no los publica ni envía mensajes. En Firestore → Data → `inviteCodes`, crea un documento con el ID generado y estos campos:

- `email`: string, correo de la persona en minúsculas.
- `used`: boolean, `false`.
- `expiresAt`: timestamp, fecha de vencimiento indicada (siete días).

No uses un campo de texto para la fecha. Comparte el código con esa persona por el medio que tú elijas. Debe registrar y verificar ese mismo correo. No subas correos ni códigos reales al repositorio.

Para retirar un acceso existente, cambia `members/{uid}.status` a `revoked` desde la consola. Conserva el documento para impedir que el usuario reactive su cuenta con otra invitación. Para retirar una invitación sin usar, cambia su vencimiento a una fecha pasada.

## Garantías y límites

- Firebase Authentication comprueba las credenciales; los datos antiguos de `localStorage` no otorgan acceso.
- Crear una cuenta no da acceso al mercado. El correo debe estar verificado y la invitación debe pertenecer a ese correo.
- La creación del miembro y el consumo de la invitación ocurren en una sola transacción. La caducidad usa la hora del servidor.
- Las invitaciones no se pueden enumerar. Un destinatario verificado solo puede consultar una invitación dirigida a él si conoce su código.
- Cada miembro solo puede consultar su propio registro. No puede editarlo, borrarlo, añadir roles ni modificar su estado.
- Los datos futuros de artículos y chats siguen bloqueados. Al implementarlos, se necesitarán reglas que comprueben la membresía activa y el propietario; ocultar una pantalla no sustituye esos permisos.
- Los ajustes públicos de Firebase no son credenciales administrativas. No guardar claves privadas ni cuentas de servicio en el sitio.
- La aplicación no evita que alguien cree una cuenta de Authentication por API: impide que esa cuenta obtenga membresía o datos sin invitación. Antes de abrirla a más gente, revisar límites de abuso, cuotas y protección de Authentication.

## Pruebas locales

Requiere Node.js 20+ y Java 21+ para los emuladores.

```sh
npm ci
npm run test:rules
```

Las pruebas utilizan únicamente `demo-nimbus-market`: acceso anónimo, correo sin confirmar, lectura ajena, enumeración, invitación caducada o usada, manipulación de campos, escrituras incompletas, revocación y canje simultáneo.

Para revisar el flujo en el navegador:

```sh
npx firebase emulators:start --project demo-nimbus-market --only auth,firestore
```

En otra terminal, inicia un servidor estático local y abre `http://127.0.0.1:8770/?emulators=1`. El modo de emuladores solo se admite en `localhost` y `127.0.0.1`; utiliza cuentas ficticias. `node tests/seed-preview.mjs` prepara un código de prueba para `amiga@example.test`. Los enlaces de verificación aparecen en la terminal del emulador; no se envía correo real.

Sin `?emulators=1`, la aplicación conecta con Firebase real. Nunca uses datos reales en las pruebas.
