import { Routes } from '@angular/router';

export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./layout/admin-layout.component').then((m) => m.AdminLayoutComponent),
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'navigation',
      },
      {
        path: 'navigation',
        loadComponent: () =>
          import('./pages/navigation-manager/navigation-manager.component').then(
            (m) => m.NavigationManagerComponent,
          ),
        title: 'Navigation CMS | Atteya Admin',
      },
    ],
  },
];
