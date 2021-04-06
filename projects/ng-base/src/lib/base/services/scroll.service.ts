import { Inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BASE_MODULE_CONFIG, BaseModuleConfig } from '../interfaces/base-module-config.interface';

/**
 * Scroll service for autoscroll to specific fragments
 */
@Injectable({
  providedIn: 'root',
})
export class ScrollService {
  /**
   * Scroll offset
   */
  private scrollOffset = 100;

  /**
   * Detection offset
   * Should be >= scrollOffset
   */
  private detectionOffset = 200;

  /**
   * Initializer
   */
  constructor(private router: Router, @Inject(BASE_MODULE_CONFIG) private moduleConfig: BaseModuleConfig,) {
    const config = {
      scrollDetectionOffset: 200,
      scrollOffset: 100,
      ...moduleConfig
    };

    this.detectionOffset = config.scrollDetectionOffset;
    this.scrollOffset = config.scrollOffset;
  }

  /**
   * Scroll to structureElement with specific ID
   */
  scrollTo(id: string, options: { stopPropagation?: boolean } = {}) {
    options = {
      stopPropagation: true,
      ...options,
    };

    if (this.router.url !== '/' && !this.router.url.startsWith('/#')) {
      this.router.navigate(['/'], {fragment: id});
      return options.stopPropagation ? false : true;
    }

    const el = document.getElementById(id);
    const cords = el.getBoundingClientRect();
    window.scrollBy({top: cords.top - this.scrollOffset, behavior: 'smooth'});
    return options.stopPropagation ? false : true;
  }

  /**
   * Get last active structureElement
   */
  getLastActiveElement(list?): string {
    const currentScrollPosition = window.scrollY;
    const elementsWithId = document.querySelectorAll('[id]');
    let lastId = null;
    let lastPosition = 0 - this.detectionOffset - 1;
    elementsWithId.forEach((element) => {
      const cords = element.getBoundingClientRect();
      const top = cords.top + window.pageYOffset - this.detectionOffset;
      if (
        (!list || !list.length || list.includes(element.id)) && // In list
        top < currentScrollPosition && // In active area
        lastPosition < top // Higher than the last one
      ) {
        lastId = element.id;
        lastPosition = top;
      }
    });
    return lastId;
  }

  /**
   * Check if ID is active
   */
  isActive(id, list?, isFirst?) {
    const lastActiveElement = this.getLastActiveElement(list);
    return id === lastActiveElement || (lastActiveElement === null && isFirst);
  }
}
