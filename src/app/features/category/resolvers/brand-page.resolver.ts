import { inject } from '@angular/core';
import type { ResolveFn } from '@angular/router';
import { NavAutoBrandsService } from '@core/services/navigation/nav-auto-brands.service';

/**
 * `/brand/:slug`: on the server, reads the published brands once for this request (the same read
 * and `nav-auto-brands` TransferState seed the brand menu columns use), so the brand's logo is in
 * the share tags of the server HTML (ATS-263). In the browser it does nothing: the page follows
 * the live brands `CatalogService` already listens to.
 */
export const brandPageResolver: ResolveFn<void> = () => inject(NavAutoBrandsService).load();
