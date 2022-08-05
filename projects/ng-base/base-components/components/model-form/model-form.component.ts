import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import {
  AuthService,
  BasicUser,
  FormsService,
  GraphQLMeta,
  GraphQLMetaService,
  GraphQLRequestType,
  GraphQLService,
  GraphQLType,
  CmsService,
  IGraphQLTypeCollection,
} from '@lenne.tech/ng-base/shared';
import { AbstractControl, UntypedFormControl, UntypedFormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

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
  @Input() onlyUpdateMode = false;
  @Input() duplicate = false;
  @Input() logging = false;
  @Input() config: any = {};

  @Output() finished = new EventEmitter();

  meta: GraphQLMeta;
  form: UntypedFormGroup;
  loading = false;
  fields: Record<string, GraphQLType>;
  operation: string;
  keys: string[] = [];
  user: BasicUser;

  constructor(
    private graphQLMetaService: GraphQLMetaService,
    private graphQLService: GraphQLService,
    private formsService: FormsService,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private cmsService: CmsService
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
    // Reinit form for new model or load and patch form with new id
    if (changes['modelName'] || changes['id']) {
      this.init();
    }
  }

  /**
   * > If the model name and metadata are present, set the operation to update or create, get the fields from the
   * metadata, create the form, and if the value is present, patch the form with the value
   */
  init(id?: string) {
    if (id) {
      this.id = id;
    }

    if (!this.id && this.onlyUpdateMode) {
      return;
    }

    if (this.modelName && this.meta) {
      this.operation = this.id ? 'update' : 'create';
      this.fields = this.meta.getArgs(this.operation + this.capitalizeFirstLetter(this.modelName), {
        type: GraphQLRequestType.MUTATION,
      }).fields;
      this.fields = this.fields['input'].fields as any;
      this.keys = Object.keys(this.fields);

      if (this.logging) {
        console.log('ModelFormComponent::init->id', this.id);
        console.log('ModelFormComponent::init->fields', this.fields);
        console.log('ModelFormComponent::init->keys', this.keys);
      }

      this.form = this.createForm(this.fields);

      if (this.id) {
        this.getObjectById(this.id);
      }
    }
  }

  /**
   * It takes a key as an argument, and returns an array of keys from the sub-object
   */
  getKeysFromSubObject(key: string) {
    return Object.keys(this.fields[key]);
  }

  /**
   * It takes an id, and then calls the graphQLService to get the object from the database
   *
   * @param id - The id of the object to be loaded
   */
  getObjectById(id: string) {
    if (!id) {
      return;
    }

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
            if (this.config[key]?.type === 'Reference' && !this.fields[key]?.isList) {
              if (this.form.get(key)) {
                this.form
                  .get(key)
                  .patchValue(response[this.config[key]?.patchField ? this.config[key]?.patchField : key]?.id);
              }
            }

            // If value is an array
            if (this.config[key]?.type === 'Reference' && this.fields[key]?.isList) {
              if (this.form.get(key)) {
                this.form
                  .get(key)
                  .patchValue(
                    response[this.config[key]?.patchField ? this.config[key]?.patchField : key]?.map((e) => e?.id)
                  );
              }
            }
          }

          if (this.logging) {
            console.log('ModelFormComponent::getObjectById->patchedForm', this.form);
          }
        },
        error: (err) => {
          console.error('Error on load object', err);
          this.finished.emit(null);
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
      if (this.config[key]?.exclude !== undefined && this.config[key]?.exclude) {
        continue;
      }

      if (Object.keys(fields[key]?.fields)?.length === 0) {
        if (this.config[key]?.type !== 'Reference') {
          requestFields.push(key);
        } else {
          requestFields.push({ [this.config[key]?.patchField ? this.config[key]?.patchField : key]: ['id'] });
        }
      } else {
        const subkeys = this.createRequestObject(fields[key].fields as IGraphQLTypeCollection);
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
      if (Object.keys(value?.fields)?.length === 0) {
        group[key] = new UntypedFormControl(
          null,
          (this.config[key] && this.config[key]?.required !== undefined ? this.config[key]?.required : value.isRequired)
            ? Validators.required
            : []
        );
      } else {
        group[key] = this.createForm(fields[key].fields as IGraphQLTypeCollection);
      }
    }

    if (this.logging) {
      console.log('ModelFormComponent::createForm->group', group);
    }

    return new UntypedFormGroup(group);
  }

  /**
   * It calls the graphQLService to delete the object with the id of the object that is currently being edited
   */
  deleteObject() {
    this.cmsService.deleteObject(this.id, this.modelName).then(() => {
      this.finished.emit(null);
    });
  }

  /**
   * It sends a GraphQL mutation to the server to duplicate the object
   */
  async duplicateObject() {
    this.cmsService.duplicateObject(this.id, this.modelName).then(async (value) => {
      if (value?.id) {
        await this.router.navigate(['../' + value.id], { relativeTo: this.route });
        this.init(value.id);
      } else {
        this.finished.emit(null);
      }
    });
  }

  /**
   * It takes a string, capitalizes the first letter, and returns the modified string
   *
   * @param value - The string to capitalize.
   * @returns The first letter of the string is being capitalized and the rest of the string is being returned.
   */
  capitalizeFirstLetter(value: string) {
    return this.cmsService.capitalizeFirstLetter(value);
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

  /**
   * It takes the key of the form control that has changed, gets the value of that form control, creates an object with the
   * key and value, and then sends that object to the GraphQL server to update the database
   */
  imageChanged(key: string) {
    const data = {};
    data[key] = this.form.get(key).value;

    if (this.logging) {
      console.log('ModelFormComponent::imageChanged->body', data);
    }

    if (this.id) {
      try {
        this.graphQLService
          .graphQl('update' + this.capitalizeFirstLetter(this.modelName), {
            arguments: { id: this.id, input: data },
            fields: ['id'],
            type: GraphQLRequestType.MUTATION,
          })
          .subscribe({
            next: (value) => {
              if (this.logging) {
                console.log('ModelFormComponent::imageChanged->success', value);
              }
            },
          });
      } catch (e) {
        if (this.logging) {
          console.log('ModelFormComponent::imageChanged->error', e);
        }
      }
    }
  }

  /**
   * It takes the form, validates it, and then sends it to the GraphQL server
   *
   * @returns The id of the newly created or updated object.
   */
  submit(secret = false) {
    return new Promise((resolve, reject) => {
      if (!secret) {
        this.loading = true;
      }

      if (this.form.invalid && !secret) {
        this.formsService.validateAllFormFields(this.form as any);
        this.loading = false;
        reject();
        return;
      }

      if (this.operation === 'update' && !this.id) {
        console.error('ID is missing for update!');
        this.loading = false;
        reject();
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

        if (value && typeof value === 'object' && !Array.isArray(value)) {
          data[key] = Object.keys(data[key])
            .filter((k) => data[key][k] != null)
            .reduce((a, k) => ({ ...a, [k]: data[key][k] }), {});

          if (Object.keys(data[key])?.length === 0) {
            if (this.logging) {
              console.log('Object is empty from result');
            }
            data[key] = null;
          }
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
              this.finished.emit(null);
            }

            resolve(value);
          },
          error: (err) => {
            if (!secret) {
              console.error('Failed on ' + this.operation, err);
              this.loading = false;
            }

            reject();
          },
        });
    });
  }
}
