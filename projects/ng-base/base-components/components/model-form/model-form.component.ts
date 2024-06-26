import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import {
  AuthService,
  BasicUser,
  CMSFieldConfig,
  CmsService,
  FileService,
  FormsService,
  fullEmail,
  GraphQLMeta,
  GraphQLMetaService,
  GraphQLRequestType,
  GraphQLService,
  GraphQLType,
  IGraphQLTypeCollection,
  ToastService,
  ToastType
} from '@lenne.tech/ng-base/shared';
import { AbstractControl, ReactiveFormsModule, UntypedFormControl, UntypedFormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Button, FabButtonComponent } from '../fab-button/fab-button.component';
import { ModelFormSubComponent } from '../model-form-sub/model-form-sub.component';
import { NgClass } from '@angular/common';

/**
 * ModelFormComponent
 *
 * Hint for handling extensions of this component in project:
 * If you want to use complete custom services and methods, extend ModelFormBaseComponent instead of ModelFormComponent
 */
@Component({
  selector: 'base-model-form',
  templateUrl: './model-form.component.html',
  styleUrls: ['./model-form.component.scss'],
  standalone: true,
  imports: [
    RouterLink,
    ReactiveFormsModule,
    ModelFormSubComponent,
    NgClass,
    FabButtonComponent
  ]
})
export class ModelFormComponent implements OnInit, OnChanges {
  @Input() modelName: string;
  @Input() label: string;
  @Input() id: string | null;
  @Input() delete = true;
  @Input() onlyUpdateMode = false;
  @Input() duplicate = false;
  @Input() logging = false;
  @Input() config: { [key: string]: CMSFieldConfig };
  @Input() showFavButton = true;

  @Output() finished = new EventEmitter();

  meta: GraphQLMeta;
  form: UntypedFormGroup;
  _loading = false;
  fields: Record<string, GraphQLType>;
  operation: string;
  keys: string[] = [];
  user: BasicUser;
  object: any;
  fabButtons: Button[] = [];
  fileChanges: [{ field: string; file: File | null }];

  set loading(value: boolean) {
    if (!value) {
      setTimeout(() => {
        this._loading = value;
      }, 400);
    } else {
      this._loading = value;
    }
  }

  constructor(
    private graphQLMetaService: GraphQLMetaService,
    private graphQLService: GraphQLService,
    private formsService: FormsService,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private cmsService: CmsService,
    private toastService: ToastService,
    private fileService: FileService
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

    this.initFabActions();
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

      if (this.logging) {
        console.log('ModelFormComponent::init->operation', this.operation);
        console.log(
          'ModelFormComponent::init->meta.getArgs',
          this.operation + this.capitalizeFirstLetter(this.modelName)
        );
      }

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

          this.object = response;
          this.form.patchValue({ ...{}, ...response });

          // Process patchFields for reference input
          for (const [key, value] of Object.entries(this.fields)) {
            if (
              this.nestedObject(key, this.fields)?.type === 'DateTime' ||
              this.nestedObject(key, this.config)?.type === 'DateTime'
            ) {
              this.form.get(key).patchValue(this.formatDate(this.nestedObject(key, response)));
            }

            // If it not an array
            if (
              this.nestedObject(key, this.config)?.type === 'Reference' &&
              !this.nestedObject(key, this.fields)?.isList
            ) {
              if (this.form.get(key)) {
                this.form
                  .get(key)
                  .patchValue(
                    response[
                      this.nestedObject(key, this.config)?.patchField
                        ? this.nestedObject(key, this.config)?.patchField
                        : key
                    ]?.id
                  );
              }
            }

            // If value is an array
            if (
              this.nestedObject(key, this.config)?.type === 'Reference' &&
              this.nestedObject(key, this.fields)?.isList
            ) {
              if (this.form.get(key)) {
                this.form
                  .get(key)
                  .patchValue(
                    response[
                      this.nestedObject(key, this.config)?.patchField
                        ? this.nestedObject(key, this.config)?.patchField
                        : key
                    ]?.map((e) => e?.id)
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
   * @param parents
   */
  createForm(fields: IGraphQLTypeCollection, parents: any[] = []) {
    const group: any = {};
    let internParents = [...[], ...parents];

    for (const [key, value] of Object.entries(fields)) {
      if (Object.keys(value?.fields)?.length === 0) {
        group[key] = new UntypedFormControl(
          null,
          this.processValidators(
            this.nestedObject(internParents.length ? internParents.join('.') + '.' + key : key, this.config),
            value
          )
        );
      } else {
        internParents.push(key);
        group[key] = this.createForm(fields[key].fields as IGraphQLTypeCollection, internParents);
        internParents = [];
      }
    }

    if (this.logging) {
      console.log('ModelFormComponent::createForm->group', group);
    }

    return new UntypedFormGroup(group);
  }

  /**
   * Process form validators for control
   */
  processValidators(config: any, value: IGraphQLTypeCollection | GraphQLType) {
    const validators = [];

    if (config) {
      if (config?.required !== undefined ? config?.required : value.isRequired) {
        validators.push(Validators.required);
      }

      if (config?.type === 'Email') {
        validators.push(fullEmail());
      }

      if (config?.type === 'Password') {
        validators.push(Validators.minLength(6));
      }

      if (typeof config?.min === 'number') {
        validators.push(Validators.min(config.min));
      }

      if (typeof config?.max === 'number') {
        validators.push(Validators.max(config.max));
      }

      if (Array.isArray(config?.validators)) {
        validators.push(...config?.validators);
      }
    }

    return validators;
  }

  /**
   * It calls the graphQLService to delete the object with the id of the object that is currently being edited
   */
  deleteObject() {
    this.cmsService.deleteObject(this.id, this.modelName).then(() => {
      this.toastService.show({
        id: this.modelName + '-success',
        type: ToastType.SUCCESS,
        title: 'Erfolgreich',
        description: this.label + ' wurde erfolgreich gelöscht.',
      });
      this.finished.emit(null);
    });
  }

  /**
   * It sends a GraphQL mutation to the server to duplicate the object
   */
  async duplicateObject() {
    this.cmsService.duplicateObject(this.id, this.modelName).then(async (value) => {
      if (value?.id) {
        await this.router.navigate(['../'], { relativeTo: this.route });
        this.toastService.show({
          id: this.modelName + '-success',
          type: ToastType.SUCCESS,
          title: 'Erfolgreich',
          description: this.label + ' wurde erfolgreich dupliziert.',
        });
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
    return new Promise(async (resolve, reject) => {
      if (!secret) {
        this.loading = true;
      }

      if (this.form.invalid && !secret) {
        this.formsService.validateAllFormFields(this.form as any);
        this.formsService.scrollToInvalidControl(this.form);
        this.loading = false;
        resolve(null);
        return;
      }

      if (this.operation === 'update' && !this.id) {
        console.error('ID is missing for update!');
        this.loading = false;
        resolve(null);
        return;
      }

      if (this.logging) {
        console.log('ModelFormComponent::submit->formValue', this.form.value);
      }

      // Prepare data for server request
      let data = Object.assign({}, this.form.value);
      data = this.prepareDataForRequest(this.config, this.fields, data);

      if (this.logging) {
        console.log('ModelFormComponent::submit->valueToGraphql', data);
        console.log('ModelFormComponent::submit->fileChanges', this.fileChanges);
      }

      if (this.fileChanges?.length) {
        for (const fileChange of this.fileChanges) {
          const key = fileChange.field;
          const config = this.nestedObject(key, this.config);

          if (fileChange.file) {
            // Upload
            const value = this.form.get(key).value;

            // Check if file is an ID or a base64 string
            if (typeof value === 'string') {
              // Delete if ID
              if (!this.form.get(key).value?.startsWith('data:')) {
                const deleteResult = await this.fileService.delete(
                  this.nestedObject(key, this.config)?.url,
                  this.nestedObject(key, this.config)?.deletePath || '/files/',
                  this.nestedObject(key, this.object)
                );

                if (deleteResult) {
                  this.nestedObject(key, data, '');
                }
              }

              const uploadResult = await this.fileService.upload(
                this.nestedObject(key, this.config)?.url,
                this.nestedObject(key, this.config)?.uploadPath || '/files/upload',
                fileChange.file
              );

              if (uploadResult?.id) {
                this.nestedObject(key, data, uploadResult.id);
              }
            } else if (config?.imageMode && config?.imageMode !== 'file') {
              // Delete
              const result = await this.fileService.delete(
                config?.url,
                this.nestedObject(key, this.config)?.deletePath || '/files/',
                this.nestedObject(key, this.object)
              );

              if (result) {
                this.nestedObject(key, data, '');
              }
            }
          }
        }
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
              this.toastService.show({
                id: this.modelName + '-success',
                type: ToastType.SUCCESS,
                title: 'Erfolgreich',
                description:
                  this.label + ' wurde erfolgreich ' + (this.operation === 'create' ? 'erstellt.' : 'aktualisiert.'),
              });
            }

            resolve(value);
          },
          error: (err) => {
            if (!secret) {
              console.error('Failed on ' + this.operation, err);
              this.loading = false;

              this.toastService.show({
                id: this.modelName + '-success',
                type: ToastType.ERROR,
                description:
                  'Beim ' +
                  (this.operation === 'create' ? 'erstellen' : 'aktualisieren') +
                  ' von ' +
                  this.label +
                  ' ist etwas schiefgelaufen.',
              });
            }

            reject();
          },
        });
    });
  }

  /**
   * Prepare data for server
   */
  prepareDataForRequest(config, fieldsConfig, data) {
    if (!data) {
      return data;
    }

    for (const [key, value] of Object.entries(data)) {
      if ((this.fields[key]?.type === 'DateTime' || this.config[key]?.type === 'DateTime') && value === '') {
        data[key] = null;
        continue;
      }

      if ((config[key]?.roles ? !this.user.hasAllRoles(config[key]?.roles) : false) || config[key]?.exclude) {
        delete data[key];
        continue;
      }

      if (value && typeof value === 'object' && !Array.isArray(value) && this.fields[key]?.type !== 'Upload') {
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
      if (fieldsConfig[key]?.type === 'Float') {
        if (value) {
          data[key] = Number(value);
        } else {
          data[key] = null;
        }
      }

      if (fieldsConfig[key]?.fields && Object.keys(fieldsConfig[key]?.fields).length > 0) {
        data[key] = this.prepareDataForRequest(config[key]?.fields, fieldsConfig[key]?.fields, data[key]);
      }
    }

    return data;
  }

  /**
   * Init fab buttons for mobile devices
   */
  initFabActions() {
    const saveEvent = new EventEmitter<boolean>();
    this.fabButtons.push({ icon: 'bi-check-lg', color: 'var(--bs-success)', event: saveEvent });
    saveEvent.subscribe(() => this.submit(false));

    if (this.duplicate && this.operation === 'update') {
      const event = new EventEmitter<boolean>();
      this.fabButtons.push({ icon: 'bi-back', color: 'var(--bs-info)', event });
      event.subscribe(() => this.duplicateObject());
    }

    if (this.operation === 'update' && this.delete) {
      const event = new EventEmitter<boolean>();
      this.fabButtons.push({ icon: 'bi-trash3', color: 'var(--bs-danger)', event });
      event.subscribe(() => this.deleteObject());
    }
  }

  /**
   * Set file changes for process
   */
  processFileChanges(event: { field: string; file: File | null; base64: string | null }) {
    const index = this.fileChanges?.findIndex((e) => e.field === event.field);

    if (index !== undefined && index !== -1) {
      this.fileChanges[index] = event;
    } else if (this.fileChanges) {
      this.fileChanges.push(event);
    } else {
      this.fileChanges = [event];
    }
  }

  private formatDate(date) {
    if (!date) {
      return null;
    }
    const newDate = new Date(date);
    return newDate.toISOString().substring(0, 16);
  }

  private nestedObject(key: string, nestedObject: any, value?: any) {
    const props = key.split('.');
    let result: any = nestedObject;

    for (let i = 0; i < props.length; i++) {
      if (value && i === props.length - 1) {
        result[props[i]] = value;
        return result[props[i]];
      }

      result =
        result[props[i]]?.fields && Object.keys(result[props[i]]?.fields)?.length > 0
          ? result[props[i]]?.fields
          : result[props[i]];
    }

    return result;
  }
}
