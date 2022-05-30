import { Component, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { AbstractControl, FormControl } from '@angular/forms';

@Component({
  selector: 'base-tags',
  templateUrl: './tags.component.html',
  styleUrls: ['./tags.component.scss'],
})
export class TagsComponent implements OnInit, OnChanges {
  @Input() id: string;
  @Input() name: string;
  @Input() label?: string = '';
  @Input() placeholder?: string = '';
  @Input() autocomplete?: string;
  @Input() tabIndex?: number;
  @Input() control: FormControl | AbstractControl;
  @Input() options?: string[] = [];
  @Input() custom = true;
  @Input() removeByKey = true;
  @Input() required = false;
  inputValue = '';
  filteredOptions: string[] = [];
  selectedElement: HTMLElement;

  ngOnInit() {
    this.setFilteredOptions();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['options']?.currentValue && changes['options']?.currentValue?.length > 0) {
      this.setFilteredOptions();
    }
  }

  /**
   * Listen to enter keys
   *
   * @param event
   */
  enterKey(event: KeyboardEvent): void {
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
    if (!this.control.value) {
      this.control.setValue([]);
    }
    this.selectedElement = null;

    if (tag.endsWith(',') || tag.endsWith(' ')) {
      tag = tag.slice(0, -1);
    }

    if (!this.custom && !this.options.find((e) => e === tag)) {
      return;
    }

    if (this.control.value?.length === 0) {
      this.control.setValue([tag]);
      this.inputValue = '';
      this.control.setErrors(null);
      return;
    }

    if (tag.length > 0 && this.control.value && !this.control.value.some((item: string) => item === tag)) {
      this.control.value.push(tag);
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
    this.selectedElement = null;
    if (tag) {
      this.control.setValue(this.control.value.filter((item: string) => item !== tag));
    } else {
      this.control.value.splice(-1);
    }

    if (this.control.value.length === 0) {
      this.control.setErrors({ required: true });
    }
  }

  /**
   * Filter options for drop down
   */
  setFilteredOptions() {
    if (this.options) {
      this.filteredOptions =
        this.options.filter((e) => e?.includes(this.inputValue) && !this.control.value.includes(e)) || [];
    }
  }

  /**
   * Show dropdown focus
   *
   * @param event
   */
  onFocus(event?) {
    if (!this.filteredOptions) {
      return;
    }

    if (event) {
      this.selectedElement = event.target;
    } else {
      setTimeout(() => {
        this.selectedElement = null;
      }, 100);
    }
  }
}
