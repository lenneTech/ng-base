import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { AbstractControl, UntypedFormControl } from '@angular/forms';
import { AuthService, BasicUser, CMSFieldConfig, GraphQLType } from '@lenne.tech/ng-base/shared';

@Component({
  selector: 'base-model-form-sub',
  templateUrl: './model-form-sub.component.html',
  styleUrls: ['./model-form-sub.component.scss'],
})
export class ModelFormSubComponent implements OnInit {
  @Input() id: string;
  @Input() parentKey: string;
  @Input() fields: Record<string, GraphQLType>;
  @Input() form: any;
  @Input() config: { [key: string]: CMSFieldConfig };

  @Output() imageChanged = new EventEmitter<string>();
  @Output() fileChanged = new EventEmitter<{ field: string; file: File | null; base64: string | null }>();

  keys: string[] = [];
  user: BasicUser;
  objectPath: string;

  constructor(private authService: AuthService) {}

  ngOnInit(): void {
    // Get keys
    const unsortedKeys = Object.keys(this.fields);

    // Sort keys by config order
    this.keys = unsortedKeys.sort((a, b) => {
      return (
        (this.config[a]?.order ? this.config[a]?.order : 99) - (this.config[b]?.order ? this.config[b]?.order : 99)
      );
    });

    // Set user for roles check
    this.user = BasicUser.map(this.authService.currentUser);

    if (this.parentKey) {
      if (!this.objectPath) {
        this.objectPath = this.parentKey;
      } else {
        this.objectPath = this.objectPath + '.' + this.parentKey;
      }
    }
  }

  /**
   * If the field has fields, return true, otherwise return false.
   */
  checkFieldHasFields(field: GraphQLType) {
    return Object.keys(field.fields)?.length !== 0;
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
    return control as UntypedFormControl;
  }
}
