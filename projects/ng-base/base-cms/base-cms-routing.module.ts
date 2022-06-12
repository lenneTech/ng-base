import { RouterModule, Routes } from '@angular/router';
import { NgModule } from '@angular/core';
import { BaseCmsComponent } from './pages/base-cms/base-cms.component';

const routes: Routes = [
  {
    path: '',
    component: BaseCmsComponent,
  },
  {
    path: ':modelName',
    component: BaseCmsComponent,
  },
  {
    path: ':modelName/:id',
    component: BaseCmsComponent,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class BaseCMSRoutingModule {}
