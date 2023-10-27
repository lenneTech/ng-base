import { Inject, Injectable } from '@angular/core';
import { UntypedFormControl, UntypedFormGroup } from '@angular/forms';
import { DOCUMENT } from '@angular/common';
import { ScrollService } from './scroll.service';

@Injectable({
  providedIn: 'root',
})
export class FormsService {
  constructor(@Inject(DOCUMENT) private document: Document, private scrollService: ScrollService) {}

  public validateAllFormFields(formGroup: any) {
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
    return this.getInvalidControl(formGroup);
  }

  private getInvalidControl(formGroup: UntypedFormGroup, invalid?, parents: any = []) {
    let result = invalid ? [...invalid] : [];
    let nestedParents = [...[], ...parents];

    const controls = formGroup.controls;
    Object.keys(formGroup.controls).forEach((name) => {
      if (controls[name].invalid) {
        if ((controls[name] as any)?.controls) {
          nestedParents.push(name);
          result = this.getInvalidControl(controls[name] as any, result, nestedParents);
          nestedParents = [];
        } else {
          result.push(nestedParents.length ? nestedParents.join('.') + '.' + name : name);
        }
      }
    });

    return result;
  }

  public scrollToInvalidControl(form: any) {
    const invalidForm: string = this.findInvalidControls(form)[0];
    this.scrollService.scrollTo(invalidForm);
  }
}
