import { Routes } from '@angular/router';
import { adminGuard } from '@core/guards/admin/admin.guard';

export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    canActivate: [adminGuard],
    canActivateChild: [adminGuard],
    loadComponent: () =>
      import('./layout/admin-layout.component').then((m) => m.AdminLayoutComponent),
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'navigation',
      },
      {
        path: 'home',
        loadComponent: () =>
          import('./pages/home-manager/home-manager.component').then(
            (m) => m.HomeManagerComponent,
          ),
        title: 'Home Page Manager | Atteya Admin',
      },
      {
        path: 'navigation',
        loadComponent: () =>
          import('./pages/navigation-manager/navigation-manager.component').then(
            (m) => m.NavigationManagerComponent,
          ),
        title: 'Navigation & Menus | Atteya Admin',
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./pages/settings/settings.component').then((m) => m.SettingsComponent),
        title: 'Settings | Atteya Admin',
        children: [
          {
            path: '',
            pathMatch: 'full',
            redirectTo: 'admins',
          },
          {
            path: 'admins',
            loadComponent: () =>
              import('./pages/settings/admins/admins-tab.component').then(
                (m) => m.AdminsTabComponent,
              ),
            title: 'Admins | Atteya Admin',
          },
        ],
      },
    ],
  },
];
