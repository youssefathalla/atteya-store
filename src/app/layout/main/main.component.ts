import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavbarComponent } from '../navbar/navbar.component';

@Component({
  selector: 'app-main-layout',
  imports: [RouterOutlet, NavbarComponent],
  template: `
    <div class="min-h-screen flex flex-col bg-surface text-on-surface">
      <!-- Store Mega Navbar -->
      <app-navbar />

      <!-- Main Storefront Page View -->
      <main class="flex-1 w-full">
        <div>
          Lorem, ipsum dolor sit amet consectetur adipisicing elit. Repellendus architecto qui
          recusandae nisi est sit accusantium? Aliquid repellat voluptatem debitis mollitia, error
          quas nostrum, accusamus itaque autem necessitatibus exercitationem eum? Lorem, ipsum dolor
          sit amet consectetur adipisicing elit. Repellendus architecto qui recusandae nisi est sit
          accusantium? Aliquid repellat voluptatem debitis mollitia, error quas nostrum, accusamus
          itaque autem necessitatibus exercitationem eum?Lorem, ipsum dolor sit amet consectetur
          adipisicing elit. Repellendus architecto qui recusandae nisi est sit accusantium? Aliquid
          repellat voluptatem debitis mollitia, error quas nostrum, accusamus itaque autem
          necessitatibus exercitationem eum?Lorem, ipsum dolor sit amet consectetur adipisicing
          elit. Repellendus architecto qui recusandae nisi est sit accusantium? Aliquid repellat
          voluptatem debitis mollitia, error quas nostrum, accusamus itaque autem necessitatibus
          exercitationem eum?Lorem, ipsum dolor sit amet consectetur adipisicing elit. Repellendus
          architecto qui recusandae nisi est sit accusantium? Aliquid repellat voluptatem debitis
          mollitia, error quas nostrum, accusamus itaque autem necessitatibus exercitationem
          eum?Lorem, ipsum dolor sit amet consectetur adipisicing elit. Repellendus architecto qui
          recusandae nisi est sit accusantium? Aliquid repellat voluptatem debitis mollitia, error
          quas nostrum, accusamus itaque autem necessitatibus exercitationem eum?Lorem, ipsum dolor
          sit amet consectetur adipisicing elit. Repellendus architecto qui recusandae nisi est sit
          accusantium? Aliquid repellat voluptatem debitis mollitia, error quas nostrum, accusamus
          itaque autem necessitatibus exercitationem eum?Lorem, ipsum dolor sit amet consectetur
          adipisicing elit. Repellendus architecto qui recusandae nisi est sit accusantium? Aliquid
          repellat voluptatem debitis mollitia, error quas nostrum, accusamus itaque autem
          necessitatibus exercitationem eum?Lorem, ipsum dolor sit amet consectetur adipisicing
          elit. Repellendus architecto qui recusandae nisi est sit accusantium? Aliquid repellat
          voluptatem debitis mollitia, error quas nostrum, accusamus itaque autem necessitatibus
          exercitationem eum?
        </div>

        <router-outlet />
      </main>

      <!-- Store Minimal Footer -->
      <footer
        class="w-full bg-neutral-950 text-neutral-400 border-t border-neutral-800 py-10 px-4 sm:px-6 lg:px-8 mt-auto select-none"
      >
        <div class="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div class="flex items-center gap-2">
            <span class="font-display-sm text-lg font-black tracking-widest text-white uppercase">
              ATTEYA<span class="text-amber-400">.</span>
            </span>
            <span class="text-xs text-neutral-500 font-mono">| Premier Padel & Sports Store</span>
          </div>

          <div
            class="flex items-center gap-6 text-xs font-semibold tracking-wider uppercase text-neutral-400"
          >
            <span>Official Dealer</span>
            <span>100% Authentic</span>
            <span>Express Shipping</span>
          </div>

          <p class="text-xs text-neutral-500">&copy; 2026 Atteya Store. All rights reserved.</p>
        </div>
      </footer>
    </div>
  `,
})
export class MainLayoutComponent {}
