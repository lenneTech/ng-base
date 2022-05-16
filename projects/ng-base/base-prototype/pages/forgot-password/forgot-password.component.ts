import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { FormsService } from '@lenne.tech/ng-base/shared';

@Component({
  selector: 'base-forgot-password',
  templateUrl: './forgot-password.component.html',
  styleUrls: ['./forgot-password.component.scss'],
})
export class ForgotPasswordComponent implements OnInit {
  form: FormGroup;

  constructor(private formsService: FormsService) {}

  ngOnInit(): void {
    this.createForm();
  }

  /**
   * Create login form
   */
  createForm() {
    this.form = new FormGroup({
      email: new FormControl('', [Validators.required, Validators.email]),
    });
  }

  /**
   * Submit form
   */
  submit() {
    if (this.form.invalid) {
      this.formsService.validateAllFormFields(this.form);
      return;
    }
  }
}
