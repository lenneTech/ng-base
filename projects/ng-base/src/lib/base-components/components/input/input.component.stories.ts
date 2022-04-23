// also exported from '@storybook/angular' if you can deal with breaking changes in 6.1
import { Story, Meta } from '@storybook/angular/types-6-0';
import { componentWrapperDecorator, moduleMetadata } from '@storybook/angular';
import { InputComponent } from './input.component';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

// More on default export: https://storybook.js.org/docs/angular/writing-stories/introduction#default-export
export default {
  title: 'Components/Inputs/InputComponent',
  component: InputComponent,
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
const Template: Story<InputComponent> = (args: InputComponent) => ({
  props: args,
});

export const Default = Template.bind({});
Default.args = {
  id: 'default',
  name: 'name',
  label: 'Label',
  control: new FormControl(),
};

export const EmailInput = Template.bind({});
EmailInput.args = {
  id: 'default',
  name: 'name',
  label: 'Label',
  control: new FormControl(),
  type: 'email',
};

export const PhoneInput = Template.bind({});
PhoneInput.args = {
  id: 'default',
  name: 'name',
  label: 'Label',
  control: new FormControl(),
  type: 'tel',
};

export const FileInput = Template.bind({});
FileInput.args = {
  id: 'default',
  name: 'name',
  label: 'Label',
  control: new FormControl(),
  type: 'file',
};

export const DateInput = Template.bind({});
DateInput.args = {
  id: 'default',
  name: 'name',
  label: 'Label',
  control: new FormControl(),
  type: 'date',
};

export const DateAndTimeInput = Template.bind({});
DateAndTimeInput.args = {
  id: 'default',
  name: 'name',
  label: 'Label',
  control: new FormControl(),
  type: 'datetime-local',
};

export const TimeInput = Template.bind({});
TimeInput.args = {
  id: 'default',
  name: 'name',
  label: 'Label',
  control: new FormControl(),
  type: 'time',
};

export const ColorInput = Template.bind({});
ColorInput.args = {
  id: 'default',
  name: 'name',
  label: 'Label',
  control: new FormControl(),
  type: 'color',
};

export const PasswordInput = Template.bind({});
PasswordInput.args = {
  id: 'default',
  name: 'name',
  label: 'Label',
  control: new FormControl(),
  type: 'password',
};

export const SearchInput = Template.bind({});
SearchInput.args = {
  id: 'default',
  name: 'name',
  label: 'Label',
  control: new FormControl(),
  type: 'search',
};

export const NumberInput = Template.bind({});
NumberInput.args = {
  id: 'default',
  name: 'name',
  label: 'Label',
  control: new FormControl(),
  type: 'number',
};
