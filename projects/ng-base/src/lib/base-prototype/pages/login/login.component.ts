import { Component, OnInit } from '@angular/core';
import { FormsService } from '../../../base/services/forms.service';
import { FormControl, FormGroup, Validators } from '@angular/forms';

@Component({
  selector: 'base-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent implements OnInit {
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
      password: new FormControl('', Validators.required),
    });
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
