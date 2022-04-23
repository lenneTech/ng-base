module.exports = {
  stories: [
    '../projects/ng-base/src/**/*.stories.mdx',
    '../stories/**/*.stories.mdx',
    '../projects/ng-base/src/**/*.stories.@(js|jsx|ts|tsx)',
  ],
  addons: ['@storybook/addon-links', '@storybook/addon-essentials', '@storybook/addon-interactions'],
  framework: '@storybook/angular',
  core: {
    builder: '@storybook/builder-webpack5',
  },
};
