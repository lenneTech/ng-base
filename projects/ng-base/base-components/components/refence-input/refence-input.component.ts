import { Component, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { GraphQLRequestType, GraphQLService } from '@lenne.tech/ng-base/shared';

@Component({
  selector: 'base-refence-input',
  templateUrl: './refence-input.component.html',
  styleUrls: ['./refence-input.component.scss'],
})
export class RefenceInputComponent implements OnInit, OnChanges {
  @Input() id: string;
  @Input() name: string;
  @Input() label?: string;
  @Input() isList = false;
  @Input() placeholder?: string = '';
  @Input() autocomplete?: string;
  @Input() tabIndex?: number;
  @Input() control: any;
  @Input() required = false;
  @Input() method = 'find';
  @Input() fields = ['id', 'name'];
  @Input() valueField = 'id';
  @Input() textField = 'name';
  objects: any[] = [];
  currentValue: any;
  optionsForTagInput = [];
  selectedElement: HTMLElement;

  constructor(private graphQLService: GraphQLService) {}

  async ngOnInit() {
    this.graphQLService
      .graphQl(this.method, {
        fields: this.fields,
        type: GraphQLRequestType.QUERY,
      })
      .subscribe(async (result) => {
        if (result) {
          this.objects = result;
          this.setObjectsAsOptions();
          await this.setValue();
        }
      });
  }

  async ngOnChanges(changes: SimpleChanges) {
    if (changes['control'] && this.objects) {
      await this.setValue();
    }
  }

  /**
   * If the current value is not valid, set the control to an invalid state
   */
  checkValidReference() {
    if (!this.currentValue) {
      this.control.markAsTouched();
      this.control.markAsDirty();
      this.control.setErrors(null);
      return;
    }

    const foundElement = this.objects.find((e) => e[this.valueField] === this.currentValue);
    if (!foundElement) {
      this.control.setValue('INVALID_REFERENCE');
      this.control.markAsTouched();
      this.control.markAsDirty();
      this.control.setErrors({ invalidReference: true });
    } else {
      this.control.setErrors(null);
    }
  }

  /**
   * If the user presses the enter key, mark the control as touched
   */
  enterKey(event) {
    this.selectedElement = event.target;
    this.control.markAsTouched();
  }

  /**
   * If the control has a value and the objects array is not empty, then find the object in the array that has the same
   * value as the control's value and set the currentValue to the textField of that object. If the control has a value but
   * the objects array is empty, then set the currentValue to the control's value
   */
  setValue() {
    return new Promise((resolve, reject) => {
      if (this.control?.value && this.objects) {
        const foundElement = this.objects.find((e) => e[this.valueField] === this.control.value);

        if (foundElement) {
          this.currentValue = foundElement[this.textField];
          resolve(true);
        } else {
          this.currentValue = this.control.value;
          resolve(true);
        }
      } else {
        resolve(true);
      }
    });
  }

  /**
   * It sets the value of the control to the id of the selected option
   */
  set(id: string) {
    this.control.markAsTouched();
    this.control.markAsDirty();
    this.control.setValue(id);
    this.setValue();
    this.selectedElement = null;
  }

  /**
   * Filter options for drop down
   */
  filterOptions(): any[] {
    return this.objects
      ? this.objects.filter(
          (e) =>
            (!this.currentValue || e[this.textField]?.includes(this.currentValue)) &&
            !this.control?.value?.includes(e?.value)
        )
      : [];
  }

  /**
   * It takes an array of objects and returns an array of objects with the text and value fields specified
   */
  setObjectsAsOptions() {
    this.optionsForTagInput = this.objects.map((e) => {
      return {
        text: e[this.textField],
        value: e[this.valueField],
      };
    });
  }

  /**
   * Show dropdown focus
   */
  onFocus(event?) {
    if (event) {
      this.selectedElement = event.target;
    } else {
      this.checkValidReference();
      setTimeout(() => {
        this.selectedElement = null;
      }, 250);
    }
  }
}
