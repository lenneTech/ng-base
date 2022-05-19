// also exported from '@storybook/angular' if you can deal with breaking changes in 6.1
import { Meta, Story } from '@storybook/angular/types-6-0';
import { componentWrapperDecorator, moduleMetadata } from '@storybook/angular';
import { Component } from '@angular/core';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { ToastService, ToastType } from '@lenne.tech/ng-base/shared';
import { BaseComponentsModule } from '@lenne.tech/ng-base/base-components';

@Component({
  template: `
    <div class="w-100">
      <base-toast></base-toast>

      <div style="display: flex; flex-direction: row; justify-content: space-around;">
        <button class="btn btn-danger" (click)="addError()">Show Error Toast</button>
        <button class="btn btn-warning" (click)="addWarning()">Show Warning Toast</button>
        <button class="btn btn-info" (click)="addInfo()">Show Info Toast</button>
      </div>
    </div>
  `,
})
class ToastWrapperComponent {
  constructor(private toastService: ToastService) {}

  addInfo() {
    this.toastService.show(
      {
        id: 'info',
        type: ToastType.INFO,
      },
      5000
    );
  }

  addWarning() {
    this.toastService.show(
      {
        id: 'info',
        type: ToastType.WARNING,
      },
      5000
    );
  }

  addError() {
    this.toastService.show(
      {
        id: 'info',
        type: ToastType.ERROR,
        errorCode: 'ER007',
      },
      5000
    );
  }
}

// More on default export: https://storybook.js.org/docs/angular/writing-stories/introduction#default-export
export default {
  title: 'Services/ToastService',
  component: ToastWrapperComponent,
  decorators: [
    moduleMetadata({
      declarations: [ToastWrapperComponent],
      imports: [BaseComponentsModule, BrowserAnimationsModule],
      providers: [ToastService],
    }),
    componentWrapperDecorator(
      (story) =>
        `<div style="display: flex; justify-content:center; align-items: center; height: 100vh; margin: 0 auto; width: 90vw;">
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
const Template: Story<ToastWrapperComponent> = (args: ToastWrapperComponent) => ({
  props: args,
});

export const Default = Template.bind({});
