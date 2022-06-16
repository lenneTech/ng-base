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

// Modules
const imports = [FormsModule, ReactiveFormsModule, CommonModule];

// Imported and exported elements
const elements = [
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
];

@NgModule({
  declarations: elements,
  imports,
  exports: elements,
})
export class BaseComponentsModule {}
