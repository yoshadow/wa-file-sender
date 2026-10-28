# WA File Sender

[English](README.en.md)

Autor: **Isaac Avalos** · Beta: **0.1.0-beta.1** · Licencia: [GPL v3](LICENSE) (`GPL-3.0-only`).

Aplicación de escritorio para preparar y enviar **un ZIP por contacto de WhatsApp**, con revisión previa y una pausa mínima de 10 segundos.

La interfaz y el QR se muestran en la ventana de Electron. WhatsApp utiliza un navegador administrado en segundo plano. La integración es no oficial y las pausas no garantizan evitar bloqueos.

## Descarga e instalación

La [beta 0.1.0-beta.1](https://github.com/yoshadow/wa-file-sender/releases/tag/v0.1.0-beta.1) está disponible para sistemas **x64**. No necesitas instalar Node.js, npm ni Chrome para usar los paquetes.

| Sistema         | Descarga                                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows x64     | [Instalador .exe](https://github.com/yoshadow/wa-file-sender/releases/download/v0.1.0-beta.1/WA-File-Sender-0.1.0-beta.1-windows-x64.exe)         |
| Linux x64       | [Aplicación .AppImage](https://github.com/yoshadow/wa-file-sender/releases/download/v0.1.0-beta.1/WA-File-Sender-0.1.0-beta.1-linux-x64.AppImage) |
| Huellas SHA-256 | [SHA256SUMS.txt](https://github.com/yoshadow/wa-file-sender/releases/download/v0.1.0-beta.1/SHA256SUMS.txt)                                       |

Los archivos **Source code** de la release contienen el código fuente; para instalar la aplicación utiliza el `.exe` o el `.AppImage`.

### Windows

1. Descarga el instalador `.exe` del enlace anterior.
2. Abre el archivo y sigue las instrucciones del instalador.
3. Inicia **WA File Sender** desde el menú Inicio.

### Linux

1. Descarga el archivo `.AppImage` y guárdalo en una carpeta donde quieras conservar la aplicación.
2. Abre una terminal en esa carpeta y permite su ejecución:

   ```sh
   chmod +x WA-File-Sender-0.1.0-beta.1-linux-x64.AppImage
   ```

3. Ábrelo con doble clic o desde esa terminal:

   ```sh
   ./WA-File-Sender-0.1.0-beta.1-linux-x64.AppImage
   ```

El AppImage se ejecuta directamente; no utiliza un asistente de instalación.

### Compatibilidad comprobada

Se confirmó manualmente el funcionamiento, el envío, la apertura del ZIP recibido y la recuperación de sesión en **Windows 11 x64** y **Linux Mint 22.3 Cinnamon de 64 bits**. Windows 10 y Ubuntu 24.04 siguen pendientes de prueba manual de los paquetes; otras distribuciones y arquitecturas no se han verificado.

Los paquetes de esta beta no están firmados y el sistema puede mostrar una advertencia de seguridad. Las huellas SHA-256 permiten comprobar la integridad de los archivos, pero no sustituyen una firma del autor.

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

La instalación de dependencias prepara Electron y el navegador local para ejecutar desde el código fuente. Cierra la aplicación anterior antes de iniciar otra instancia.

```sh
npm run check
npm run test:desktop
```

Las pruebas automáticas usan perfiles temporales y clientes ficticios; no conectan una cuenta ni envían mensajes reales. Verifican CSV, selección, ZIP, logs, pausas, estados, seguridad y cierre. La prueba de escritorio también abre el navegador incluido en una página en blanco. En Linux sin pantalla se puede usar `xvfb-run -a npm run test:desktop`, conservando el sandbox.

CI ejecuta controles y pruebas de escritorio en Ubuntu 24.04 y Windows Server 2022. La generación de paquetes se ejecuta por separado mediante el workflow manual de distribución; no se inicia con cada push o pull request. Las pruebas de CI no sustituyen las pruebas manuales de los paquetes.

## Datos y control de versiones

Se guarda **un log por lote** con todos sus contactos en la carpeta principal seleccionada. Los resultados y la protección contra duplicados permanecen en memoria durante la sesión; no existe historial persistente de operaciones. La sesión de WhatsApp permanece en el directorio de usuario de Electron hasta desvincularla. No se añade cifrado propio a estos datos.

Nunca incluir documentos reales, CSV de contactos, sesiones, QR, ZIP temporales, bases ni logs en Git. Revisa los archivos antes de cada commit. Mantén `main` estable y revisa los cambios de cada etapa antes de integrarlos o distribuirlos.

La [guía de distribución](docs/distribution.md) explica el flujo manual de Windows/Linux y la preparación de releases en borrador. El workflow no publica releases automáticamente. Consulta las [notas de la beta publicada](https://github.com/yoshadow/wa-file-sender/releases/tag/v0.1.0-beta.1) para los resultados de esta versión.

Consulta la [arquitectura y decisiones](docs/development-plan.md) y la [documentación técnica de logs](docs/logs.md).

El código original se distribuye bajo GPL versión 3 únicamente. Las dependencias conservan sus propias licencias y avisos; consulta también [NOTICE](NOTICE).
