import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: 'home', loadComponent: () => import('./pages/home/home').then(m => m.HomeComponent) },
  { path: 'cast', loadComponent: () => import('./pages/cast/cast').then(m => m.CastComponent) },
  { path: 'view', loadComponent: () => import('./pages/view/view').then(m => m.ViewComponent) },
];
