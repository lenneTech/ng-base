import { AfterViewChecked, Directive, ElementRef, HostListener, Input } from '@angular/core';

/**
 * Set same height (maximum) to different elements
 */
@Directive({
  selector: '[ltMatchHeight]',
})
export class MatchHeightDirective implements AfterViewChecked {
  // class name to match height
  @Input()
  ltMatchHeight: string | string[];

  constructor(private el: ElementRef) {}

  @HostListener('window:resize')
  onResize() {
    this.matchHeight(this.el.nativeElement, this.ltMatchHeight);
  }

  ngAfterViewChecked() {
    this.matchHeight(this.el.nativeElement, this.ltMatchHeight);
  }

  matchHeight(parent: HTMLElement, target: string | string[]) {
    if (!parent) {
      return;
    }

    let classNames;
    if (!Array.isArray(target)) {
      classNames = [target];
    } else {
      classNames = target;
    }

    classNames.forEach((className) => {
      // find all child structureElements with the selected class name
      const children = parent.getElementsByClassName(className);

      if (!children) {
        return;
      }

      // reset all children height
      Array.from(children).forEach((x: HTMLElement) => {
        x.style.height = 'initial';
      });

      // get all the child structureElements heights
      const itemHeights = Array.from(children).map((x) => x.getBoundingClientRect().height);

      // find out the tallest one
      const maxHeight = itemHeights.reduce((prev, curr) => (curr > prev ? curr : prev), 0);

      // update the child structureElements height to the tallest one
      Array.from(children).forEach((x: HTMLElement) => (x.style.height = `${maxHeight}px`));
    });
  }
}
