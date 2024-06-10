import { Component, Input } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { NgClass } from '@angular/common';

@Component({
  selector: 'base-checkbox',
  templateUrl: './checkbox.component.html',
  styleUrls: ['./checkbox.component.scss'],
  standalone: true,
  imports: [
    ReactiveFormsModule,
    NgClass
  ]
})
export class CheckboxComponent {
  @Input() id: string;
  @Input() name: string;
  @Input() label?: string;
  @Input() value: string | number;
  @Input() control: any;
  @Input() required = false;
  @Input() objectPath = '';
}
