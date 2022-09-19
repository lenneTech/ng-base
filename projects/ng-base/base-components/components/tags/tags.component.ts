import { Component, Input } from '@angular/core';

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
  @Input() control: any;
  @Input() options?: { text: string; value: string }[];
  @Input() custom = true;
  @Input() removeByKey = true;
  @Input() required = false;
  inputValue = '';
  selectedElement: HTMLElement;

  /**
   * Convert id into text field
   */
  getReadableTag(tag: string) {
    if (this.control?.value && this.options) {
      const foundElement = this.options.find((e) => e.value === tag);

      if (foundElement) {
        return foundElement.text;
      } else {
        return tag;
      }
    } else {
      return tag;
    }
  }

  /**
   * Listen to enter keys
   *
   * @param event
   */
  enterKey(event: any): void {
    this.selectedElement = event.target;

    if (this.removeByKey && event.code === 'Backspace' && !this.inputValue) {
      this.removeTag();
      return;
    } else {
      if (event.code === 'Comma' || event.code === 'Space' || event.code === 'Enter') {
        this.addTag(this.inputValue);
      }
    }
  }

  /**
   * Add new tag
   *
   * @param tag
   */
  addTag(tag: string): void {
    if (tag.endsWith(',') || tag.endsWith(' ')) {
      tag = tag.slice(0, -1);
    }

    let foundOption;
    if (!this.options) {
      foundOption = { value: tag, text: tag };
    } else {
      foundOption = this.options.find((e) => e.text === tag);
    }

    if (!this.custom && !foundOption) {
      return;
    }

    this.selectedElement = null;

    if (!this.control.value) {
      this.control.setValue([]);
    }

    if (this.control.value?.length === 0) {
      this.control.setValue([foundOption.value]);
      this.inputValue = '';
      this.control.setErrors(null);
      return;
    }

    if (
      tag.length > 0 &&
      this.control.value &&
      !this.control.value.some((item: string) => item === foundOption.value)
    ) {
      this.control.setValue([...this.control.value, foundOption.value]);
      this.inputValue = '';
      this.control.setErrors(null);
    }
  }

  /**
   * Remove tag
   *
   * @param tag
   */
  removeTag(tag?: string): void {
    let foundOption;
    if (!this.options) {
      foundOption = { value: tag, text: tag };
    } else {
      foundOption = this.options.find((e) => e.value === tag);
    }

    this.control.markAsTouched();
    if (foundOption) {
      this.control.setValue(this.control.value.filter((item: string) => item !== foundOption.value));
    } else if (this.control.value) {
      this.control.value.splice(-1);
    }

    if (this.control.value?.length === 0) {
      this.control.setErrors({ required: true });
    }
  }

  /**
   * Filter options for drop down
   */
  filterOptions(): { text: string; value: string }[] {
    return this.options
      ? this.options.filter(
          (e) => (!this.inputValue || e?.text?.includes(this.inputValue)) && !this.control.value?.includes(e.value)
        )
      : [];
  }

  /**
   * Show dropdown focus
   */
  onFocus(event?) {
    if (event) {
      this.control.setErrors(null);
      this.selectedElement = event.target;
    } else {
      this.control.markAsTouched();

      setTimeout(() => {
        if (this.options && this.inputValue) {
          if (this.options.find((e) => e.text === this.inputValue)) {
            this.addTag(this.inputValue);
            this.control.setErrors(null);
          } else {
            this.inputValue = '';
          }
        }

        if (!this.control.value || this.control.value?.length === 0) {
          this.control.setErrors({ required: true });
        }

        this.selectedElement = null;
      }, 250);
    }
  }
}
