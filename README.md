# WA File Sender

[English](README.en.md)

Autor: **Isaac Avalos** · Candidata: **0.1.0-beta.1** · Licencia: [GPL v3](LICENSE) (`GPL-3.0-only`).

Aplicación de escritorio para preparar y enviar **un ZIP por contacto de WhatsApp**, con revisión previa y una pausa mínima de 10 segundos. Plataformas objetivo: Windows 10/11 x64 y Ubuntu 24.04 x64.

La interfaz y el QR se muestran en la ventana de Electron. WhatsApp utiliza un navegador administrado en segundo plano. La integración es no oficial y las pausas no garantizan evitar bloqueos.

## Uso

1. Vincula WhatsApp desde el panel izquierdo.
2. Descarga la plantilla vacía o importa un CSV UTF-8 con encabezados `nombre,telefono`. Incluye la lada internacional; el programa añade `+` si falta.
3. Selecciona la carpeta principal con una subcarpeta por contacto. Los nombres deben coincidir; se conservan los acentos y se ignoran mayúsculas y espacios exteriores.
4. Selecciona destinatarios y archivos, escribe un mensaje común opcional y ajusta la pausa.
5. Pulsa **Revisar envío**, comprueba el resumen y pulsa **Confirmar y enviar**.

La aplicación genera un ZIP temporal estándar, **sin cifrado ni contraseña**, por destinatario. Los originales permanecen intactos. Incluye solo archivos directos seleccionados, verifica sus huellas y admite hasta 20 MiB por ZIP. El mensaje opcional acompaña al ZIP como pie del documento.

Las filas muestran el progreso, la cuenta regresiva y el resultado. Los contactos enviados se desmarcan y sus casillas permanecen habilitadas. Un reenvío voluntario exige revisar las advertencias de duplicados. Ante errores o desconexiones se detiene el lote; no hay reintentos ni reanudación automáticos. Los resultados inciertos deben comprobarse en el chat. “Enviado” no garantiza entrega ni lectura.

El selector **Español | English** del panel izquierdo cambia el idioma sin reiniciar ni perder la selección. La preferencia se guarda para próximas aperturas. Los nombres, archivos, teléfonos y el mensaje para los destinatarios no se traducen; los encabezados CSV siguen siendo `nombre,telefono`.

Consulta la [guía de interfaz](docs/interface.md).

## Desarrollo

Requisitos: Node.js 24 y npm 11 o posterior. Linux requiere las bibliotecas de escritorio de Electron y una sesión gráfica.

```sh
npm ci
npm start
```

La instalación prepara Electron y el navegador local. Durante los ajustes actuales se ejecuta desde el código: **no se generan empaquetados**. Cierra la aplicación anterior antes de iniciar otra instancia.

```sh
npm run check
npm run test:desktop
```

Las pruebas automáticas usan perfiles temporales y clientes ficticios; no conectan una cuenta ni envían mensajes reales. Verifican CSV, selección, ZIP, logs, pausas, estados, seguridad y cierre. La prueba de escritorio también abre el navegador incluido en una página en blanco. En Linux sin pantalla se puede usar `xvfb-run -a npm run test:desktop`, conservando el sandbox.

CI ejecuta controles y pruebas de escritorio en Ubuntu 24.04 y Windows Server 2022. La compatibilidad con Windows 10/11 requiere comprobaciones manuales adicionales. Se conservan las herramientas de distribución para una etapa posterior, sin ejecutarlas en CI durante estos ajustes.

## Datos y control de versiones

Se guarda **un log por lote** con todos sus contactos en la carpeta principal seleccionada. Los resultados y la protección contra duplicados permanecen en memoria durante la sesión; no existe historial persistente de operaciones. La sesión de WhatsApp permanece en el directorio de usuario de Electron hasta desvincularla. No se añade cifrado propio a estos datos.

Nunca incluir documentos reales, CSV de contactos, sesiones, QR, ZIP temporales, bases ni logs en Git. Revisa los archivos antes de cada commit. Mantén `main` estable y revisa los cambios de cada etapa antes de integrarlos o distribuirlos.

La [guía de distribución](docs/distribution.md) explica el flujo manual de Windows/Linux y la futura release en borrador. Añadir el workflow no lo ejecuta ni publica paquetes.

Consulta la [arquitectura y decisiones](docs/development-plan.md) y la [documentación técnica de logs](docs/logs.md).

El código original se distribuye bajo GPL versión 3 únicamente. Las dependencias conservan sus propias licencias y avisos; consulta también [NOTICE](NOTICE).
