import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { FormsService, MustMatch } from '@lenne.tech/ng-base';

@Component({
  selector: 'base-register',
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss'],
})
export class RegisterComponent implements OnInit {
  form: FormGroup;

  constructor(private formsService: FormsService) {}

  ngOnInit(): void {
    this.createForm();
  }

  /**
   * Create login form
   */
  createForm() {
    this.form = new FormGroup(
      {
        firstName: new FormControl('', [Validators.required]),
        lastName: new FormControl('', [Validators.required]),
        email: new FormControl('', [Validators.required, Validators.email]),
        password: new FormControl('', Validators.required),
        passwordConfirm: new FormControl('', Validators.required),
      },
      {
        validators: MustMatch,
      }
    );
  }

  /**
   * Submit login form
   */
  submit() {
    if (this.form.invalid) {
      this.formsService.validateAllFormFields(this.form);
      return;
    }
  }
}
