import { Component } from '@angular/core';
import { HlmToaster } from '@lenne.tech/ng-base/ui';

@Component({
  imports: [HlmToaster],
  selector: 'app-toaster',
  templateUrl: './toaster.html',
})
export class Toaster {}
