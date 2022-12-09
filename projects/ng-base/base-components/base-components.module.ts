import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

import { InputComponent } from './components/input/input.component';
import { SelectComponent } from './components/select/select.component';
import { CheckboxComponent } from './components/checkbox/checkbox.component';
import { TextareaComponent } from './components/textarea/textarea.component';
import { ToastComponent } from './components/toast/toast.component';
import { TagsComponent } from './components/tags/tags.component';
import { LoadingBarComponent } from './components/loading-bar/loading-bar.component';
import { SkeletonLoaderComponent } from './components/skeleton-loader/skeleton-loader.component';
import { BreadcrumbComponent } from './components/breadcrumb/breadcrumb.component';
import { ModelTableComponent } from './components/model-table/model-table.component';
import { ModelFormComponent } from './components/model-form/model-form.component';
import { ModelFormSubComponent } from './components/model-form-sub/model-form-sub.component';
import { UploadImageComponent } from './components/upload-image/upload-image.component';
import { RefenceInputComponent } from './components/refence-input/refence-input.component';
import { ChangePasswordComponent } from './components/change-password/change-password.component';
import { DeleteAccountComponent } from './components/delete-account/delete-account.component';
import { FabButtonComponent } from './components/fab-button/fab-button.component';

import { BackButtonDirective } from './directives/back-button.directive';
import { SortDirective } from './directives/sort.directive';
import { ContextMenuDirective } from './directives/context-menu.directive';
import { StopPropagationDirective } from './directives/stop-propagation.directive';

import { EllipsesPipe } from './pipes/ellipses.pipe';

import { RouterModule } from '@angular/router';
import { ImageCropperModule } from 'ngx-image-cropper';

// Modules
const imports = [FormsModule, ReactiveFormsModule, CommonModule, RouterModule, ImageCropperModule];

// Imported and exported elements
const elements = [
  // Directives
  SortDirective,
  BackButtonDirective,
  ContextMenuDirective,
  StopPropagationDirective,

  // Components
  InputComponent,
  SelectComponent,
  CheckboxComponent,
  TextareaComponent,
  ToastComponent,
  TagsComponent,
  LoadingBarComponent,
  SkeletonLoaderComponent,
  BreadcrumbComponent,
  ModelFormComponent,
  ModelTableComponent,
  ModelFormSubComponent,
  UploadImageComponent,
  RefenceInputComponent,
  ChangePasswordComponent,
  DeleteAccountComponent,
  FabButtonComponent,

  // Pipes
  EllipsesPipe,
];

@NgModule({
  declarations: elements,
  imports,
  exports: elements,
})
export class BaseComponentsModule {}
