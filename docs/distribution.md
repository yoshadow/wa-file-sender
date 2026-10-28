# Preparación de distribución

Autor: **Isaac Avalos**. Versión candidata: **0.1.0-beta.1**. Plataformas objetivo: Windows 10/11 x64 y Ubuntu 24.04 x64.

El instalador Windows y el AppImage Linux se generaron y verificaron correctamente en la [ejecución 40624285147](https://github.com/yoshadow/wa-file-sender/actions/runs/40624285147), desde el commit `f3657589d9d0cf5067d3cfc16665f8efa768ac79`. Se reutilizarán esos mismos binarios para el borrador beta, sin volver a empaquetarlos. La publicación sigue pendiente de autorización.

El código original usa **GNU GPL versión 3 únicamente** (`GPL-3.0-only`), elegida por el autor. El texto íntegro está en `LICENSE` y los datos de autor en `NOTICE`; ambos se incluyen en los paquetes. Las dependencias conservan sus licencias.

## Archivos preparados

- `assets/icon.svg`: fuente del icono de carpeta y avión proporcionado por el autor.
- `assets/icon.png`: imagen de 512 × 512 para Linux y la ventana de Electron.
- `assets/icon.ico`: tamaños de 16 a 256 píxeles para Windows.
- `electron-builder.yml`: NSIS Windows y AppImage Linux, ambos x64, incluyendo el navegador correspondiente y SQLite.
- `.github/workflows/distribution.yml`: ejecución manual, separada de las comprobaciones habituales de CI.

Los comandos `npm run build:windows` y `npm run build:linux` se reservan para cuando se autorice empaquetar. Cada uno debe ejecutarse en su propio sistema; el navegador preparado pertenece a ese sistema y arquitectura. Nunca copiar `node_modules` ni el navegador de Linux a una compilación de Windows.

## Antes de ejecutar el flujo

1. Revisar los cambios y comprobar que no contienen datos privados. Subir código, assets, lockfile y configuración mediante commits revisados; no subir `node_modules`, cachés, documentos, contactos, sesiones, logs ni `dist`.
2. Integrar el workflow en la rama predeterminada para que GitHub muestre el botón **Run workflow**. Seleccionar la rama o referencia que se quiere preparar; su versión debe coincidir con el lockfile.
3. Comprobar que los metadatos y LICENSE mantienen la GPL v3 elegida. Revisar los avisos de las dependencias y la firma del instalador antes de publicar a usuarios. Al distribuir binarios, facilitar el código fuente correspondiente de esa versión bajo GPL v3, incluidos los cambios y archivos necesarios para generar esos binarios.
4. Autorizar expresamente el empaquetado. El flujo no se ejecuta por push, pull request ni creación de etiquetas.

## Ejecución manual futura

En GitHub, abrir **Actions → Preparar distribución (manual) → Run workflow**.

Con **Crear también una release beta en borrador** desmarcado, los jobs de Windows y Ubuntu instalan las dependencias, ejecutan las pruebas de código y escritorio, generan cada paquete y comprueban su runtime sin conectarse a WhatsApp. Guardan únicamente el `.exe` y el `.AppImage` como artefactos de Actions durante 14 días.

Con la opción marcada, después de completar los dos jobs se comprueba la licencia y se crea una release **draft** y **prerelease**. Se adjuntan ambos paquetes y `SHA256SUMS.txt`. El tag `v0.1.0-beta.1` identifica el commit seleccionado; si el tag no existe, GitHub lo crea al crear el borrador. Un tag existente debe apuntar al mismo commit. Una release existente no se sobrescribe.

Los jobs de compilación tienen permisos de lectura; solo el job opcional del borrador puede escribir releases. No se publican actualizaciones automáticas desde electron-builder ni se cambia `latest`.

## Revisión antes de publicar

Descargar los paquetes y comprobarlos en máquinas limpias, sin Node.js ni Chrome instalados. La verificación del runtime en Actions no sustituye la instalación real.

| Sistema                              | Estado actual                                                      |
| ------------------------------------ | ------------------------------------------------------------------ |
| Windows 11 x64                       | Prueba manual satisfactoria; compilación del sistema no registrada |
| Linux Mint 22.3 Cinnamon x64         | Prueba manual satisfactoria                                        |
| Windows 10 22H2 x64                  | Pendiente de probar el instalador                                  |
| Ubuntu 24.04 x64                     | Flujo desde código aprobado manualmente; AppImage pendiente        |
| Otras distribuciones o arquitecturas | Sin compatibilidad declarada                                       |

El 28 de octubre de 2026, Isaac Avalos confirmó el funcionamiento, el envío, la apertura del ZIP recibido y la recuperación de sesión en Windows 11 x64 y Linux Mint 22.3 Cinnamon de 64 bits. Este registro no da por comprobados los demás escenarios de la lista siguiente. Las notas bilingües de la beta están en `docs/release-notes.md`.

Comprobar instalación/apertura, icono, español e inglés, persistencia del idioma, QR y recuperación de sesión, CSV, archivos con acentos, mensaje, envío autorizado, pausas, detención, resultados inciertos, limpieza de temporales y un log por lote en la carpeta seleccionada. Revisar que el paquete no contiene sesiones ni documentos.

Registrar la versión exacta del sistema probada y los resultados en las notas de esa release. Los paquetes preparados inicialmente no están firmados; no se debe anunciar una firma o una compatibilidad que no se haya verificado.

Publicar el borrador será una acción posterior y explícita del autor. Los dos archivos **Source code** que GitHub añade automáticamente contienen código, no sustituyen los instaladores.
