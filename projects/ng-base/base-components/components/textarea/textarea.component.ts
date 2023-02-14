import { Component, ElementRef, Input, OnChanges, SimpleChanges, ViewChild } from '@angular/core';

@Component({
  selector: 'base-textarea',
  templateUrl: './textarea.component.html',
  styleUrls: ['./textarea.component.scss'],
})
export class TextareaComponent implements OnChanges {
  @ViewChild('textarea') textarea: ElementRef;
  @Input() id: string;
  @Input() name: string;
  @Input() infoText: string;
  @Input() label?: string = '';
  @Input() placeholder?: string = '';
  @Input() control: any;
  @Input() rows = 5;
  @Input() required = false;
  @Input() autoHeight = true;
  @Input() tabIndex?: number;
  @Input() objectPath = '';

  ngOnChanges(changes: SimpleChanges) {
    if (changes['control'] && this.autoHeight) {
      setTimeout(() => {
        this.adjustInitHeight();
      }, 350);
    }
  }

  adjustInitHeight() {
    if (!this.textarea || !this.autoHeight) {
      return;
    }

    this.textarea.nativeElement.style.cssText = 'height:auto;';
    this.textarea.nativeElement.style.cssText = 'height:' + (this.textarea.nativeElement.scrollHeight + 5) + 'px';
  }

  adjustHeight(event) {
    if (!this.autoHeight) {
      return;
    }

    setTimeout(() => {
      event.target.style.cssText = 'height:auto;';
      // for box-sizing other than "content-box" use:
      // el.style.cssText = '-moz-box-sizing:content-box';
      event.target.style.cssText = 'height:' + (event.target.scrollHeight + 5) + 'px';
    }, 0);
  }
}
