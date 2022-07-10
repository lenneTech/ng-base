import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import {
  AuthService,
  BasicUser,
  FormsService,
  GraphQLMeta,
  GraphQLMetaService,
  GraphQLRequestType,
  GraphQLService,
} from '@lenne.tech/ng-base/shared';
import { AbstractControl, FormControl, FormGroup, Validators } from '@angular/forms';
import { IGraphQLTypeCollection } from '@lenne.tech/ng-base/shared';

@Component({
  selector: 'base-model-form',
  templateUrl: './model-form.component.html',
  styleUrls: ['./model-form.component.scss'],
})
export class ModelFormComponent implements OnInit, OnChanges {
  @Input() modelName: string;
  @Input() label: string;
  @Input() id: string | null;
  @Input() delete = true;
  @Input() logging = false;
  @Input() config: any = {};

  @Output() finished = new EventEmitter();

  meta: GraphQLMeta;
  form: FormGroup;
  loading = false;
  fields: any;
  operation: string;
  keys: string[] = [];
  user: BasicUser;

  constructor(
    private graphQLMetaService: GraphQLMetaService,
    private graphQLService: GraphQLService,
    private formsService: FormsService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    // Set user for roles check
    this.user = BasicUser.map(this.authService.currentUser);

    this.graphQLMetaService.getMeta().subscribe((meta) => {
      this.meta = meta;

      if (this.modelName) {
        this.init();
      }
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['modelName'] || changes['value']) {
      this.init();
    }
  }

  /**
   * > If the model name and meta data are present, set the operation to update or create, get the fields from the meta
   * data, create the form, and if the value is present, patch the form with the value
   */
  init() {
    if (this.modelName && this.meta) {
      this.operation = this.id ? 'update' : 'create';
      this.fields = this.meta.getArgs(this.operation + this.capitalizeFirstLetter(this.modelName), {
        type: GraphQLRequestType.MUTATION,
      });
      this.fields = this.fields['input'] as any;
      this.keys = Object.keys(this.fields);

      if (this.logging) {
        console.log('ModelFormComponent::init->fields', this.fields);
        console.log('ModelFormComponent::init->keys', this.keys);
      }

      this.form = this.createForm(this.fields);

      if (this.id) {
        this.getObjectById(this.id);
      }
    }
  }

  getKeysFromSubObject(key: string) {
    return Object.keys(this.fields[key]);
  }

  /**
   * It takes an id, and then calls the graphQLService to get the object from the database
   *
   * @param id - The id of the object to be loaded
   */
  getObjectById(id: string) {
    if (this.logging) {
      console.log('ModelFormComponent::getObjectById->id', id);
      console.log('ModelFormComponent::getObjectById->requestFields', this.createRequestObject(this.fields));
    }

    this.graphQLService
      .graphQl('get' + this.capitalizeFirstLetter(this.modelName), {
        arguments: { id },
        fields: this.createRequestObject(this.fields),
        type: GraphQLRequestType.QUERY,
      })
      .subscribe({
        next: (response) => {
          if (this.logging) {
            console.log('ModelFormComponent::get->value', response);
          }

          this.form.patchValue({ ...{}, ...response });

          // Process patchFields for reference input
          for (const [key, value] of Object.entries(this.config)) {
            // If it not an array
            if (this.config[key]?.patchField && !this.fields[key]?.isList) {
              this.form.get(key).patchValue(response[this.config[key]?.patchField]?.id);
            }

            // If value is an array
            if (this.config[key]?.patchField && this.fields[key]?.isList) {
              this.form.get(key).patchValue(response[this.config[key]?.patchField]?.map((e) => e?.id));
            }
          }

          if (this.logging) {
            console.log('ModelFormComponent::getObjectById->patchedForm', this.form);
          }
        },
        error: (err) => {
          console.error('Error on load object', err);
          this.finished.emit(false);
        },
      });
  }

  /**
   * It takes a GraphQL type collection and returns an array of strings and objects
   *
   * @param fields - IGraphQLTypeCollection - This is the object that is returned from the
   * introspection query.
   * @returns An array of strings and objects.
   */
  createRequestObject(fields: IGraphQLTypeCollection) {
    const requestFields: any = [];

    for (const [key, value] of Object.entries(fields)) {
      if (fields[key]?.type) {
        if (!this.config[key]?.patchField) {
          requestFields.push(key);
        } else {
          requestFields.push({ [this.config[key]?.patchField]: ['id'] });
        }
      } else {
        const subkeys = this.createRequestObject(fields[key] as IGraphQLTypeCollection);
        const resultObject = {};
        resultObject[key] = subkeys;
        requestFields.push(resultObject);
      }
    }

    if (this.logging) {
      console.log('ModelFormComponent::createRequestObject->requestFields', requestFields);
    }

    return requestFields;
  }

  /**
   * It takes a collection of GraphQL types and creates a form group with a form control for each type
   *
   * @param fields - IGraphQLTypeCollection
   */
  createForm(fields: IGraphQLTypeCollection) {
    const group: any = {};

    for (const [key, value] of Object.entries(fields)) {
      if (value?.type) {
        group[key] = new FormControl(
          value?.type === 'Float' ? null : '',
          (this.config[key] && this.config[key]?.required !== undefined ? this.config[key]?.required : value.isRequired)
            ? Validators.required
            : []
        );
      } else {
        group[key] = this.createForm(fields[key] as IGraphQLTypeCollection);
      }
    }

    if (this.logging) {
      console.log('ModelFormComponent::createForm->group', group);
    }

    return new FormGroup(group);
  }

  /**
   * It calls the graphQLService to delete the object with the id of the object that is currently being edited
   */
  deleteObject() {
    if (confirm('Möchtest du das Objekt wirklich löschen?')) {
      this.graphQLService
        .graphQl('delete' + this.capitalizeFirstLetter(this.modelName), {
          arguments: { id: this.id },
          fields: ['id'],
          type: GraphQLRequestType.MUTATION,
        })
        .subscribe({
          next: (value) => {
            this.finished.emit(true);
          },
          error: (err) => {
            console.error('Error on delete object', err);
          },
        });
    }
  }

  /**
   * It takes a string, capitalizes the first letter, and returns the modified string
   *
   * @param value - The string to capitalize.
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

  /**
   * It takes the form, validates it, and then sends it to the GraphQL server
   *
   * @returns The id of the newly created or updated object.
   */
  submit(secret = false) {
    if (!secret) {
      this.loading = true;
    }

    if (this.form.invalid && !secret) {
      this.formsService.validateAllFormFields(this.form as any);
      this.loading = false;
      return;
    }

    if (this.operation === 'update' && !this.id) {
      console.error('ID is missing for update!');
      this.loading = false;
      return;
    }

    if (this.logging) {
      console.log('ModelFormComponent::submit->formValue', this.form.value);
    }

    const data = Object.assign({}, this.form.value);
    for (const [key, value] of Object.entries(data)) {
      if (
        (this.config[key]?.roles ? !this.user.hasAllRoles(this.config[key]?.roles) : false) ||
        this.config[key]?.exclude
      ) {
        delete data[key];
      }

      // Set type for graphql method
      if (this.fields[key]?.type === 'Float') {
        data[key] = Number(value);
      }
    }

    if (this.logging) {
      console.log('ModelFormComponent::submit->valueToGraphql', data);
    }

    this.graphQLService
      .graphQl(this.operation + this.capitalizeFirstLetter(this.modelName), {
        arguments: this.operation === 'update' ? { id: this.id, input: data } : { input: data },
        fields: ['id'],
        type: GraphQLRequestType.MUTATION,
      })
      .subscribe({
        next: (value) => {
          if (!secret) {
            this.loading = false;
            this.finished.emit(true);
          }
        },
        error: (err) => {
          if (!secret) {
            console.error('Failed on ' + this.operation, err);
            this.loading = false;
          }
        },
      });
  }
}
