// also exported from '@storybook/angular' if you can deal with breaking changes in 6.1
import { Story, Meta } from '@storybook/angular/types-6-0';
import { componentWrapperDecorator, moduleMetadata } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { LoadingBarComponent } from '@lenne.tech/ng-base/base-components';

// More on default export: https://storybook.js.org/docs/angular/writing-stories/introduction#default-export
export default {
  title: 'Components/Loader/LoadingBarComponent',
  component: LoadingBarComponent,
  decorators: [
    moduleMetadata({
      imports: [CommonModule],
    }),
    componentWrapperDecorator(
      (story) =>
        `<div style="display: flex; justify-content:center; align-items: start; height: 100vh; margin: 0 auto; width: 40vw;">
            <div style="width: 100%">
                ${story}
            </div>
        </div>`
    ),
  ],
  parameters: {
    // More on Story layout: https://storybook.js.org/docs/angular/configure/story-layout
    layout: 'fullscreen',
  },
} as Meta;

// More on component templates: https://storybook.js.org/docs/angular/writing-stories/introduction#using-args
const Template: Story<LoadingBarComponent> = (args: LoadingBarComponent) => ({
  props: args,
});

export const Default = Template.bind({});
Default.args = {};
