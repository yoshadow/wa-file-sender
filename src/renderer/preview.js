'use strict';

// Narrow UI module: identifiers and booleans only; paths stay in the main process.
(() => {
  const translateUi = (...args) => window.waI18n.t(...args);
  const byId = (id) => document.getElementById(id);
  const bridge = window.waFileSender;
  let state;
  let busy = false;
  let contactsReady = false;
  let importing = false;
  let queuing = false;
  let page = 0;
  let sendingState,
    results = [];
  const opened = new Set();
  const filePages = new Map();
  const size = (bytes) => {
    if (bytes === null) return '—';
    if (bytes < 1024) return `${bytes} B`;
    const divisor = bytes < 1024 * 1024 ? 1024 : 1024 * 1024;
    const unit = divisor === 1024 ? 'KiB' : 'MiB';
    return `${(bytes / divisor).toLocaleString(window.waI18n.locale, { maximumFractionDigits: 1 })} ${unit}`;
  };
  const textNode = (tag, text, className) => {
    const node = document.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  function checkbox(labelText, checked, disabled, id, partial = false) {
    const label = document.createElement('label');
    label.className = 'selection-label';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.disabled = disabled || busy || importing || queuing;
    input.indeterminate = partial;
    input.dataset.selectionId = id;
    input.addEventListener('change', () =>
      action(() =>
        bridge.selectPreviewItem({
          revision: state.revision,
          id,
          selected: input.checked,
        }),
      ),
    );
    label.append(input, document.createTextNode(labelText));
    return label;
  }
  function updateStatuses() {
    if (!state) return;
    for (const card of byId('preview-rows').querySelectorAll(
      '[data-recipient-id]',
    )) {
      const row = state.rows.find(
        (item) => item.id === card.dataset.recipientId,
      );
      if (!row) continue;
      const previous = results.find((item) => item.phone === row.phone);
      const active =
        sendingState?.busy && sendingState.current?.phone === row.phone;
      const labels = {
        preparing: 'Preparando ZIP',
        sending: 'Enviando',
        sent: 'Enviado',
        failed: 'Error',
        cancelled: 'Detenido',
        uncertain: 'Resultado incierto',
      };
      const phases = {
        compressing: 'Preparando ZIP',
        checking: 'Comprobando número',
        sending: 'Enviando',
        waiting: 'En espera',
      };
      const label = !row.eligible
        ? row.folderName
          ? translateUi('Necesita revisión')
          : translateUi('Sin carpeta')
        : active
          ? translateUi(phases[sendingState.status]) || translateUi('Pendiente')
          : previous
            ? previous.resolution === 'sent'
              ? translateUi('Enviado')
              : previous.resolution === 'not-sent'
                ? translateUi('No enviado')
                : translateUi(labels[previous.status]) ||
                  translateUi('Pendiente')
            : row.selected
              ? translateUi('Pendiente')
              : translateUi('Sin seleccionar');
      const timer = card.querySelector('.recipient-countdown');
      timer.hidden = !(
        active &&
        sendingState.status === 'waiting' &&
        sendingState.countdown > 0
      );
      timer.textContent = timer.hidden ? '' : `${sendingState.countdown} s`;
      const badge = card.querySelector('.recipient-status');
      badge.textContent = label;
      badge.dataset.state = !row.eligible
        ? 'invalid'
        : active
          ? 'active'
          : previous?.resolution ||
            previous?.status ||
            (row.eligible ? 'pending' : 'invalid');
      const detail = card.querySelector('.attempt-details');
      const key = JSON.stringify([
        previous,
        Boolean(sendingState?.busy),
        window.waI18n.language,
      ]);
      if (detail.dataset.key === key) continue;
      detail.dataset.key = key;
      detail.replaceChildren();
      if (previous?.status === 'uncertain' && !previous.resolution) {
        detail.append(
          textNode(
            'p',
            translateUi(
              'Comprueba el chat antes de repetir. ¿Se recibió este envío?',
            ),
            'preview-problem',
          ),
        );
        for (const [label, resolution] of [
          [translateUi('Sí, se envió'), 'sent'],
          [translateUi('No se envió'), 'not-sent'],
        ]) {
          const button = textNode('button', label);
          button.type = 'button';
          button.disabled = Boolean(sendingState?.busy);
          button.addEventListener('click', () =>
            document.dispatchEvent(
              new CustomEvent('resolve-attempt', {
                detail: { id: previous.id, resolution },
              }),
            ),
          );
          detail.append(button);
        }
      } else if (previous?.status === 'failed') {
        detail.append(
          textNode(
            'p',
            translateUi(
              'No se pudo completar el envío. Revisa el número, los archivos y la conexión antes de volver a intentarlo.',
            ),
            'preview-problem',
          ),
        );
      }
    }
  }
  function render() {
    if (!state) return;
    const locked = busy || importing || queuing;
    byId('select-root-button').disabled = locked || !contactsReady;
    byId('clear-preview-button').disabled = locked || state.status === 'empty';
    byId('preview-filter').disabled = busy;
    byId('root-name').textContent =
      state.rootName || translateUi('Sin carpeta seleccionada.');
    const problems = state.rows.filter(
      (row) => !row.eligible || row.files.some((file) => !file.readable),
    ).length;
    byId('preview-status').textContent = busy
      ? translateUi('Revisando selección…')
      : translateUi(state.error) ||
        (state.status === 'ready'
          ? problems
            ? translateUi('{0} destinatarios necesitan revisión.', problems)
            : translateUi('{0} destinatarios disponibles.', state.rows.length)
          : contactsReady
            ? translateUi(
                'Selecciona la carpeta principal para ver los documentos.',
              )
            : translateUi('Selecciona un CSV para comenzar.'));
    byId('selection-summary').textContent = translateUi(
      '{0} destinatarios · {1} archivos · {2} sin comprimir',
      state.selectedCount,
      state.selectedFileCount,
      size(state.selectedBytes),
    );
    const filter = byId('preview-filter').value;
    const rows = state.rows.filter(
      (row) =>
        filter === 'all' ||
        (filter === 'eligible'
          ? row.eligible
          : filter === 'problems'
            ? !row.eligible || row.files.some((file) => !file.readable)
            : row.selected),
    );
    const pages = Math.max(1, Math.ceil(rows.length / 20));
    page = Math.min(page, pages - 1);
    const container = byId('preview-rows');
    container.replaceChildren();
    for (const row of rows.slice(page * 20, (page + 1) * 20)) {
      const card = document.createElement('article');
      card.className = 'recipient';
      card.dataset.recipientId = row.id;
      card.dataset.eligible = String(row.eligible);
      const readable = row.files.filter((file) => file.readable);
      const selected = row.files.filter((file) => file.selected);
      const selectedBytes = selected.reduce((sum, file) => sum + file.size, 0);
      const select = checkbox(
        translateUi(
          'Seleccionar {0}',
          row.contactName || row.folderName || translateUi('destinatario'),
        ),
        row.selected,
        !row.eligible,
        row.id,
        selected.length > 0 && selected.length < readable.length,
      );
      select.classList.add('recipient-select');
      card.append(select);
      const details = document.createElement('details');
      details.open = opened.has(row.id);
      details.addEventListener('toggle', () => {
        if (details.open) opened.add(row.id);
        else opened.delete(row.id);
      });
      const summary = document.createElement('summary');
      const contact = textNode('span', '', 'recipient-contact');
      contact.append(
        textNode(
          'strong',
          row.contactName ||
            row.folderName ||
            translateUi('Contacto sin nombre'),
        ),
        textNode(
          'span',
          row.phone || translateUi('Teléfono no disponible'),
          'recipient-phone',
        ),
      );
      summary.append(
        contact,
        textNode(
          'span',
          translateUi(
            '{0} de {1} · {2}',
            selected.length,
            readable.length,
            size(selectedBytes),
          ),
          'recipient-file-count',
        ),
        (() => {
          const cell = textNode('span', '', 'recipient-state');
          cell.append(
            textNode('span', '', 'recipient-status'),
            textNode('span', '', 'recipient-countdown'),
          );
          return cell;
        })(),
      );
      details.append(summary);
      const body = document.createElement('div');
      body.className = 'recipient-content';
      body.append(
        textNode(
          'p',
          translateUi(
            'Carpeta: {0}',
            row.folderName || translateUi('Sin asociación'),
          ),
          'field-note',
        ),
      );
      for (const issue of row.issues)
        body.append(textNode('p', translateUi(issue), 'preview-problem'));
      if (selectedBytes > 20 * 1024 * 1024)
        body.append(
          textNode(
            'p',
            translateUi(
              'El ZIP debe ocupar como máximo 20 MiB. El tamaño final se comprobará antes de enviar.',
            ),
            'preview-problem',
          ),
        );
      const filePage = Math.min(
        filePages.get(row.id) || 0,
        Math.max(0, Math.ceil(row.files.length / 50) - 1),
      );
      const list = document.createElement('ul');
      list.className = 'file-list';
      for (const file of row.files.slice(filePage * 50, (filePage + 1) * 50)) {
        const li = document.createElement('li');
        li.append(
          checkbox(
            file.name,
            file.selected,
            !row.eligible || !file.readable,
            file.id,
          ),
          textNode(
            'span',
            file.readable ? size(file.size) : translateUi(file.reason),
            file.readable ? 'file-size' : 'preview-problem',
          ),
        );
        list.append(li);
      }
      body.append(list);
      if (row.files.length > 50) {
        const navigation = document.createElement('div');
        navigation.className = 'actions contacts-pagination';
        for (const [label, next, disabled] of [
          [translateUi('Anteriores'), filePage - 1, filePage === 0],
          [
            translateUi('Más archivos'),
            filePage + 1,
            (filePage + 1) * 50 >= row.files.length,
          ],
        ]) {
          const button = textNode('button', label);
          button.type = 'button';
          button.disabled = disabled || locked;
          button.addEventListener('click', () => {
            opened.add(row.id);
            filePages.set(row.id, next);
            render();
          });
          navigation.append(button);
        }
        body.append(navigation);
      }
      body.append(textNode('div', '', 'attempt-details'));
      details.append(body);
      card.append(details);
      container.append(card);
    }
    if (!rows.length)
      container.append(
        textNode(
          'p',
          state.status === 'ready'
            ? translateUi('No hay destinatarios para este filtro.')
            : translateUi(
                'Los destinatarios aparecerán aquí al seleccionar sus carpetas.',
              ),
          'empty-state',
        ),
      );
    byId('preview-pagination').hidden = rows.length <= 20;
    byId('preview-page').textContent = translateUi(
      'Página {0} de {1}',
      page + 1,
      pages,
    );
    byId('preview-prev').disabled = busy || page === 0;
    byId('preview-next').disabled = busy || page >= pages - 1;
    const excluded = state.excluded.filter(
      (entry) => !/^WA-File-Sender_.*\.log$/u.test(entry.name),
    );
    byId('root-excluded').hidden = !excluded.length;
    byId('root-excluded-list').replaceChildren(
      ...excluded.map((entry) =>
        textNode('li', `${entry.name}: ${translateUi(entry.reason)}`),
      ),
    );
    updateStatuses();
  }
  async function refreshPreview() {
    if (!bridge) return;
    const [preview, contacts] = await Promise.all([
      bridge.getPreview(),
      bridge.getContacts(),
    ]);
    if (!preview.ok || !contacts.ok) throw new Error('Preview unavailable');
    state = preview.state;
    contactsReady = !contacts.state.busy && contacts.state.validCount > 0;
    render();
  }
  async function action(operation) {
    if (busy) return;
    busy = true;
    document.dispatchEvent(new Event('preview-busy'));
    render();
    // Prevent changing contacts while the native folder dialog or scan is in progress.
    byId('import-csv-button').disabled = true;
    byId('clear-csv-button').disabled = true;
    let message;
    try {
      const result = await operation();
      if (!result.ok) message = result.error;
      else {
        state = result.state;
        if (state.cancelled)
          message = translateUi(
            'Selección cancelada. Se conservó la revisión anterior.',
          );
      }
    } catch {
      message = translateUi(
        'No se pudo actualizar la revisión. Vuelve a seleccionar la carpeta.',
      );
    } finally {
      busy = false;
      await refreshPreview().catch(() => {});
      // Reuse the CSV renderer to restore its own button states.
      document.dispatchEvent(new Event('preview-idle'));
      if (message) byId('preview-status').textContent = translateUi(message);
    }
  }
  byId('select-root-button').addEventListener('click', () => {
    page = 0;
    opened.clear();
    filePages.clear();
    action(() => bridge.selectRoot());
  });
  byId('clear-preview-button').addEventListener('click', () =>
    action(() => bridge.clearPreview()),
  );
  byId('preview-filter').addEventListener('change', () => {
    page = 0;
    render();
  });
  byId('preview-prev').addEventListener('click', () => {
    page--;
    render();
  });
  byId('preview-next').addEventListener('click', () => {
    page++;
    render();
  });
  document.addEventListener('contacts-updated', (event) => {
    importing = Boolean(event.detail?.busy);
    if (importing) {
      render();
      return;
    }
    page = 0;
    opened.clear();
    filePages.clear();
    document.addEventListener('language-changed', render);
    refreshPreview().catch(() => {});
  });
  document.addEventListener('queue-updated', (event) => {
    sendingState = event.detail.state;
    results = event.detail.results;
    if (
      event.detail.preview &&
      state?.revision !== event.detail.preview.revision
    ) {
      state = event.detail.preview;
      render();
    } else updateStatuses();
  });
  document.addEventListener('language-changed', render);
  refreshPreview().catch(() => {
    byId('preview-status').textContent = translateUi(
      'No se pudo consultar la vista previa.',
    );
  });
  document.addEventListener('queue-busy', (event) => {
    queuing = Boolean(event.detail);
    render();
  });
})();
