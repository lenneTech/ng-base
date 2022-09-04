import { AbstractControl, ValidatorFn } from '@angular/forms';

export function fullEmail(): ValidatorFn {
  return (control: AbstractControl) => {
    const EMAIL_REGEXP =
      /^(([^<>()\[\]\.,;:\s@\"]+(\.[^<>()\[\]\.,;:\s@\"]+)*)|(\".+\"))@(([^<>()[\]\.,;:\s@\"]+\.)+[^<>()[\]\.,;:\s@\"]{2,})$/i;
    return !EMAIL_REGEXP.test(control.value) ? { invalidEmail: true } : null;
  };
}
