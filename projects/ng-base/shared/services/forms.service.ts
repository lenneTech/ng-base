import { Injectable } from '@angular/core';
import { UntypedFormGroup, UntypedFormControl } from '@angular/forms';

@Injectable({
  providedIn: 'root',
})
export class FormsService {
  public validateAllFormFields(formGroup: UntypedFormGroup) {
    Object.keys(formGroup.controls).forEach((field) => {
      const control = formGroup.get(field);
      if (control instanceof UntypedFormControl) {
        control.markAsTouched({ onlySelf: true });
      } else if (control instanceof UntypedFormGroup) {
        this.validateAllFormFields(control);
      }
    });
  }
}
