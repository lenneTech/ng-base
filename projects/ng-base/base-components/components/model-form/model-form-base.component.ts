import { CMSFieldConfig } from '@lenne.tech/ng-base/shared';
import { Component, EventEmitter, Input, Output } from '@angular/core';

/**
 * Abstract Component for inputs and outputs only
 *
 * Hint for handling extensions of this component in project:
 * If you want to use complete custom services and methods, extend ModelFormComponent instead of ModelFormBaseComponent
 */
@Component({
  selector: 'base-model-form',
  templateUrl: './model-form.component.html',
  styleUrls: ['./model-form.component.scss'],
})
export abstract class ModelFormBaseComponent {
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
}
