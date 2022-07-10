// also exported from '@storybook/angular' if you can deal with breaking changes in 6.1
import { Story, Meta } from '@storybook/angular/types-6-0';
import { componentWrapperDecorator, moduleMetadata } from '@storybook/angular';
import { TagsComponent } from './tags.component';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { BaseComponentsModule } from '@lenne.tech/ng-base/base-components';

// More on default export: https://storybook.js.org/docs/angular/writing-stories/introduction#default-export
export default {
  title: 'Components/Inputs/TagsComponent',
  component: TagsComponent,
  decorators: [
    moduleMetadata({
      imports: [CommonModule, FormsModule, ReactiveFormsModule, BaseComponentsModule],
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
const Template: Story<TagsComponent> = (args: TagsComponent) => ({
  props: args,
});

export const Default = Template.bind({});
Default.args = {
  id: 'default',
  label: 'Label',
  name: 'name',
  control: new FormControl(['test']),
  options: [],
};

export const WithOptions = Template.bind({});
WithOptions.args = {
  id: 'default',
  label: 'Label',
  name: 'name',
  custom: false,
  removeByKey: false,
  control: new FormControl([]),
  options: [
    { text: 'test', value: '1' },
    { text: 'test2', value: '2' },
    { text: 'test3', value: '3' },
  ],
};
