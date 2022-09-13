import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

import { BaseModule } from '@lenne.tech/ng-base';
import { BaseComponentsModule } from '@lenne.tech/ng-base/base-components';

import { LoginComponent } from './pages/login/login.component';
import { RegisterComponent } from './pages/register/register.component';
import { ForgotPasswordComponent } from './pages/forgot-password/forgot-password.component';
import { ProfileComponent } from './pages/profile/profile.component';
import { ResetPasswordComponent } from './pages/reset-password/reset-password.component';
import { EmailVerificationComponent } from './pages/email-verification/email-verification.component';

// Modules
const imports = [BaseModule, FormsModule, RouterModule, ReactiveFormsModule, CommonModule, BaseComponentsModule];

// Imported and exported elements
const elements = [
  // Components
  LoginComponent,
  RegisterComponent,
  ForgotPasswordComponent,
  ProfileComponent,
  ResetPasswordComponent,
  EmailVerificationComponent,
];

@NgModule({
  declarations: elements,
  imports,
  exports: elements,
})
export class BasePrototypeModule {}
