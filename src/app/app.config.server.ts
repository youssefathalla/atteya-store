import { mergeApplicationConfig, ApplicationConfig, inject, provideAppInitializer } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';
import { CurrencyService } from '@core/services/currency/currency.service';

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    provideAppInitializer(() => inject(CurrencyService).prepareForServerRender()),
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
