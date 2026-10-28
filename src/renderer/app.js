'use strict';

const api = window.waFileSender;
const translateUi = (...args) => window.waI18n.t(...args);
const element = (id) => document.getElementById(id);
const status = element('connection-status');
const connectButton = element('connect-button');
const unlinkButton = element('unlink-button');
let localBusy = false;
let refreshing = false;
let lastState;
let lastQr;
let actionError = null;
let contactsState;
let contactsPage = 0;
let contactsBusy = false;
let queueBusy = false;
let templateBusy = false;
let templateStatus = '';
function renderTemplateStatus() {
  element('template-status').textContent = translateUi(templateStatus);
}
const CONTACT_PAGE_SIZE = 50;

function renderContacts(state) {
  contactsState = state;
  const busy = contactsBusy || state.busy || queueBusy;
  element('import-csv-button').disabled = busy;
  element('download-template-button').disabled = busy || templateBusy;
  element('clear-csv-button').disabled = busy || !state.fileName;
  element('csv-file-name').textContent = state.fileName
    ? translateUi('Archivo: {0}', state.fileName)
    : translateUi('Sin CSV seleccionado.');
  element('contacts-status').textContent =
    state.status === 'ready'
      ? state.invalidCount
        ? translateUi(
            '{0} válidos · {1} necesitan revisión.',
            state.validCount,
            state.invalidCount,
          )
        : translateUi('{0} contactos importados.', state.validCount)
      : state.status === 'invalid-file'
        ? translateUi(
            'No se importaron contactos. Corrige el archivo y vuelve a seleccionarlo.',
          )
        : translateUi(
            'Selecciona un CSV para revisar los contactos. No se enviarán mensajes.',
          );
  element('contacts-summary').textContent = state.fileErrors.length
    ? translateUi('El CSV necesita revisión')
    : state.invalidCount
      ? translateUi('{0} contactos necesitan revisión', state.invalidCount)
      : translateUi('Revisar contactos del CSV');
  if (state.invalidCount || state.fileErrors.length)
    element('contacts-details').open = true;
  const errors = element('csv-file-errors');
  errors.replaceChildren();
  errors.hidden = state.fileErrors.length === 0;
  for (const error of state.fileErrors) {
    const li = document.createElement('li');
    li.textContent = `${error.line ? translateUi('Línea {0}: ', error.line) : ''}${translateUi(error.message)}`;
    errors.append(li);
  }
  element('contacts-preview').hidden = state.rows.length === 0;
  element('contacts-filter').disabled = busy;
  const filter = element('contacts-filter').value;
  const filtered = state.rows.filter(
    (row) => filter === 'all' || (filter === 'valid' ? row.valid : !row.valid),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / CONTACT_PAGE_SIZE));
  contactsPage = Math.min(contactsPage, pages - 1);
  const body = element('contacts-rows');
  body.replaceChildren();
  const shorten = (value) =>
    value.length > 200 ? `${value.slice(0, 200)}…` : value;
  for (const row of filtered.slice(
    contactsPage * CONTACT_PAGE_SIZE,
    (contactsPage + 1) * CONTACT_PAGE_SIZE,
  )) {
    const tr = document.createElement('tr');
    tr.dataset.valid = String(row.valid);
    for (const text of [
      String(row.line),
      shorten(row.name),
      shorten(row.phone),
      row.normalizedPhone || '—',
      row.valid
        ? translateUi('Válido')
        : row.errors.map((error) => translateUi(error.message)).join(' '),
    ]) {
      const td = document.createElement('td');
      td.textContent = text;
      tr.append(td);
    }
    body.append(tr);
  }
  if (!filtered.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5;
    td.textContent = translateUi('No hay contactos para este filtro.');
    tr.append(td);
    body.append(tr);
  }
  element('contacts-page').textContent = translateUi(
    'Página {0} de {1} · {2} contactos',
    contactsPage + 1,
    pages,
    filtered.length,
  );
  element('contacts-prev').disabled = busy || contactsPage === 0;
  element('contacts-next').disabled = busy || contactsPage >= pages - 1;
}

async function contactsAction(operation) {
  if (contactsBusy) return;
  contactsBusy = true;
  document.dispatchEvent(
    new CustomEvent('contacts-updated', { detail: { busy: true } }),
  );
  if (contactsState) renderContacts(contactsState);
  element('contacts-status').textContent = translateUi(
    'Leyendo y validando contactos…',
  );
  let statusMessage;
  try {
    const result = await operation();
    if (!result.ok) throw new Error('Import failed');
    if (!result.state.cancelled) {
      contactsPage = 0;
      element('contacts-filter').value = 'all';
    }
    contactsState = result.state;
    if (result.state.cancelled)
      statusMessage = translateUi(
        'Selección cancelada. Se conservaron los datos anteriores.',
      );
  } catch {
    statusMessage = translateUi(
      'No se pudo importar el CSV. Revisa el archivo y vuelve a intentarlo.',
    );
  } finally {
    contactsBusy = false;
    if (contactsState) renderContacts(contactsState);
    if (statusMessage) element('contacts-status').textContent = statusMessage;
    document.dispatchEvent(new Event('contacts-updated'));
  }
}

element('import-csv-button').addEventListener('click', () =>
  contactsAction(() => api.selectContactsCsv()),
);
element('download-template-button').addEventListener('click', async () => {
  if (templateBusy) return;
  templateBusy = true;
  element('download-template-button').disabled = true;
  templateStatus = '';
  renderTemplateStatus();
  try {
    const result = await api.saveContactsTemplate();
    templateStatus = !result.ok
      ? result.error
      : result.state.cancelled
        ? 'Guardado cancelado.'
        : 'Plantilla guardada.';
  } catch {
    templateStatus = 'No se pudo guardar la plantilla. Inténtalo de nuevo.';
  } finally {
    renderTemplateStatus();
    templateBusy = false;
    if (contactsState) renderContacts(contactsState);
    else element('download-template-button').disabled = false;
  }
});
element('clear-csv-button').addEventListener('click', () =>
  contactsAction(() => api.clearContacts()),
);
element('contacts-filter').addEventListener('change', () => {
  contactsPage = 0;
  if (contactsState) renderContacts(contactsState);
});
element('contacts-prev').addEventListener('click', () => {
  if (contactsPage > 0) contactsPage--;
  if (contactsState) renderContacts(contactsState);
});
element('contacts-next').addEventListener('click', () => {
  contactsPage++;
  if (contactsState) renderContacts(contactsState);
});

const labels = {
  idle: 'WhatsApp sin vincular',
  connecting: 'Iniciando WhatsApp…',
  qr: 'Esperando escaneo del QR',
  authenticated: 'Preparando WhatsApp…',
  ready: 'WhatsApp vinculado',
  disconnected: 'WhatsApp desconectado',
  error: 'La sesión requiere revisión',
};
const problems = {
  send: 'La aplicación detuvo la conexión tras el error de envío. La sesión guardada no se borró. Revisa el chat antes de reconectar; no hay reintentos automáticos.',
  auth: 'WhatsApp rechazó la sesión. Desvincula y vuelve a escanear el QR.',
  sandbox:
    'El sistema impidió iniciar el sandbox de Chrome. Revisa la configuración del sistema sin desactivar el sandbox.',
  browser:
    'No se pudo iniciar el navegador incluido. Revisa los requisitos de Chrome para este equipo.',
  connection:
    'WhatsApp no respondió a tiempo. Revisa Internet y vuelve a conectar.',
  compatibility:
    'La integración no pudo inicializarse. Puede haber un cambio en WhatsApp Web o una incompatibilidad de la biblioteca.',
};

function render(state) {
  lastState = state;
  const busy = localBusy || state.busy || queueBusy;
  const linked = ['connecting', 'qr', 'authenticated', 'ready'].includes(
    state.status,
  );
  element('session-indicator').dataset.state =
    state.status === 'ready'
      ? 'connected'
      : ['connecting', 'qr', 'authenticated'].includes(state.status)
        ? 'connecting'
        : 'disconnected';
  element('session-label').textContent =
    state.problem === 'send'
      ? translateUi('Conexión detenida por precaución')
      : translateUi(labels[state.status]) ||
        translateUi('Sesión no disponible');
  element('account-label').textContent = state.account
    ? translateUi('Cuenta: {0}', state.account.split('@')[0])
    : '';
  element('session-detail').textContent =
    state.status === 'error'
      ? translateUi(problems[state.problem]) ||
        translateUi(
          'No se pudo completar la conexión. Revisa Internet y la sesión. Puedes desvincular y volver a escanear el QR.',
        )
      : state.status === 'ready'
        ? translateUi('Cuenta lista para enviar.')
        : translateUi(labels[state.status]);
  connectButton.disabled = busy || linked;
  connectButton.textContent = ['error', 'disconnected'].includes(state.status)
    ? translateUi('Reconectar WhatsApp')
    : translateUi('Vincular con QR');
  unlinkButton.disabled = busy;
  if (state.qr !== lastQr) {
    lastQr = state.qr;
    const image = element('qr-image');
    const validQr =
      typeof state.qr === 'string' &&
      state.qr.startsWith('data:image/png;base64,');
    element('qr-area').hidden = !validQr;
    if (validQr) image.src = state.qr;
    else image.removeAttribute('src');
  }
  element('operation-result').textContent = translateUi(actionError || '');
}

async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    const result = await api.getWhatsAppState();
    if (result.ok) {
      render(result.state);
      return true;
    }
    status.textContent = translateUi(result.error);
    return false;
  } catch {
    status.textContent = translateUi(
      'No se pudo consultar la aplicación. Cierra la ventana y vuelve a abrirla.',
    );
    return false;
  } finally {
    refreshing = false;
  }
}

async function act(operation) {
  if (localBusy) return;
  localBusy = true;
  actionError = null;
  element('operation-result').textContent = '';
  if (lastState) render(lastState);
  try {
    const result = await operation();
    if (!result.ok) actionError = result.error;
    else render(result.state);
  } catch {
    actionError =
      'No se pudo completar la operación. Revisa la sesión antes de reintentar.';
  } finally {
    localBusy = false;
    await refresh();
  }
}

connectButton.addEventListener('click', () => {
  if (lastState)
    render({
      ...lastState,
      status: 'connecting',
      problem: null,
      qr: null,
      account: null,
    });
  act(() => api.connectWhatsApp());
});
unlinkButton.addEventListener('click', () => act(() => api.unlinkWhatsApp()));
element('close-button').addEventListener('click', async () => {
  element('close-button').disabled = true;
  status.textContent = translateUi('Cerrando la sesión local y la aplicación…');
  try {
    await api.close();
  } catch {
    status.textContent = translateUi(
      'Utiliza el control de cierre de la ventana.',
    );
  }
});

async function initialize() {
  if (!api) {
    status.textContent = translateUi(
      'Abre WA File Sender como aplicación de escritorio. Este HTML no funciona por separado en el navegador.',
    );
    element('close-button').disabled = true;
    document.documentElement.dataset.ready = 'error';
    return;
  }
  try {
    const info = await api.getAppInfo();
    window.waI18n.setLanguage(info.language);
    element('language-select').disabled = false;
    element('app-version').textContent =
      `v${info.version} · ${info.platform === 'win32' ? 'Windows' : 'Linux'}`;
    if (!(await refresh())) throw new Error('State unavailable');
    const contacts = await api.getContacts();
    if (!contacts.ok) throw new Error('Contacts unavailable');
    renderContacts(contacts.state);
    status.textContent = translateUi('Aplicación de escritorio lista.');
    document.documentElement.dataset.ready = 'true';
    setInterval(refresh, 1000);
  } catch {
    status.textContent = translateUi(
      'No se pudo iniciar la aplicación. Cierra la ventana e inténtalo de nuevo.',
    );
    document.documentElement.dataset.ready = 'error';
  }
}

initialize();
document.addEventListener('queue-busy', (event) => {
  queueBusy = Boolean(event.detail);
  if (contactsState) renderContacts(contactsState);
  if (lastState) render(lastState);
});
document.addEventListener('preview-idle', () => {
  if (contactsState) renderContacts(contactsState);
});

document.addEventListener('language-changed', () => {
  renderTemplateStatus();
  if (contactsState) renderContacts(contactsState);
  if (lastState) render(lastState);
});
