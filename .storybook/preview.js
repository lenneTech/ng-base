import { setCompodocJson } from '@storybook/addon-docs/angular';

import 'bootstrap/dist/js/bootstrap.js';

import docJson from '../documentation.json';
setCompodocJson(docJson);

export const parameters = {
  actions: { argTypesRegex: '^on[A-Z].*' },
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/,
    },
  },
  layout: 'centered',
  docs: {
    inlineStories: true,
    transformSource: (src, storyContext) => {
      try {
        const { template } = storyContext.storyFn(storyContext);
        return template;
      } catch (e) {
        return null;
      }
    },
  },
};
