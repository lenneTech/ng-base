import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

import { BaseComponentsModule } from '@lenne.tech/ng-base/base-components';
import { LoginComponent } from './pages/login/login.component';
import { RegisterComponent } from './pages/register/register.component';
import { ForgotPasswordComponent } from './pages/forgot-password/forgot-password.component';

// Modules
const imports = [FormsModule, RouterModule, ReactiveFormsModule, CommonModule, BaseComponentsModule];

// Imported and exported elements
const elements = [
  // Components
  LoginComponent,
  RegisterComponent,
  ForgotPasswordComponent,
];

@NgModule({
  declarations: elements,
  imports,
  exports: elements,
})
export class BasePrototypeModule {}
