import { Component, Input } from '@angular/core';
import { AbstractControl, FormControl } from '@angular/forms';

@Component({
  selector: 'base-tags',
  templateUrl: './tags.component.html',
  styleUrls: ['./tags.component.scss'],
})
export class TagsComponent {
  @Input() id: string;
  @Input() name: string;
  @Input() label?: string = '';
  @Input() placeholder?: string = '';
  @Input() autocomplete?: string;
  @Input() tabIndex?: number;
  @Input() control: FormControl | AbstractControl;
  @Input() required = false;
  inputValue = '';

  /**
   * Listen to enter keys
   *
   * @param event
   */
  enterKey(event: KeyboardEvent): void {
    if (event.code === 'Backspace' && !this.inputValue) {
      this.removeTag();
      return;
    } else {
      if (event.code === 'Comma' || event.code === 'Space' || event.code === 'Enter') {
        this.addTag(this.inputValue);
        this.inputValue = '';
      }
    }
  }

  /**
   * Add new tag
   *
   * @param tag
   */
  addTag(tag: string): void {
    if (!this.control.value) {
      this.control.setValue([]);
    }

    if (tag.endsWith(',') || tag.endsWith(' ')) {
      tag = tag.slice(0, -1);
    }

    if (tag.length > 0 && this.control.value && !this.control.value.some((item: string) => item === tag)) {
      this.control.value.push(tag);
      this.control.setErrors(null);
    }
  }

  /**
   * Remove tag
   *
   * @param tag
   */
  removeTag(tag?: string): void {
    if (tag) {
      this.control.setValue(this.control.value.filter((item: string) => item !== tag));
    } else {
      this.control.value.splice(-1);
    }

    if (this.control.value.length === 0) {
      this.control.setErrors({ required: true });
    }
  }
}
