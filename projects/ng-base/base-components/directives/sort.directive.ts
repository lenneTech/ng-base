import { Directive, ElementRef, EventEmitter, HostListener, Inject, Input, Output, Renderer2 } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Sort } from '@lenne.tech/ng-base/shared';

@Directive({
  selector: '[baseSort]',
  standalone: true,
})
export class SortDirective {
  @Input() baseSort: Array<any>;
  @Output() baseSorted = new EventEmitter<Array<any>>();
  constructor(private renderer: Renderer2, private targetElem: ElementRef, @Inject(DOCUMENT) document: Document) {}

  /**
   * Sorts columns on click
   */
  @HostListener('click')
  sortColumn(): void {
    const items = document.getElementsByTagName('th');
    for (let i = 0; i < items.length; i++) {
      items[i].classList.remove('asc');
      items[i].classList.remove('desc');
    }

    const sort = new Sort();

    const elem = this.targetElem.nativeElement;

    const order = elem.getAttribute('data-order');

    const type = elem.getAttribute('data-type');

    const property = elem.getAttribute('data-name');
    if (order === 'desc') {
      this.baseSorted.emit([...this.baseSort].sort(sort.startSort(property, order, type)));
      elem.setAttribute('data-order', 'asc');
      elem.classList.remove('desc');
      elem.classList.add('asc');
    } else {
      this.baseSorted.emit([...this.baseSort].sort(sort.startSort(property, order, type)));
      elem.setAttribute('data-order', 'desc');
      elem.classList.remove('asc');
      elem.classList.add('desc');
    }
  }
}
