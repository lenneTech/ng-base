// also exported from '@storybook/angular' if you can deal with breaking changes in 6.1
import { Story, Meta } from '@storybook/angular/types-6-0';
import { componentWrapperDecorator, moduleMetadata } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { SkeletonLoaderComponent } from '@lenne.tech/ng-base/base-components';
import { SkeletonType } from '@lenne.tech/ng-base/shared';

// More on default export: https://storybook.js.org/docs/angular/writing-stories/introduction#default-export
export default {
  title: 'Components/Loader/SkeletonLoaderComponent',
  component: SkeletonLoaderComponent,
  decorators: [
    moduleMetadata({
      imports: [CommonModule],
    }),
    componentWrapperDecorator(
      (story) =>
        `<div style="display: flex; justify-content:center; align-items: center; height: 100vh; margin: 0 auto; width: 40vw;">
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
const Template: Story<SkeletonLoaderComponent> = (args: SkeletonLoaderComponent) => ({
  props: args,
});

export const Default = Template.bind({});
Default.args = {
  type: SkeletonType.LINE,
  size: 5,
};

export const Avatar = Template.bind({});
Avatar.args = {
  type: SkeletonType.AVATAR,
  size: 40,
};

export const Rectangle = Template.bind({});
Rectangle.args = {
  type: SkeletonType.RECTANGLE,
  size: 200,
};
