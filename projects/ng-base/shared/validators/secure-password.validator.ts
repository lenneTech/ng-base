import { AbstractControl, ValidatorFn } from '@angular/forms';

export function securePasswordValidator(): ValidatorFn {
  return (control: AbstractControl) => {
    const PASSWORD_REGEX = /^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9])(?=.*?[#?!@$%^&*-]).{8,}$/i;
    return !PASSWORD_REGEX.test(control.value) ? { invalidSecurePassword: true } : null;
  };
}
