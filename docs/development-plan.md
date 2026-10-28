# Arquitectura y decisiones actuales

## Módulos

- `src/main`: ventana Electron, diálogos, coordinación y validación de operaciones IPC.
- `src/preload`: acceso limitado a las operaciones admitidas; sin acceso genérico a archivos o credenciales.
- `src/renderer`: interfaz aislada con CSP, sandbox y Node deshabilitado.
- `src/domain`: validación de contactos, contratos de cola y errores seguros.
- `src/services`: contactos, asociación de carpetas, compresión, cola y coordinación de la sesión de WhatsApp.
- `src/adapters`: procesos auxiliares para CSV, ZIP y WhatsApp, navegador administrado y almacenamiento.
- `tests`: pruebas automáticas con datos ficticios y transporte controlado, sin envíos reales. El transporte simulado vive en `tests/helpers`; el transporte de producción solo admite WhatsApp.

Compresión, lectura de CSV y WhatsApp utilizan procesos auxiliares para no bloquear la interfaz. Se conservan los parches de compatibilidad de medios e identificadores de WhatsApp Web.

## Reglas de funcionamiento

CSV UTF-8 con BOM opcional, coma y encabezados `nombre,telefono`. Los teléfonos requieren lada internacional, sin inferir país; el signo `+` se añade si falta. La asociación usa nombres Unicode normalizados, sin espacios exteriores ni distinción de mayúsculas, conservando acentos. Los nombres ambiguos y teléfonos repetidos requieren corrección.

Solo se incluyen archivos directos de las subcarpetas inmediatas. Se excluyen enlaces simbólicos y rutas fuera de la raíz. La confirmación queda vinculada a la selección, cuenta, intervalo y mensaje. Cualquier cambio exige revisar de nuevo.

Los ZIP no llevan cifrado ni contraseña; conservan los nombres internos y no modifican originales. Se verifica SHA-256 sobre los bytes incorporados para detectar cambios. No se crean ZIP vacíos ni se dividen automáticamente. Límite: 20 MiB. Solo se genera el ZIP del contacto en curso, en temporales privados; se elimina al finalizar y se limpian restos propios al iniciar.

Los envíos son secuenciales, con pausa de 10 a 3600 segundos medida desde el final del anterior. La desconexión o el fallo detienen el lote. No hay reintentos ni reanudación automáticos. Detener no retira un documento ya transmitido.

Se genera un log por lote en la carpeta principal, con los resultados de todos los contactos. Los resultados y controles de duplicados usan SQLite en memoria durante la sesión. No hay historial persistente ni copia persistente del CSV. Un resultado incierto requiere revisar el chat y registrar una decisión explícita. Un reenvío voluntario requiere autorización y nueva confirmación. Los contactos enviados se desmarcan, con sus casillas habilitadas.

## Seguridad y validación

La sesión, los temporales y los logs no tienen cifrado añadido por la aplicación; se protegen mediante permisos locales. No registrar documentos, credenciales, QR ni excepciones sin filtrar. Los logs del lote incluyen los datos operativos previstos en su [documentación](logs.md) y deben permanecer fuera de Git.

Ejecutar `npm run check` y `npm run test:desktop` tras los cambios pertinentes. La automatización utiliza perfiles y documentos ficticios; los envíos reales requieren revisión y confirmación manual dentro de la aplicación.

## Próximos pasos

Continuar los ajustes una etapa a la vez, con demostración, pruebas y revisión del usuario. El empaquetado está aplazado por solicitud del usuario. Se mantienen sus herramientas para retomarlo cuando se autorice; no se ejecutan durante los ajustes actuales ni en CI.

Las plataformas objetivo siguen siendo Windows 10/11 x64 y Ubuntu 24.04 x64. Antes de distribuir, validar equipos limpios, navegador incluido, SQLite, firma y publicación.

La integración no oficial puede cambiar o provocar restricciones de cuenta; las pausas no garantizan evitarlas. Si deja de ser viable, evaluar preparación local con envío manual o un transporte basado en WhatsApp Business Platform.
