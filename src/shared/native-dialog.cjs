'use strict';
const { translate } = require('../renderer/translations.js');
function localizeDialog(language, options) {
  return {
    ...options,
    ...Object.fromEntries(
      ['title', 'message', 'detail', 'buttonLabel']
        .filter((key) => typeof options[key] === 'string')
        .map((key) => [key, translate(language, options[key])]),
    ),
    ...(options.buttons
      ? { buttons: options.buttons.map((label) => translate(language, label)) }
      : {}),
    ...(options.filters
      ? {
          filters: options.filters.map((filter) => ({
            ...filter,
            name: translate(language, filter.name),
          })),
        }
      : {}),
  };
}
module.exports = { localizeDialog };
