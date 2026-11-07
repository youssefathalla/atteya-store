import { inject, Pipe, PipeTransform } from '@angular/core';
import { Router, type UrlTree } from '@angular/router';

/**
 * Turns a saved link string (navigation, home settings) into a `routerLink` target.
 * A plain string `routerLink` treats `?` and `#` as part of the path, so
 * `/shop?onSale=1` would open `/shop%3FonSale%3D1` (the wrong page). Links with a query
 * or fragment are parsed into a `UrlTree`; every other value passes through unchanged.
 */
@Pipe({ name: 'linkTarget', pure: true })
export class LinkTargetPipe implements PipeTransform {
  readonly #router = inject(Router);

  transform(link: string | null | undefined): string | UrlTree | null {
    if (!link) return null;
    if (!link.startsWith('/')) return link;
    if (!link.includes('?') && !link.includes('#')) return link;
    return this.#router.parseUrl(link);
  }
}
