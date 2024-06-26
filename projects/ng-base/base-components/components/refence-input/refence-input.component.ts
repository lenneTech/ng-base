import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { GraphQLRequestType, GraphQLService, SortOrderEnum } from '@lenne.tech/ng-base/shared';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';
import { NgClass } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { TagsComponent } from '../tags/tags.component';

@Component({
  selector: 'base-refence-input',
  templateUrl: './refence-input.component.html',
  styleUrls: ['./refence-input.component.scss'],
  standalone: true,
  imports: [
    NgClass,
    ReactiveFormsModule,
    FormsModule,
    TagsComponent
  ]
})
export class RefenceInputComponent implements OnInit, OnDestroy {
  @Input() id: string;
  @Input() name: string;
  @Input() infoText: string;
  @Input() label?: string;
  @Input() isList = false;
  @Input() search = true;
  @Input() useParamAsArg = false;
  @Input() param: string;
  @Input() placeholder?: string = '';
  @Input() autocomplete?: string;
  @Input() tabIndex?: number;
  @Input() control: any;
  @Input() required = false;
  @Input() method = 'find';
  @Input() fields = ['id', 'name'];
  @Input() valueField = 'id';
  @Input() objectPath = '';
  @Input() nameField: string[] | string = 'name';
  @Input() creationLink = '';
  objects: any[] = [];
  currentValue: any;
  optionsForTagInput = [];
  selectedElement: HTMLElement;
  subscription = new Subscription();

  constructor(private graphQLService: GraphQLService, private router: Router) {}

  async ngOnInit() {
    this.getReferences();

    this.subscription.add(
      this.control.valueChanges.subscribe(() => {
        if (!this.currentValue) {
          this.setValue();
        }
      })
    );
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  /**
   * Open creation link for new reference if enabled
   */
  openLink() {
    this.router.navigate([this.creationLink]);
  }

  /**
   * It gets the references from the GraphQL server and sets the value of the select
   */
  getReferences() {
    const fields = [...this.fields];

    if (Array.isArray(this.nameField)) {
      for (const field of this.nameField) {
        if (!fields.includes(field)) {
          fields.push(field);
        }
      }
    } else {
      if (!fields.includes(this.nameField)) {
        fields.push(this.nameField);
      }
    }

    let args;
    if (!this.useParamAsArg) {
      args = { sort: [{ field: fields.includes('name') ? 'name' : fields[0], order: SortOrderEnum.ASC }] };
    } else {
      args = {
        id: this.param,
        sort: [{ field: fields.includes('name') ? 'name' : fields[0], order: SortOrderEnum.ASC }],
      };
    }

    this.graphQLService
      .graphQl(this.method, {
        fields,
        arguments: args,
        type: GraphQLRequestType.QUERY,
      })
      .subscribe(async (result) => {
        if (result) {
          this.objects = result;
          this.setObjectsAsOptions();

          if (!this.currentValue) {
            this.setValue();
          }
        }
      });
  }

  /**
   * If the current value is not valid, set the control to an invalid state
   */
  checkValidReference() {
    if (!this.currentValue) {
      this.control.markAsTouched();
      this.control.markAsDirty();
      this.control.setValue('');
      this.control.setErrors(null);
      return;
    }

    const foundElement = this.objects.find((e) => this.checkForNameFields(e));
    if (!foundElement) {
      this.control.setValue(null);
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
    if (this.control?.value && this.objects?.length > 0) {
      if (this.control?.value?.id) {
        this.control.setValue(this.control.value.id);
      }

      const foundElement = this.objects.find((e) => e[this.valueField] === this.control.value);
      if (foundElement) {
        this.currentValue = this.prepareNameField(foundElement);
      }
    }
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
          (e) => (!this.currentValue || this.checkForNameFields(e)) && !this.control?.value?.includes(e?.value)
        )
      : [];
  }

  /**
   * It takes an array of objects and returns an array of objects with the text and value fields specified
   */
  setObjectsAsOptions() {
    this.optionsForTagInput = this.objects.map((e) => {
      return {
        text: this.prepareNameField(e),
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

  /**
   * Prepare string function if name fields is an array
   */
  prepareNameField(object: any) {
    let result;

    if (Array.isArray(this.nameField)) {
      for (const field of this.nameField) {
        if (!result) {
          result = object[field];
        } else if (object[field]) {
          result = result + ' ' + object[field];
        }
      }
    } else {
      result = object[this.nameField];
    }

    return result;
  }

  /**
   * Check function if name fields is an array
   */
  checkForNameFields(object: any) {
    if (Array.isArray(this.nameField)) {
      let result = false;

      for (const field of this.nameField) {
        const check = object[field].includes(this.currentValue);
        if (check) {
          result = check;
        }
      }

      return result;
    } else {
      return object[this.nameField]?.includes(this.currentValue);
    }
  }
}
