import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
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

  @Output() imageChanged = new EventEmitter();

  keys: string[] = [];
  user: BasicUser;

  constructor(private authService: AuthService) {}

  ngOnInit(): void {
    // Get keys
    const unsortedKeys = Object.keys(this.fields);

    // Sort keys by config order
    this.keys = unsortedKeys.sort((a, b) => {
      return (this.config[a]?.order ? this.config[a]?.order : 0) - (this.config[b]?.order ? this.config[b]?.order : 0);
    });

    // Set user for roles check
    this.user = BasicUser.map(this.authService.currentUser);
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
   * It takes an array of values and returns an array of objects with a value and text property
   *
   * @param values - any[] - the array of values that you want to convert to a selectable list
   * @param config
   * @returns An array of objects with a value and text property.
   */
  prepareEnumForSelect(values: any[], config = {}) {
    return values
      .filter((i) => {
        return !(config && config[i]?.roles && !this.user.hasAllRoles(config[i]?.roles));
      })
      .map((e) => {
        return {
          value: e,
          text: config && config[e]?.text ? config[e].text : e,
        };
      });
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
