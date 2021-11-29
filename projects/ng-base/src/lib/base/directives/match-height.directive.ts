import { AfterViewChecked, Directive, ElementRef, HostListener, Inject, Input, PLATFORM_ID } from '@angular/core';
import { ImageService } from '../services/image.service';
import { isPlatformBrowser } from '@angular/common';

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

  // Replace lazy loading images with immediate loading images
  @Input()
  loadLazyImages = true;

  // Wether current platform is a browser
  readonly isBrowser: boolean;

  constructor(protected el: ElementRef, protected imageService: ImageService, @Inject(PLATFORM_ID) platformId: string) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  @HostListener('window:resize')
  onResize() {
    this.matchHeight(this.el.nativeElement, this.ltMatchHeight);
  }

  ngAfterViewChecked() {
    this.matchHeight(this.el.nativeElement, this.ltMatchHeight);
  }

  matchHeight(parent: HTMLElement, target: string | string[]) {
    if (this.isBrowser) {
      // Timeout is set to force Angular to wait for all actions and only continue once the process has run through.
      // Otherwise, an infinite loop will occur.
      setTimeout(() => {
        this.matchHeightHelper(parent, target);
      }, 1);
    } else {
      this.matchHeightHelper(parent, target);
    }
  }

  protected async matchHeightHelper(parent: HTMLElement, target: string | string[]) {
    if (!parent) {
      return;
    }

    let classNames;
    if (!Array.isArray(target)) {
      classNames = [target];
    } else {
      classNames = target;
    }

    for (const className of classNames) {
      // find all child structureElements with the selected class name
      const children = parent.getElementsByClassName(className);

      if (!children || children.length < 2) {
        continue;
      }

      // Load images of children
      if (this.loadLazyImages) {
        await this.imageService.preLoadImages({ elements: children });
      }

      // reset all children height
      Array.from(children).forEach((element: HTMLElement) => {
        element.style.height = 'initial';
      });

      // get all the child structureElements heights
      const itemHeights = Array.from(children).map((element) => {
        if (element.getBoundingClientRect) {
          return element.getBoundingClientRect().height;
        }
        return 0;
      });

      // find out the tallest one
      const maxHeight = itemHeights.reduce((prev, curr) => (curr > prev ? curr : prev), 0);

      // update the child structureElements height to the tallest one
      Array.from(children).forEach((element: HTMLElement) => (element.style.height = `${maxHeight}px`));
    }
  }
}
