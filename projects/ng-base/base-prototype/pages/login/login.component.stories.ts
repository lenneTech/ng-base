// also exported from '@storybook/angular' if you can deal with breaking changes in 6.1
import { Story, Meta } from '@storybook/angular/types-6-0';
import { moduleMetadata } from '@storybook/angular';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { LoginComponent } from './login.component';
import { RouterTestingModule } from '@angular/router/testing';
import { BaseComponentsModule } from '@lenne.tech/ng-base/base-components';
import { ApolloModule } from 'apollo-angular';
import { of } from 'rxjs';
import { UserService } from '@lenne.tech/ng-base/shared';

export class MockUserService {
  login() {
    return of(false);
  }
}

// More on default export: https://storybook.js.org/docs/angular/writing-stories/introduction#default-export
export default {
  title: 'Prototype/Pages/Login',
  component: LoginComponent,
  decorators: [
    moduleMetadata({
      imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        BaseComponentsModule,
        RouterTestingModule.withRoutes([]),
      ],
      providers: [
        {
          provide: UserService,
          useClass: MockUserService,
        },
      ],
    }),
  ],
  parameters: {
    // More on Story layout: https://storybook.js.org/docs/angular/configure/story-layout
    layout: 'fullscreen',
  },
} as Meta;

// More on component templates: https://storybook.js.org/docs/angular/writing-stories/introduction#using-args
const Template: Story<LoginComponent> = (args: LoginComponent) => ({
  props: args,
});

export const Default = Template.bind({});
Default.args = {};
