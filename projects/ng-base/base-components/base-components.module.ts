import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ForNumberPipe } from '@lenne.tech/ng-base/shared';

import { InputComponent } from './components/input/input.component';
import { SelectComponent } from './components/select/select.component';
import { CheckboxComponent } from './components/checkbox/checkbox.component';
import { TextareaComponent } from './components/textarea/textarea.component';
import { ToastComponent } from './components/toast/toast.component';
import { TagsComponent } from './components/tags/tags.component';
import { LoadingBarComponent } from './components/loading-bar/loading-bar.component';
import { SkeletonLoaderComponent } from './components/skeleton-loader/skeleton-loader.component';
import { BreadcrumbComponent } from './components/breadcrumb/breadcrumb.component';

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
];

@NgModule({
  declarations: [elements, ForNumberPipe],
  imports,
  exports: [elements, ForNumberPipe],
})
export class BaseComponentsModule {}
