import { Inject, Injectable } from '@angular/core';
import { UntypedFormControl, UntypedFormGroup } from '@angular/forms';
import { DOCUMENT } from '@angular/common';
import { ScrollService } from './scroll.service';

@Injectable({
  providedIn: 'root',
})
export class FormsService {
  constructor(@Inject(DOCUMENT) private document: Document, private scrollService: ScrollService) {}

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

  public findInvalidControls(formGroup: UntypedFormGroup): string[] {
    const invalid: string[] = [];
    const controls = formGroup.controls;
    Object.keys(formGroup.controls).forEach((name) => {
      if (controls[name].invalid) {
        invalid.push(name);
      }
    });
    return invalid;
  }

  public scrollToInvalidControl(form: UntypedFormGroup) {
    const invalidForm: string = this.findInvalidControls(form)[0];
    this.scrollService.scrollTo(invalidForm);
  }
}
