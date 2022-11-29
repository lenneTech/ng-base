import { CMSFieldConfig, CmsService, ToastService, ToastType } from '@lenne.tech/ng-base/shared';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { AbstractControl, UntypedFormControl } from '@angular/forms';
import { Button } from '../fab-button/fab-button.component';
import { ActivatedRoute, Router } from '@angular/router';

/**
 * Abstract Component for inputs and outputs only
 *
 * Hint for handling extensions of this component in project:
 * If you want to use complete custom services and methods, extend ModelFormComponent instead of ModelFormBaseComponent
 */
@Component({
  template: '',
})
export abstract class ModelFormBaseComponent implements OnInit {
  @Input() modelName: string;
  @Input() label: string;
  @Input() id: string | null;
  @Input() delete = true;
  @Input() onlyUpdateMode = false;
  @Input() duplicate = false;
  @Input() logging = false;
  @Input() config: { [key: string]: CMSFieldConfig } = null;
  @Input() showFavButton = true;

  @Output() finished = new EventEmitter();

  fabButtons: Button[] = [];
  operation: string;

  protected constructor(
    protected cmsService: CmsService,
    protected toastService: ToastService,
    protected router: Router,
    protected route: ActivatedRoute
  ) {}

  ngOnInit() {
    this.initFabActions();
  }

  /**
   * Init fab buttons for mobile devices
   */
  initFabActions() {
    const saveEvent = new EventEmitter<boolean>();
    this.fabButtons.push({ icon: 'bi-check-lg', color: 'var(--bs-success)', event: saveEvent });
    saveEvent.subscribe(() => this.submit());

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

  submit() {}

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

  formatDate(date) {
    if (!date) {
      return null;
    }
    const newDate = new Date(date);
    return newDate.toISOString().substring(0, 16);
  }
}
