import { AbstractControl } from '@angular/forms';

export function fullEmail(): any {
  return (control: AbstractControl) => {
    const EMAIL_REGEXP =
      /^(([^<>()\[\]\.,;:\s@\"]+(\.[^<>()\[\]\.,;:\s@\"]+)*)|(\".+\"))@(([^<>()[\]\.,;:\s@\"]+\.)+[^<>()[\]\.,;:\s@\"]{2,})$/i;
    return !EMAIL_REGEXP.test(control.value) ? { invalidEmail: true } : null;
  };
}
