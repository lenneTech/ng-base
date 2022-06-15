import { Directive, ElementRef, HostListener, Inject, Input, Renderer2 } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Sort } from '../classes/sort.class';

@Directive({
  selector: '[baseSort]',
})
export class SortDirective {
  @Input() lcSort: Array<any>;
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
      this.lcSort.sort(sort.startSort(property, order, type));
      elem.setAttribute('data-order', 'asc');
      elem.classList.remove('desc');
      elem.classList.add('asc');
    } else {
      this.lcSort.sort(sort.startSort(property, order, type));
      elem.setAttribute('data-order', 'desc');
      elem.classList.remove('asc');
      elem.classList.add('desc');
    }
  }
}
