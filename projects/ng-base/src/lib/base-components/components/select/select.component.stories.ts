// also exported from '@storybook/angular' if you can deal with breaking changes in 6.1
import { Story, Meta } from '@storybook/angular/types-6-0';
import { componentWrapperDecorator, moduleMetadata } from '@storybook/angular';
import { SelectComponent } from './select.component';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

// More on default export: https://storybook.js.org/docs/angular/writing-stories/introduction#default-export
export default {
  title: 'Components/Inputs/SelectComponent',
  component: SelectComponent,
  decorators: [
    moduleMetadata({
      imports: [CommonModule, FormsModule, ReactiveFormsModule],
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
const Template: Story<SelectComponent> = (args: SelectComponent) => ({
  props: args,
});

export const Default = Template.bind({});
Default.args = {
  id: 'select',
  name: 'name',
  label: 'Label',
  placeholder: 'Placeholder',
  control: new FormControl(),
  tabIndex: 1,
  options: [
    {
      text: 'Option 1',
      value: 'option1',
    },
    {
      text: 'Option 2',
      value: 'option2',
    },
    {
      text: 'Option 3',
      value: 'option3',
    },
  ],
};
