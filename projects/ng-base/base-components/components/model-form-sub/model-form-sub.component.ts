import { Component, Input, OnInit } from '@angular/core';
import { AbstractControl, FormControl } from '@angular/forms';
import { AuthService, BasicUser } from '@lenne.tech/ng-base/shared';

@Component({
  selector: 'base-model-form-sub',
  templateUrl: './model-form-sub.component.html',
  styleUrls: ['./model-form-sub.component.scss'],
})
export class ModelFormSubComponent implements OnInit {
  @Input() fields: any;
  @Input() form: any;
  @Input() config: any = {};

  keys: string[] = [];
  user: BasicUser;

  constructor(private authService: AuthService) {}

  ngOnInit(): void {
    this.keys = Object.keys(this.fields);
    this.user = this.authService.currentUser;
  }

  /**
   * It takes a string, capitalizes the first letter, and returns the new string
   *
   * @param value - The string that you want to capitalize the first letter of.
   * @returns The first letter of the string is being capitalized and the rest of the string is being returned.
   */
  capitalizeFirstLetter(value: string) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  /**
   * It takes an AbstractControl and returns a FormControl
   *
   * @param control - AbstractControl | null | undefined
   * @returns A FormControl
   */
  transformToControl(control: AbstractControl | null | undefined) {
    return control as FormControl;
  }
}
