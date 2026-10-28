# Logs de envío sin historial persistente

La aplicación ya no guarda un historial de operaciones en una base de datos. Conserva los resultados y la detección de duplicados solamente en memoria mientras está abierta. La sesión de WhatsApp sigue guardándose para poder recuperarla.

Al iniciar esta versión se eliminan las bases antiguas `operations.sqlite` y `viability.sqlite`, junto con sus archivos auxiliares. No se eliminan los archivos log, documentos ni la sesión de WhatsApp.

## Archivos generados

Se crea un único archivo `.log` nuevo por cada lote confirmado, antes de comenzar la espera, compresión o transmisión. Ese archivo reúne todos los contactos seleccionados, sus intentos, resultados y errores. Se guarda directamente en la carpeta principal seleccionada, junto a las subcarpetas de contactos. El nombre incluye fecha UTC y un identificador aleatorio, por ejemplo:

```text
Carpeta principal/
├── Ana Pérez/
├── López, Bruno/
└── WA-File-Sender_2026-10-21T18-30-00-000Z_identificador.log
```

Cerrar la revisión sin pulsar Confirmar y enviar no genera ningún log. Un lote de dos destinatarios genera un solo archivo, con los eventos identificados por lote, intento y teléfono. Si detienes durante la pausa, el mismo archivo registra la detención y señala los contactos no intentados. Un nuevo lote confirmado crea otro archivo; los archivos anteriores se conservan. Las pruebas internas automatizadas usan un transporte ficticio. La interfaz de uso normal solo permite enviar mediante WhatsApp.

Cada línea contiene un evento JSON en UTF-8 que se puede leer con un editor de texto. Incluye fecha, modo, cuenta emisora, destinatario, teléfono, nombres y tamaños de los archivos, huellas SHA-256, intervalo, mensaje adjunto, creación del ZIP, comienzo del envío, resultado e identificador de mensaje cuando existe. Los errores registran su código, fase y una descripción segura; también se registra la limpieza del temporal, un resumen final de todos los destinatarios y la revisión manual de un resultado incierto durante la sesión. El resumen distingue enviados, errores, inciertos y contactos no intentados.

No se incluyen contenidos de documentos, QR, credenciales, tokens, rutas privadas de sesión ni excepciones crudas. Los logs son texto sin cifrado añadido y contienen los datos del envío mencionados arriba. No se borran automáticamente ni se reutilizan para reconstruir el historial al abrir la aplicación.

## Errores e interrupciones

Si no se puede crear o actualizar el log, el lote se detiene. Antes de comenzar a transmitir se exige que el log esté escrito. Si el fallo ocurre después de iniciar el envío, el resultado puede ser incierto: comprueba el chat antes de repetir. Si no hay permisos o espacio, puede ser imposible registrar el propio error en el archivo; la aplicación lo informa en pantalla.

Un log con `envio_iniciado` sin resultado final debe tratarse como pendiente de revisión, por ejemplo tras cerrar el proceso inesperadamente. No hay reintentos ni reanudación automáticos. Enviado significa éxito del adaptador, sin garantizar entrega ni lectura.

Los duplicados y resultados inciertos se bloquean solamente durante la sesión actual. Después de cerrar y abrir, consulta los logs y el chat antes de reenviar. Se mantiene el intervalo configurado entre envíos durante la sesión y una espera inicial al usar WhatsApp después de abrir la aplicación.

## Prueba manual desde el código

1. Abre la aplicación con `npm start`; no se generan empaquetados. Los logs se generan sin mostrarse en la interfaz.
2. Selecciona un CSV y una carpeta con documentos ficticios. Marca un destinatario y vincula una cuenta y autoriza un envío a tu propio número.
3. Revisa la carpeta principal: debe aparecer un único `.log` con los eventos de todos los contactos del lote. Las subcarpetas y originales deben permanecer intactos.
4. Si un intento produce un resultado incierto, revisa su código en el log y comprueba el chat antes de repetirlo. Detén un lote durante la pausa: el log debe registrar la detención y mostrar al siguiente destinatario como no intentado.
5. Cierra y vuelve a abrir. Los resultados anteriores ya no aparecen en la aplicación; los archivos log permanecen en la carpeta principal. WhatsApp puede recuperar su sesión al reconectar.

Los resultados se mantienen en memoria durante la sesión; el log del lote es el registro persistente de operaciones.
