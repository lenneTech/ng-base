import { AbstractControl, FormGroup, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Custom validator to check that two fields match
 * (inspirated by https://jasonwatmore.com/post/2018/11/07/angular-7-reactive-forms-validation-example)
 */
export const MustMatch: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  return (formGroup: FormGroup) => {
    const baseControl = control.get('password');
    const matchingControl = control.get('passwordConfirm');

    if (matchingControl.errors && !matchingControl.errors.mustMatch) {
      // return if another validator has already found an error on the matchingControl
      return null;
    }

    // set error on matchingControl if validation fails
    if (baseControl.value !== matchingControl.value) {
      return { mustMatch: true };
    } else {
      return null;
    }
  };
};
