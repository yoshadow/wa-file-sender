# WA File Sender 0.1.0-beta.1

Author / Autor: Isaac Avalos.

## English

First distribution candidate with Spanish and English, CSV contact validation, one unencrypted ZIP per recipient, an optional common message, sequential WhatsApp sends with a minimum 10-second pause, stop controls and one log per batch.

**Draft for review; not published.** Manual testing reported by Isaac Avalos on October 28, 2026 confirmed application operation, sending, opening the received ZIP and session recovery on:

- Windows 11 x64 (OS build not recorded).
- Linux Mint 22.3 Cinnamon 64-bit.

Windows 10 and Ubuntu 24.04 package compatibility remain pending manual testing. Other distributions and architectures have not been verified. These results cover the checks listed above, not every application scenario. Packages are unsigned.

Both attached packages are the original artifacts from [distribution run 40624285147](https://github.com/yoshadow/wa-file-sender/actions/runs/40624285147), built from commit `f3657589d9d0cf5067d3cfc16665f8efa768ac79`. Automated checks passed on Windows and Linux. The version tag targets that source commit; the packages have not been rebuilt after manual testing.

The WhatsApp Web integration is unofficial. Pauses do not guarantee protection against account restrictions. Check uncertain results in the chat before repeating a send. CSV headers remain `nombre,telefono` in both languages; phone numbers require an international country code, with an optional `+`.

Download the Windows `.exe` installer or Linux `.AppImage` for your system. The automatically attached source archives are intended for developers. `SHA256SUMS.txt` identifies the attached binary files; a checksum is not a publisher signature.

## Español

Primera candidata de distribución con español e inglés, validación de contactos CSV, un ZIP sin cifrado por destinatario, mensaje común opcional, envíos secuenciales por WhatsApp con pausa mínima de 10 segundos, detención y un log por lote.

**Borrador para revisión; sin publicar.** Pruebas manuales reportadas por Isaac Avalos el 28 de octubre de 2026 confirmaron el funcionamiento de la aplicación, el envío, la apertura del ZIP recibido y la recuperación de sesión en:

- Windows 11 x64 (compilación del sistema no registrada).
- Linux Mint 22.3 Cinnamon de 64 bits.

La compatibilidad de los paquetes con Windows 10 y Ubuntu 24.04 sigue pendiente de prueba manual. Otras distribuciones y arquitecturas no se han verificado. Estos resultados cubren las comprobaciones mencionadas, no todos los escenarios de la aplicación. Los paquetes no están firmados.

Ambos paquetes adjuntos son los artefactos originales de la [ejecución de distribución 40624285147](https://github.com/yoshadow/wa-file-sender/actions/runs/40624285147), generados desde el commit `f3657589d9d0cf5067d3cfc16665f8efa768ac79`. Las comprobaciones automáticas pasaron en Windows y Linux. La etiqueta de versión apunta a ese código fuente; los paquetes no se volvieron a generar después de las pruebas manuales.

La integración con WhatsApp Web es no oficial. Las pausas no garantizan evitar restricciones de cuenta. Los resultados inciertos deben comprobarse en el chat antes de reenviar. Los encabezados CSV siguen siendo `nombre,telefono` en ambos idiomas; los teléfonos requieren lada internacional y el `+` es opcional.

Descarga el instalador `.exe` de Windows o el `.AppImage` de Linux según tu sistema. Los archivos de código fuente adjuntos automáticamente son para desarrolladores. `SHA256SUMS.txt` identifica los binarios adjuntos; una huella no es una firma del autor.
