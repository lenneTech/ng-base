import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

import { InputComponent } from './components/input/input.component';
import { SelectComponent } from './components/select/select.component';
import { CheckboxComponent } from './components/checkbox/checkbox.component';
import { TextareaComponent } from './components/textarea/textarea.component';

// Modules
const imports = [FormsModule, ReactiveFormsModule, CommonModule];

// Imported and exported elements
const elements = [
  // Components
  InputComponent,
  SelectComponent,
  CheckboxComponent,
  TextareaComponent,
];

@NgModule({
  declarations: elements,
  imports,
  exports: elements,
})
export class BaseComponentsModule {}
