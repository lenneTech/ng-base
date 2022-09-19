import { AbstractControl, ValidatorFn } from '@angular/forms';

export function securePasswordValidator(): ValidatorFn {
  return (control: AbstractControl) => {
    const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/i;
    return !PASSWORD_REGEX.test(control.value) ? { invalidSecurePassword: true } : null;
  };
}
