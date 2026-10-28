'use strict';
(() => {
  let language = 'es';
  const whitespace = new WeakMap();
  const t = (source, ...values) =>
    window.waTranslations.translate(language, source, ...values);
  function applyStatic() {
    document.documentElement.lang = language;
    for (const node of document.querySelectorAll('[data-i18n]')) {
      if (!whitespace.has(node)) {
        const text = node.textContent;
        whitespace.set(node, [text.match(/^\s*/u)[0], text.match(/\s*$/u)[0]]);
      }
      const [before, after] = whitespace.get(node);
      node.textContent = before + t(node.dataset.i18n) + after;
    }
    for (const attribute of ['aria-label', 'alt', 'placeholder']) {
      for (const node of document.querySelectorAll(
        `[data-i18n-${attribute}]`,
      )) {
        node.setAttribute(
          attribute,
          t(node.getAttribute(`data-i18n-${attribute}`)),
        );
      }
    }
    document.getElementById('language-select').value = language;
  }
  function setLanguage(value) {
    if (!['es', 'en'].includes(value)) return;
    language = value;
    applyStatic();
    document.dispatchEvent(new Event('language-changed'));
  }
  window.waI18n = Object.freeze({
    t,
    setLanguage,
    get language() {
      return language;
    },
    get locale() {
      return language === 'en' ? 'en-US' : 'es-MX';
    },
  });
  const selector = document.getElementById('language-select');
  selector.addEventListener('change', async () => {
    selector.disabled = true;
    const status = document.getElementById('language-status');
    status.textContent = '';
    try {
      const response = await window.waFileSender.setLanguage(selector.value);
      if (!response.ok) throw new Error(response.error);
      setLanguage(response.state.language);
    } catch {
      selector.value = language;
      status.textContent = t(
        'No se pudo guardar el idioma. Revisa los permisos e inténtalo de nuevo.',
      );
    } finally {
      selector.disabled = false;
    }
  });
  applyStatic();
})();
