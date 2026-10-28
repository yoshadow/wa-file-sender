'use strict';
(() => {
  const translateUi = (...args) => window.waI18n.t(...args);
  const api = window.waFileSender;
  const el = (id) => document.getElementById(id);
  const dialog = el('send-review-dialog');
  let state,
    preview,
    sourceBusy = false,
    localBusy = false,
    notified = false,
    refreshing = false;
  let actionFeedback = '';
  let reviewPage = 0,
    reviewId,
    completionKey;
  const labels = {
    idle: 'Selecciona los destinatarios y revisa el envío.',
    preparing: 'Revisando los archivos seleccionados…',
    review: 'Revisa los destinatarios y archivos antes de confirmar.',
    confirming: 'Esperando confirmación…',
    running: 'Iniciando envío…',
    compressing: 'Preparando el ZIP del destinatario…',
    checking: 'Comprobando el número de WhatsApp…',
    sending: 'Enviando. Un archivo ya transmitido no puede retirarse.',
    waiting: 'Esperando la pausa entre envíos…',
    completed: 'Envío completado.',
    stopped: 'Envío detenido. Revisa la selección antes de continuar.',
    failed: 'El envío se detuvo por un error.',
    uncertain: 'Comprueba el chat antes de repetir este envío.',
  };
  const text = (tag, value, className) => {
    const node = document.createElement(tag);
    node.textContent = value;
    if (className) node.className = className;
    return node;
  };
  function render() {
    if (!state || !preview) return;
    const busy = state.busy || localBusy;
    el('review-feedback').textContent = translateUi(actionFeedback);
    if (notified !== busy) {
      notified = busy;
      document.dispatchEvent(new CustomEvent('queue-busy', { detail: busy }));
    }
    const interval = Number(el('queue-interval').value);
    const message = el('queue-message').value;
    const validMessage = message.length <= 1000;
    el('message-count').textContent = `${message.length} / 1000`;
    el('queue-message').disabled = busy;
    const validInterval =
      Number.isInteger(interval) && interval >= 10 && interval <= 3600;
    const dirty =
      state.review &&
      (state.review.intervalSeconds !== interval ||
        state.review.message !== message ||
        state.review.revision !== preview.revision ||
        state.review.account !== state.whatsapp.account);
    el('queue-interval').disabled = busy;
    el('prepare-queue-button').disabled =
      busy ||
      sourceBusy ||
      !state.whatsapp.ready ||
      !preview.selectedCount ||
      !validInterval ||
      !validMessage;
    el('prepare-queue-button').textContent =
      state.status === 'preparing'
        ? translateUi('Revisando…')
        : translateUi('Revisar envío');
    el('stop-queue-button').hidden = !state.busy;
    el('stop-queue-button').disabled = !state.busy || state.stopping;
    el('queue-account').textContent = state.whatsapp.ready
      ? ''
      : translateUi('Vincula WhatsApp en el panel izquierdo para continuar.');
    const completed = state.status === 'completed';
    const completion = el('completion-status');
    completion.hidden = !completed;
    if (completed && completionKey !== state.batchId) {
      completionKey = state.batchId;
      completion.classList.remove('completion-flash');
      void completion.offsetWidth;
      completion.classList.add('completion-flash');
    }
    el('queue-status').hidden = completed;
    el('queue-status').textContent = !validInterval
      ? translateUi('Usa una pausa de entre 10 y 3600 segundos.')
      : dirty
        ? translateUi(
            'La selección o el mensaje cambió. Vuelve a revisar el envío.',
          )
        : translateUi(state.message) ||
          translateUi(labels[state.status]) ||
          translateUi('Revisa el estado del envío.');
    el('queue-progress').textContent = state.total
      ? translateUi(
          '{0} de {1} destinatarios completados{2}',
          state.completed,
          state.total,
          state.current ? ` · ${state.current.name}` : '',
        )
      : '';
    if (dirty || (!state.review && !localBusy)) dialog.close();
    el('start-queue-button').disabled =
      busy ||
      dirty ||
      !state.whatsapp.ready ||
      !state.review ||
      state.review.items.some((item) => item.risks.blocked);
    el('close-review-button').disabled = busy;
    el('cancel-review-button').disabled = busy;
    if (!state.review) return;
    if (reviewId !== state.review.id) {
      reviewId = state.review.id;
      reviewPage = 0;
    }
    const review = state.review;
    el('review-message').hidden = !review.message;
    el('queue-review-message').textContent = review.message;
    const pages = Math.max(1, Math.ceil(review.items.length / 20));
    reviewPage = Math.min(reviewPage, pages - 1);
    el('queue-review-summary').textContent = translateUi(
      'Cuenta: +{0} · {1} destinatarios · Pausa: {2} segundos',
      review.account.split('@')[0],
      review.items.length,
      review.intervalSeconds,
    );
    const key = `${reviewId}:${reviewPage}:${window.waI18n.language}`;
    if (el('queue-review-items').dataset.key !== key) {
      el('queue-review-items').dataset.key = key;
      el('queue-review-items').replaceChildren();
      for (const item of review.items.slice(
        reviewPage * 20,
        (reviewPage + 1) * 20,
      )) {
        const card = text('article', '', 'review-recipient');
        card.append(
          text('h3', `${item.contactName} · ${item.phone}`),
          text(
            'p',
            translateUi(
              item.files.length === 1
                ? '{0} · {1} archivo'
                : '{0} · {1} archivos',
              item.name,
              item.files.length,
            ),
          ),
        );
        if (item.risks.blocked)
          card.append(
            text(
              'p',
              translateUi(
                'Hay un resultado incierto. Cierra esta revisión y comprueba el chat desde la fila del destinatario.',
              ),
              'preview-problem',
            ),
          );
        else if (item.risks.exact)
          card.append(
            text(
              'p',
              translateUi(
                'Este conjunto ya fue enviado durante esta sesión. Reenviarlo requerirá una autorización adicional.',
              ),
              'preview-problem',
            ),
          );
        if (item.risks.repeatedFiles.length)
          card.append(
            text(
              'p',
              translateUi(
                'Archivos enviados anteriormente: {0}. Su inclusión requiere autorización.',
                item.risks.repeatedFiles.join(', '),
              ),
              'preview-problem',
            ),
          );
        const details = document.createElement('details');
        details.append(text('summary', translateUi('Ver archivos incluidos')));
        const list = text('ul', '', 'review-files');
        // Full approved names remain accessible, with a scroll limit in CSS.
        for (const file of item.files)
          list.append(
            text(
              'li',
              `${file.name} · ${file.size.toLocaleString(window.waI18n.locale)} bytes`,
            ),
          );
        details.append(list);
        card.append(details);
        el('queue-review-items').append(card);
      }
    }
    el('queue-review-page').textContent = translateUi(
      '{0} de {1}',
      reviewPage + 1,
      pages,
    );
    el('queue-review-prev').disabled = reviewPage === 0;
    el('queue-review-next').disabled = reviewPage >= pages - 1;
  }
  async function refresh() {
    if (!api || refreshing) return;
    refreshing = true;
    try {
      const [queue, files, results] = await Promise.all([
        api.getQueue(),
        api.getPreview(),
        api.getSessionResults(),
      ]);
      if (!queue.ok || !files.ok || !results.ok) return;
      state = queue.state;
      preview = files.state;
      render();
      document.dispatchEvent(
        new CustomEvent('queue-updated', {
          detail: { state, results: results.state, preview },
        }),
      );
    } finally {
      refreshing = false;
    }
  }
  async function action(operation) {
    if (localBusy || state?.busy) return;
    localBusy = true;
    actionFeedback = '';
    el('review-feedback').textContent = '';
    render();
    let message;
    try {
      const response = await operation();
      if (!response.ok) message = response.error;
      else state = response.state;
    } catch {
      message =
        'No se pudo completar el envío. Revisa la conexión y el chat antes de repetir.';
    } finally {
      localBusy = false;
      actionFeedback = message || '';
      await refresh().catch(() => {});
      render();
      if (message) {
        el('queue-status').textContent = translateUi(message);
        el('review-feedback').textContent = translateUi(message);
      }
    }
  }
  el('prepare-queue-button').addEventListener('click', async () => {
    await action(async () => {
      const current = await api.getPreview();
      if (!current.ok) return current;
      return api.prepareQueue({
        revision: current.state.revision,
        intervalSeconds: Number(el('queue-interval').value),
        mode: 'whatsapp',
        outcome: 'success',
        message: el('queue-message').value,
      });
    });
    if (state?.status === 'review' && state.review && !dialog.open)
      dialog.showModal();
  });
  el('start-queue-button').addEventListener('click', () =>
    action(async () => {
      const response = await api.startQueue({ id: state.review.id });
      if (response.ok && response.state.status !== 'review') dialog.close();
      return response;
    }),
  );
  for (const id of ['close-review-button', 'cancel-review-button'])
    el(id).addEventListener('click', () => dialog.close());
  dialog.addEventListener('cancel', (event) => {
    if (state?.busy || localBusy) event.preventDefault();
  });
  el('stop-queue-button').addEventListener('click', () =>
    api
      .stopQueue()
      .then(refresh)
      .catch(() => {}),
  );
  el('queue-interval').addEventListener('input', render);
  el('queue-message').addEventListener('input', render);
  el('queue-review-prev').addEventListener('click', () => {
    reviewPage--;
    render();
  });
  el('queue-review-next').addEventListener('click', () => {
    reviewPage++;
    render();
  });
  document.addEventListener('resolve-attempt', (event) =>
    action(() => api.resolveBatchAttempt(event.detail)),
  );
  document.addEventListener('preview-busy', () => {
    sourceBusy = true;
    render();
  });
  document.addEventListener('preview-idle', () => {
    sourceBusy = false;
    refresh().catch(() => {});
  });
  document.addEventListener('contacts-updated', (event) => {
    sourceBusy = Boolean(event.detail?.busy);
    if (sourceBusy) render();
    else refresh().catch(() => {});
  });
  document.addEventListener('language-changed', render);
  refresh().catch(() => {});
  setInterval(() => refresh().catch(() => {}), 500);
})();
