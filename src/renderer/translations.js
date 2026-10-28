'use strict';
// Shared, explicit catalog: interpolation values are never translated or treated as HTML.
(function (root) {
  const english = Object.freeze({
    'No se pudo validar el CSV. Revisa el formato del archivo.':
      'Could not validate the CSV. Check the file format.',
    'La validación del CSV tardó demasiado. Divide el archivo y vuelve a intentar.':
      'CSV validation timed out. Split the file and try again.',
    'La validación del CSV se interrumpió. Vuelve a seleccionar el archivo.':
      'CSV validation was interrupted. Select the file again.',
    'No se pudo guardar la información del envío en la carpeta principal. Revisa sus permisos y el espacio disponible. El lote se detuvo; comprueba el chat antes de repetir un envío iniciado.':
      'Could not save the sending information in the main folder. Check its permissions and available space. The batch stopped; check the chat before repeating an attempted send.',
    'ZIP sin cifrado ni contraseña. Enviado no garantiza entrega ni lectura. Un envío iniciado sin resultado final debe revisarse en el chat; no se reintenta automáticamente.':
      'ZIP without encryption or a password. Sent does not guarantee delivery or reading. An attempted send without a final result must be checked in the chat; it will not be retried automatically.',
    'El resultado ya no está pendiente de revisión.':
      'This result no longer needs review.',
    'La operación de WhatsApp no pudo completarse.':
      'The WhatsApp operation could not be completed.',
    'El proceso de WhatsApp se detuvo.': 'The WhatsApp process stopped.',
    'No se pudo iniciar el proceso de WhatsApp.':
      'Could not start the WhatsApp process.',
    'WhatsApp no está iniciado.': 'WhatsApp has not been started.',
    'WhatsApp no respondió a tiempo.': 'WhatsApp did not respond in time.',
    'Los archivos cambiaron o ya no coinciden con la revisión. Vuelve a seleccionar la carpeta y revisarlos.':
      'The files changed or no longer match the review. Select the folder and review them again.',
    'La ruta dejó de ser segura o contiene enlaces. Vuelve a revisar la carpeta.':
      'The path is no longer safe or contains links. Review the folder again.',
    'Hay nombres de archivo incompatibles o ambiguos para un ZIP multiplataforma. Quita esos archivos de la selección.':
      'Some file names are incompatible or ambiguous for a cross-platform ZIP. Remove those files from the selection.',
    'Selecciona al menos un archivo válido del destinatario.':
      'Select at least one valid file for this recipient.',
    'El ZIP supera el límite de 20 MiB. Reduce la selección y vuelve a revisar.':
      'The ZIP exceeds the 20 MiB limit. Reduce the selection and review it again.',
    'No hay espacio suficiente para el ZIP temporal. Libera espacio y vuelve a revisar.':
      'There is not enough space for the temporary ZIP. Free up space and review again.',
    'No se pudo eliminar el ZIP temporal. Cierra los archivos abiertos y pulsa Eliminar temporal antes de continuar.':
      'Could not delete the temporary ZIP. Close any open files and restart the application before continuing.',
    'Operación cancelada. No se creó un ZIP utilizable.':
      'Operation cancelled. No usable ZIP was created.',
    'No se pudo leer o comprimir la selección. Revisa los permisos y vuelve a revisar los archivos.':
      'Could not read or compress the selection. Check permissions and review the files again.',
    'Introduce un teléfono con lada internacional. El signo + es opcional.':
      'Enter a phone number with its international country code. The + sign is optional.',
    'El teléfono internacional no es válido.':
      'The international phone number is invalid.',
    'El nombre está vacío.': 'The name is empty.',
    'El nombre supera los 200 caracteres.': 'The name exceeds 200 characters.',
    'El nombre contiene saltos de línea o caracteres de control.':
      'The name contains line breaks or control characters.',
    'El mensaje debe ser texto de hasta {0} caracteres.':
      'The message must be text of up to {0} characters.',
    'Solicitud de cola no válida.': 'Invalid queue request.',
    'Revisa los datos del envío y usa una pausa entre 10 y 3600 segundos.':
      'Check the sending details and use a pause between 10 and 3600 seconds.',
    'La revisión del lote no es válida.': 'The batch review is invalid.',
    'La revisión del resultado no es válida.': 'The result review is invalid.',
    'WhatsApp Web rechazó el identificador interno del archivo adjunto.':
      "WhatsApp Web rejected the attachment's internal identifier.",
    'No se pudo crear el ZIP temporal de prueba.':
      'Could not create the temporary ZIP.',
    'El ZIP temporal cambió o ya no coincide con el aprobado.':
      'The temporary ZIP changed or no longer matches the approved file.',
    'El ZIP temporal no está en una ruta propia y segura de la aplicación.':
      'The temporary ZIP is not in a safe application-owned location.',
    'No se pudo leer el ZIP temporal aprobado.':
      'Could not read the approved temporary ZIP.',
    'El mensaje no es válido. Vuelve a revisar el envío.':
      'The message is invalid. Review the send again.',
    'No se pudo resolver el destinatario en WhatsApp.':
      'Could not resolve the recipient in WhatsApp.',
    'La conexión o la cuenta de WhatsApp cambió.':
      'The WhatsApp connection or account changed.',
    'Se perdió la conexión con el navegador de WhatsApp.':
      'The connection to the WhatsApp browser was lost.',
    'WhatsApp Web no devolvió un identificador del mensaje.':
      'WhatsApp Web did not return a message identifier.',
    'WhatsApp no respondió dentro del tiempo permitido.':
      'WhatsApp did not respond within the time limit.',
    'La integración con WhatsApp Web no pudo completar la prueba.':
      'The WhatsApp Web integration could not complete the operation.',
    'Seleccionar contactos CSV': 'Select contacts CSV',
    'Seleccionar carpeta principal': 'Select main folder',
    'Espera a que termine la operación actual.':
      'Wait for the current operation to finish.',
    'No se pudo completar la operación. Cierra la aplicación y revisa la sesión antes de reintentar.':
      'Could not complete the operation. Close the application and check the session before trying again.',
    'Espera a que termine el guardado de la plantilla.':
      'Wait for the template to finish saving.',
    'Guardar plantilla de contactos': 'Save contacts template',
    'No se pudo guardar la plantilla. Revisa los permisos de la carpeta e inténtalo de nuevo.':
      'Could not save the template. Check folder permissions and try again.',
    'Espera a que termine la importación del CSV.':
      'Wait for the CSV import to finish.',
    'El envío debe realizarse mediante WhatsApp. Revisa la selección antes de continuar.':
      'Files must be sent through WhatsApp. Review the selection before continuing.',
    'Espera a que termine la operación de WhatsApp.':
      'Wait for the WhatsApp operation to finish.',
    'Hay conjuntos ya enviados por WhatsApp a estos destinatarios.':
      'Some file sets have already been sent to these recipients through WhatsApp.',
    'Repetir requiere autorización adicional y una nueva confirmación del lote. Revisa las coincidencias que aparecen en la vista previa.':
      'Repeating requires additional authorization and a new batch confirmation. Review the matches shown in the preview.',
    'Autorizar reenvío': 'Authorize resend',
    'Hay archivos ya enviados por WhatsApp dentro de conjuntos distintos.':
      'Some files have already been sent through WhatsApp as part of different sets.',
    'Revisa los archivos repetidos en el lote. Confirma explícitamente su inclusión antes de la confirmación final.':
      'Review the repeated files in the batch. Explicitly confirm their inclusion before the final confirmation.',
    'Incluir archivos repetidos': 'Include repeated files',
    '¿Registrar tu revisión del chat de WhatsApp?':
      'Record your review of the WhatsApp chat?',
    'Cuenta: {0}\nDestinatario: {1}\nResultado revisado: {2}\nSe conserva el intento original y se registra esta decisión. No se reanudará ningún lote.':
      'Account: {0}\nRecipient: {1}\nReviewed result: {2}\nThe original attempt is retained and this decision is recorded. No batch will resume.',
    'Comprobaste en el chat que se envió':
      'You checked the chat and confirmed it was sent',
    'Comprobaste en el chat que no se envió':
      'You checked the chat and confirmed it was not sent',
    'Registrar revisión': 'Record review',
    '¿Desvincular y eliminar la sesión local?':
      'Unlink and delete the local session?',
    'Se intentará cerrar la sesión en WhatsApp y se eliminarán sus datos locales. Si WhatsApp no responde, también puedes revocar el dispositivo desde tu teléfono.':
      'The application will try to log out of WhatsApp and delete its local session data. If WhatsApp does not respond, you can also revoke the device from your phone.',
    Desvincular: 'Unlink',
    'No se pudo completar la limpieza del ZIP temporal.':
      'Could not complete temporary ZIP cleanup.',
    'Se volverá a intentar la limpieza al iniciar. Cierra los archivos abiertos antes de volver a usar la compresión.':
      'Cleanup will be attempted again at startup. Close any open files before using compression again.',
    'No se pudo iniciar WA File Sender.': 'Could not start WA File Sender.',
    'Archivo: {0}': 'File: {0}',
    'Sin CSV seleccionado.': 'No CSV selected.',
    '{0} válidos · {1} necesitan revisión.': '{0} valid · {1} need review.',
    '{0} contactos importados.': '{0} contacts imported.',
    'No se importaron contactos. Corrige el archivo y vuelve a seleccionarlo.':
      'No contacts were imported. Correct the file and select it again.',
    'Selecciona un CSV para revisar los contactos. No se enviarán mensajes.':
      'Select a CSV to review contacts. No messages will be sent.',
    'El CSV necesita revisión': 'The CSV needs review',
    '{0} contactos necesitan revisión': '{0} contacts need review',
    'Revisar contactos del CSV': 'Review CSV contacts',
    'Línea {0}: ': 'Line {0}: ',
    Válido: 'Valid',
    'No hay contactos para este filtro.': 'No contacts match this filter.',
    'Página {0} de {1} · {2} contactos': 'Page {0} of {1} · {2} contacts',
    'Leyendo y validando contactos…': 'Reading and validating contacts…',
    'Selección cancelada. Se conservaron los datos anteriores.':
      'Selection cancelled. The previous data was kept.',
    'No se pudo importar el CSV. Revisa el archivo y vuelve a intentarlo.':
      'Could not import the CSV. Check the file and try again.',
    'No se pudo guardar la plantilla. Inténtalo de nuevo.':
      'Could not save the template. Try again.',
    'Iniciando WhatsApp…': 'Starting WhatsApp…',
    'Esperando escaneo del QR': 'Waiting for QR scan',
    'Preparando WhatsApp…': 'Preparing WhatsApp…',
    'La sesión requiere revisión': 'The session needs review',
    'La aplicación detuvo la conexión tras el error de envío. La sesión guardada no se borró. Revisa el chat antes de reconectar; no hay reintentos automáticos.':
      'The application stopped the connection after a sending error. The saved session was kept. Check the chat before reconnecting; there are no automatic retries.',
    'WhatsApp rechazó la sesión. Desvincula y vuelve a escanear el QR.':
      'WhatsApp rejected the session. Unlink and scan the QR code again.',
    'El sistema impidió iniciar el sandbox de Chrome. Revisa la configuración del sistema sin desactivar el sandbox.':
      "The system prevented Chrome's sandbox from starting. Check system settings without disabling the sandbox.",
    'No se pudo iniciar el navegador incluido. Revisa los requisitos de Chrome para este equipo.':
      "Could not start the included browser. Check Chrome's requirements for this computer.",
    'WhatsApp no respondió a tiempo. Revisa Internet y vuelve a conectar.':
      'WhatsApp did not respond in time. Check your Internet connection and reconnect.',
    'La integración no pudo inicializarse. Puede haber un cambio en WhatsApp Web o una incompatibilidad de la biblioteca.':
      'The integration could not initialize. WhatsApp Web may have changed or the library may be incompatible.',
    'Conexión detenida por precaución': 'Connection stopped as a precaution',
    'Sesión no disponible': 'Session unavailable',
    'Cuenta: {0}': 'Account: {0}',
    'No se pudo completar la conexión. Revisa Internet y la sesión. Puedes desvincular y volver a escanear el QR.':
      'Could not complete the connection. Check your Internet connection and session. You can unlink and scan the QR code again.',
    'Cuenta lista para enviar.': 'Account ready to send.',
    'Vincular con QR': 'Link with QR',
    'No se pudo consultar la aplicación. Cierra la ventana y vuelve a abrirla.':
      'Could not query the application. Close the window and open it again.',
    'No se pudo completar la operación. Revisa la sesión antes de reintentar.':
      'Could not complete the operation. Check the session before trying again.',
    'Cerrando la sesión local y la aplicación…':
      'Closing the local session and application…',
    'Utiliza el control de cierre de la ventana.':
      "Use the window's close button.",
    'Abre WA File Sender como aplicación de escritorio. Este HTML no funciona por separado en el navegador.':
      'Open WA File Sender as a desktop application. This HTML does not work on its own in a browser.',
    'Aplicación de escritorio lista.': 'Desktop application ready.',
    'No se pudo iniciar la aplicación. Cierra la ventana e inténtalo de nuevo.':
      'Could not start the application. Close the window and try again.',
    'Preparando ZIP': 'Preparing ZIP',
    Enviando: 'Sending',
    Enviado: 'Sent',
    Error: 'Error',
    Detenido: 'Stopped',
    'Comprobando número': 'Checking number',
    'Necesita revisión': 'Needs review',
    'Sin carpeta': 'No folder',
    Pendiente: 'Pending',
    'No enviado': 'Not sent',
    'Sin seleccionar': 'Not selected',
    'Comprueba el chat antes de repetir. ¿Se recibió este envío?':
      'Check the chat before repeating. Was this send received?',
    'Sí, se envió': 'Yes, it was sent',
    'No se envió': 'It was not sent',
    'No se pudo completar el envío. Revisa el número, los archivos y la conexión antes de volver a intentarlo.':
      'Could not complete the send. Check the number, files and connection before trying again.',
    'Sin carpeta seleccionada.': 'No folder selected.',
    'Revisando selección…': 'Reviewing selection…',
    '{0} destinatarios necesitan revisión.': '{0} recipients need review.',
    '{0} destinatarios disponibles.': '{0} recipients available.',
    'Selecciona la carpeta principal para ver los documentos.':
      'Select the main folder to view documents.',
    'Selecciona un CSV para comenzar.': 'Select a CSV to get started.',
    '{0} destinatarios · {1} archivos · {2} sin comprimir':
      '{0} recipients · {1} files · {2} uncompressed',
    'Seleccionar {0}': 'Select {0}',
    'Teléfono no disponible': 'Phone unavailable',
    '{0} de {1} · {2}': '{0} of {1} · {2}',
    'Carpeta: {0}': 'Folder: {0}',
    'Sin asociación': 'No match',
    'El ZIP debe ocupar como máximo 20 MiB. El tamaño final se comprobará antes de enviar.':
      'The ZIP must be no larger than 20 MiB. Its final size will be checked before sending.',
    Anteriores: 'Previous files',
    'Más archivos': 'More files',
    'No hay destinatarios para este filtro.':
      'No recipients match this filter.',
    'Los destinatarios aparecerán aquí al seleccionar sus carpetas.':
      'Recipients will appear here when you select their folders.',
    'Página {0} de {1}': 'Page {0} of {1}',
    'Selección cancelada. Se conservó la revisión anterior.':
      'Selection cancelled. The previous review was kept.',
    'No se pudo actualizar la revisión. Vuelve a seleccionar la carpeta.':
      'Could not update the review. Select the folder again.',
    'No se pudo consultar la vista previa.': 'Could not retrieve the preview.',
    'Selecciona los destinatarios y revisa el envío.':
      'Select recipients and review the send.',
    'Revisando los archivos seleccionados…': 'Reviewing selected files…',
    'Revisa los destinatarios y archivos antes de confirmar.':
      'Review recipients and files before confirming.',
    'Esperando confirmación…': 'Waiting for confirmation…',
    'Iniciando envío…': 'Starting send…',
    'Preparando el ZIP del destinatario…': "Preparing the recipient's ZIP…",
    'Comprobando el número de WhatsApp…': 'Checking the WhatsApp number…',
    'Enviando. Un archivo ya transmitido no puede retirarse.':
      'Sending. A file already transmitted cannot be withdrawn.',
    'Esperando la pausa entre envíos…': 'Waiting between sends…',
    'Envío completado.': 'Sending completed.',
    'Envío detenido. Revisa la selección antes de continuar.':
      'Sending stopped. Review the selection before continuing.',
    'El envío se detuvo por un error.': 'Sending stopped because of an error.',
    'Comprueba el chat antes de repetir este envío.':
      'Check the chat before repeating this send.',
    'Revisar envío': 'Review send',
    'Usa una pausa de entre 10 y 3600 segundos.':
      'Use a pause between 10 and 3600 seconds.',
    'La selección o el mensaje cambió. Vuelve a revisar el envío.':
      'The selection or message changed. Review the send again.',
    'Revisa el estado del envío.': 'Check the sending status.',
    '{0} de {1} destinatarios completados{2}':
      '{0} of {1} recipients completed{2}',
    'Cuenta: +{0} · {1} destinatarios · Pausa: {2} segundos':
      'Account: +{0} · {1} recipients · Pause: {2} seconds',
    '{0} · {1} archivos': '{0} · {1} files',
    'Hay un resultado incierto. Cierra esta revisión y comprueba el chat desde la fila del destinatario.':
      "There is an uncertain result. Close this review and check the chat from the recipient's row.",
    'Este conjunto ya fue enviado durante esta sesión. Reenviarlo requerirá una autorización adicional.':
      'This set was already sent during this session. Resending it requires additional authorization.',
    'Archivos enviados anteriormente: {0}. Su inclusión requiere autorización.':
      'Previously sent files: {0}. Including them requires authorization.',
    'Ver archivos incluidos': 'View included files',
    '{0} de {1}': '{0} of {1}',
    'No se pudo completar el envío. Revisa la conexión y el chat antes de repetir.':
      'Could not complete the send. Check the connection and chat before repeating.',
    'Selecciona un archivo CSV regular.': 'Select a regular CSV file.',
    'El CSV supera el límite de 5 MiB.': 'The CSV exceeds the 5 MiB limit.',
    'Hay una importación de contactos en curso.':
      'A contact import is in progress.',
    'Selecciona un archivo con extensión .csv.':
      'Select a file with the .csv extension.',
    'No se pudo leer o validar el CSV. Revisa los permisos y vuelve a seleccionarlo.':
      'Could not read or validate the CSV. Check permissions and select it again.',
    'Espera a que termine la importación para quitar los contactos.':
      'Wait for the import to finish before removing contacts.',
    'Exporta el archivo como CSV UTF-8. No se pudo leer su codificación.':
      'Export the file as CSV UTF-8. Its encoding could not be read.',
    'Un registro del CSV es demasiado largo (límite: 16 KiB de caracteres).':
      'A CSV record is too long (limit: 16 KiB of characters).',
    'El CSV tiene comillas o separadores mal formados. Corrige el archivo y vuelve a importarlo.':
      'The CSV contains malformed quotes or separators. Correct the file and import it again.',
    'El CSV está vacío. Incluye nombre,telefono y al menos un contacto.':
      'The CSV is empty. Include nombre,telefono and at least one contact.',
    'El CSV tiene encabezados pero no contiene contactos.':
      'The CSV has headers but contains no contacts.',
    'El CSV supera el límite de 10 000 contactos. Divide el archivo.':
      'The CSV exceeds the limit of 10,000 contacts. Split the file.',
    'La fila debe contener exactamente dos campos.':
      'The row must contain exactly two fields.',
    'El teléfono está vacío.': 'The phone number is empty.',
    'Teléfono inválido: incluye la lada internacional y todos los dígitos, sin extensiones ni notación científica. El + es opcional.':
      'Invalid phone: include the international country code and all digits, without extensions or scientific notation. The + is optional.',
    'Teléfono repetido: corrige todas las filas que comparten ese número.':
      'Repeated phone: correct all rows sharing that number.',
    'La selección no es válida.': 'The selection is invalid.',
    'Espera a que termine la revisión de carpetas.':
      'Wait for the folder review to finish.',
    'Importa primero un CSV con al menos un contacto válido.':
      'First import a CSV with at least one valid contact.',
    'No se pudo revisar la carpeta. Revisa los permisos y vuelve a seleccionarla.':
      'Could not review the folder. Check permissions and select it again.',
    'Nombre de carpeta inválido.': 'Invalid folder name.',
    'Carpeta sin contacto en el CSV.': 'Folder without a matching CSV contact.',
    'El contacto tiene errores en el CSV.':
      'The contact has errors in the CSV.',
    'Carpeta vacía.': 'Empty folder.',
    'No hay archivos directos legibles para seleccionar.':
      'There are no readable direct files to select.',
    'Contacto inválido y sin carpeta asociada.':
      'Invalid contact without a matching folder.',
    'La vista previa cambió. Revisa la selección actual.':
      'The preview changed. Review the current selection.',
    'Este elemento no es válido para seleccionar.':
      'This item cannot be selected.',
    'El archivo está excluido.': 'The file is excluded.',
    'La selección cambió. Revisa los archivos actuales.':
      'The selection changed. Review the current files.',
    'Marca al menos un archivo de un destinatario válido.':
      'Select at least one file for a valid recipient.',
    'La selección cambió. Revisa de nuevo el lote.':
      'The selection changed. Review the batch again.',
    'Marca archivos de al menos un destinatario.':
      'Select files for at least one recipient.',
    'Selecciona una carpeta principal real, sin enlaces simbólicos.':
      'Select a real main folder without symbolic links.',
    'La carpeta supera las 10 000 entradas. Divide el contenido y vuelve a revisar.':
      'The folder exceeds 10,000 entries. Split the contents and review again.',
    'Enlace simbólico excluido.': 'Symbolic link excluded.',
    'La carpeta supera las 1 000 subcarpetas. Divide el contenido y vuelve a revisar.':
      'The folder exceeds 1,000 subfolders. Split the contents and review again.',
    'Nombre de archivo no compatible con una revisión segura.':
      'File name incompatible with a safe review.',
    'Archivo ilegible, modificado durante la revisión o ruta excluida.':
      'File unreadable, changed during review, or excluded path.',
    'No se pudo revisar la carpeta de forma segura. Revisa sus permisos y vuelve a analizar.':
      'Could not safely review the folder. Check permissions and scan again.',
    'La carpeta principal cambió durante la revisión. Vuelve a seleccionarla.':
      'The main folder changed during review. Select it again.',
    'Detén el lote y espera a que termine la operación en curso.':
      'Stop the batch and wait for the current operation to finish.',
    'La cuenta o el transporte cambió. Vuelve a revisar el lote.':
      'The account or transport changed. Review the batch again.',
    'El transporte no está disponible.': 'The transport is unavailable.',
    'La cuenta o la conexión de WhatsApp cambió. Vuelve a vincular y revisar el lote.':
      'The WhatsApp account or connection changed. Link again and review the batch.',
    'No se pudo revisar el lote. Revisa la carpeta y vuelve a intentar.':
      'Could not review the batch. Check the folder and try again.',
    'Revisa de nuevo el lote antes de confirmarlo.':
      'Review the batch again before confirming.',
    'Hay un resultado incierto pendiente para este destinatario. Revisa el chat y el resultado del destinatario antes de continuar.':
      "There is an uncertain result for this recipient. Check the chat and the recipient's result before continuing.",
    'No se pudo registrar o confirmar el lote. No se inició ningún envío.':
      'Could not record or confirm the batch. No send was started.',
    'La sesión cambió durante la confirmación. Vuelve a revisar el lote.':
      'The session changed during confirmation. Review the batch again.',
    'WhatsApp se desconectó o cambió de cuenta. El lote se detuvo antes de enviar este ZIP.':
      'WhatsApp disconnected or changed accounts. The batch stopped before sending this ZIP.',
    'Resultado incierto. Revisa el chat antes de repetir; no hay reintentos automáticos.':
      'Uncertain result. Check the chat before repeating; there are no automatic retries.',
    'Resultado incierto simulado. Revisa el resultado; no se reintentará automáticamente.':
      'Simulated uncertain result. Check the result; there will be no automatic retry.',
    'Lote detenido. No se inició el siguiente envío.':
      'Batch stopped. The next send was not started.',
    'El lote se detuvo antes de enviar este ZIP.':
      'The batch stopped before sending this ZIP.',
    ' Código: {0}.': ' Code: {0}.',
    ' No se pudo guardar toda la información del envío. Revisa sus permisos y el espacio disponible.':
      ' Could not save all sending information. Check permissions and available space.',
    'Lote detenido. Revisa y confirma un nuevo lote para continuar.':
      'Batch stopped. Review and confirm a new batch to continue.',
    'WhatsApp se desconectó o cambió de cuenta. El lote se detuvo; revisa la sesión y el chat antes de volver a confirmar.':
      'WhatsApp disconnected or changed accounts. The batch stopped; check the session and chat before confirming again.',
    'No se pudo continuar el lote. Revisa el chat antes de repetir.':
      'Could not continue the batch. Check the chat before repeating.',
    'No se pudo registrar el resultado de esta sesión. Revisa el chat antes de repetir.':
      'Could not record the result for this session. Check the chat before repeating.',
    'Detención solicitada. No puede retirarse un envío ya iniciado; no se iniciará el siguiente.':
      'Stop requested. A send already started cannot be withdrawn; the next one will not start.',
    'El resultado ya no está pendiente.': 'This result is no longer pending.',
    'Revisión registrada. No se reanudó ningún lote.':
      'Review recorded. No batch was resumed.',
    'La sesión cambió. Vincula WhatsApp y vuelve a revisar el lote.':
      'The session changed. Link WhatsApp and review the batch again.',
    'Hay una operación en curso. Espera a que termine.':
      'An operation is in progress. Wait for it to finish.',
    'No se pudo iniciar WhatsApp. Revisa la conexión y los requisitos del navegador.':
      'Could not start WhatsApp. Check the connection and browser requirements.',
    'Sesión local eliminada. Verifica y revoca también este dispositivo desde WhatsApp en tu teléfono.':
      'Local session deleted. Also check and revoke this device from WhatsApp on your phone.',
    'Sesión desvinculada y eliminada de este equipo.':
      'Session unlinked and deleted from this computer.',
    'Esta operación no acepta argumentos.':
      'This operation does not accept arguments.',
    'Estado de la aplicación': 'Application status',
    'Tus documentos, organizados por destinatario.':
      'Your documents, organized by recipient.',
    'Vincular WhatsApp': 'Link WhatsApp',
    'WhatsApp sin vincular': 'WhatsApp not linked',
    'En tu teléfono abre WhatsApp → Dispositivos vinculados → Vincular un dispositivo.':
      'On your phone, open WhatsApp → Linked devices → Link a device.',
    'Código QR para vincular WhatsApp': 'QR code to link WhatsApp',
    'Escanea este QR desde WhatsApp. Se actualizará cuando sea necesario. No lo compartas.':
      'Scan this QR code from WhatsApp. It will refresh when needed. Do not share it.',
    'Preparando la sesión…': 'Preparing session…',
    'La sesión permanece en este equipo. Puedes eliminarla con Desvincular.':
      'The session stays on this computer. Use Unlink to remove it.',
    Idioma: 'Language',
    'Cerrar aplicación': 'Close application',
    'Cargando información…': 'Loading information…',
    'Enviar archivos': 'Send files',
    'Selecciona tus contactos y documentos. Enviaremos un ZIP por destinatario.':
      'Select your contacts and documents. We will send one ZIP per recipient.',
    'Cómo funciona': 'How it works',
    'Importa un CSV UTF-8 con las columnas':
      'Import a UTF-8 CSV with the columns',
    '. Incluye la lada internacional en los teléfonos; el + se añade automáticamente si falta. Cada subcarpeta debe coincidir con el nombre de un contacto. Se incluyen solo archivos directos; los originales permanecen intactos.':
      ". Include the international country code in phone numbers; + is added automatically if missing. Each subfolder must match a contact's name. Only direct files are included; originals remain intact.",
    'El ZIP se crea automáticamente, sin contraseña, con un límite de 20 MiB. Revisa cada número y confirma antes de enviar. Utiliza destinatarios que hayan autorizado recibir los documentos. La integración es no oficial y las pausas no garantizan evitar bloqueos.':
      'The ZIP is created automatically without a password, with a 20 MiB limit. Review every number and confirm before sending. Only send to recipients who have agreed to receive the documents. The integration is unofficial and pauses do not guarantee protection against account restrictions.',
    'Preparación del envío': 'Send preparation',
    '1. Contactos': '1. Contacts',
    'Seleccionar CSV': 'Select CSV',
    Quitar: 'Remove',
    'Descargar plantilla': 'Download template',
    'Incluye la lada internacional:': 'Include the international country code:',
    'para México. El programa agrega': 'for Mexico. The application adds',
    'si falta.': 'if missing.',
    'Preparando importación…': 'Preparing import…',
    '2. Documentos': '2. Documents',
    'Seleccionar carpeta': 'Select folder',
    '3. Mensaje': '3. Message',
    '(opcional)': '(optional)',
    'Escribe el mensaje que acompañará a los archivos…':
      'Write the message to send with the files…',
    'Se enviará con cada ZIP. El mismo texto para todos.':
      'Sent with each ZIP. The same text for everyone.',
    '4. Pausa entre envíos': '4. Pause between sends',
    segundos: 'seconds',
    'Mínimo 10 segundos.': 'Minimum 10 seconds.',
    'Mostrar contactos': 'Show contacts',
    Todos: 'All',
    'Con errores': 'With errors',
    Válidos: 'Valid',
    'Validación del CSV': 'CSV validation',
    'Contactos importados': 'Imported contacts',
    Línea: 'Line',
    Nombre: 'Name',
    'Teléfono CSV': 'CSV phone',
    Normalizado: 'Normalized',
    Validación: 'Validation',
    Anterior: 'Previous',
    Siguiente: 'Next',
    Destinatarios: 'Recipients',
    'Importa contactos para comenzar.': 'Import contacts to get started.',
    'Mostrar destinatarios': 'Show recipients',
    Disponibles: 'Available',
    'Necesitan revisión': 'Need review',
    Seleccionados: 'Selected',
    'Destinatarios y archivos': 'Recipients and files',
    'Destinatario / Teléfono': 'Recipient / Phone',
    'Archivos seleccionados': 'Selected files',
    'Estado / Espera': 'Status / Wait',
    'Elementos excluidos de la carpeta principal':
      'Excluded items in the main folder',
    'Estado y acciones del envío': 'Sending status and actions',
    'Envío completado': 'Sending completed',
    'Detener envío': 'Stop sending',
    'Comprobando la aplicación…': 'Checking application…',
    'Cerrar revisión': 'Close review',
    Cerrar: 'Close',
    'Comprueba los teléfonos y archivos. Se creará un ZIP sin contraseña por destinatario.':
      'Check phone numbers and files. One ZIP without a password will be created per recipient.',
    'Mensaje para todos los destinatarios': 'Message for all recipients',
    'Volver a la selección': 'Back to selection',
    'Confirmar y enviar': 'Confirm and send',
    'Guardado cancelado.': 'Save cancelled.',
    'Plantilla guardada.': 'Template saved.',
    'WhatsApp vinculado': 'WhatsApp linked',
    'WhatsApp desconectado': 'WhatsApp disconnected',
    'Reconectar WhatsApp': 'Reconnect WhatsApp',
    'En espera': 'Waiting',
    'Contacto sin nombre': 'Unnamed contact',
    destinatario: 'recipient',
    'Revisando…': 'Reviewing…',
    Cancelar: 'Cancel',
    'Guardar plantilla': 'Save template',
    Importar: 'Import',
    'Revisar carpeta': 'Review folder',
    'Contactos CSV (UTF-8)': 'Contacts CSV (UTF-8)',
    'Contactos CSV': 'Contacts CSV',
    'Se requieren solo las columnas nombre y telefono (sin acento), separadas por coma.':
      'Only the columns nombre and telefono (without an accent) are required, separated by a comma.',
    'Nombre repetido: corrige todas las filas que comparten ese nombre.':
      'Repeated name: correct all rows sharing that name.',
    'Varias carpetas tienen el mismo nombre normalizado.':
      'Several folders have the same normalized name.',
    'Nombre ambiguo en el CSV.': 'Ambiguous name in the CSV.',
    'Contacto sin carpeta asociada.': 'Contact without a matching folder.',
    'Contacto válido sin carpeta asociada.':
      'Valid contact without a matching folder.',
    'Entrada inaccesible.': 'Inaccessible entry.',
    'Solo se revisan subcarpetas inmediatas.':
      'Only immediate subfolders are scanned.',
    'Subcarpeta excluida: no se revisa su contenido.':
      'Subfolder excluded: its contents are not scanned.',
    'Entrada especial excluida.': 'Special entry excluded.',
    'WhatsApp Web no pudo preparar o cargar el archivo adjunto.':
      'WhatsApp Web could not prepare or upload the attachment.',
    'El mensaje debe ser texto de hasta 1000 caracteres.':
      'The message must be text of up to 1000 characters.',
    'Solicitud no autorizada.': 'Unauthorized request.',
    'No se pudo guardar el idioma. Revisa los permisos e inténtalo de nuevo.':
      'Could not save the language. Check permissions and try again.',
    '{0} · {1} archivo': '{0} · {1} file',
    'Resultado incierto': 'Uncertain result',
    'Vincula WhatsApp en el panel izquierdo para continuar.':
      'Link WhatsApp in the left sidebar to continue.',
    'Recurso no disponible.': 'Resource unavailable.',
    'Recurso no permitido.': 'Resource not allowed.',
    'Idioma no válido.': 'Invalid language.',
    'Espera a que termine el cambio de idioma.':
      'Wait for the language change to finish.',
  });
  function translate(language, source, ...values) {
    if (typeof source !== 'string') return source ?? '';
    let pattern =
      language === 'en' && Object.hasOwn(english, source)
        ? english[source]
        : source;
    if (
      !values.length &&
      language === 'en' &&
      !Object.hasOwn(english, source)
    ) {
      // Queue diagnostics append an allowlisted code and optional local log failure.
      const parts = source.split(
        /( Código: [A-Z_]+\.| No se pudo guardar toda la información del envío\. Revisa sus permisos y el espacio disponible\.)/u,
      );
      if (parts.length > 1)
        return parts
          .map((part) => {
            const code = /^ Código: ([A-Z_]+)\.$/u.exec(part);
            return code
              ? translate(language, ' Código: {0}.', code[1])
              : Object.hasOwn(english, part)
                ? english[part]
                : part;
          })
          .join('');
    }
    return values.length
      ? pattern.replace(/\{(\d+)\}/gu, (match, index) =>
          index < values.length ? String(values[index]) : match,
        )
      : pattern;
  }
  const api = Object.freeze({ english, translate });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.waTranslations = api;
})(globalThis);
