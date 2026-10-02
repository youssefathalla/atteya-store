# Modern Angular Animations (Angular 22+)

Angular 22+ replaces the legacy `@angular/animations` package with **native template animation primitives** (`animate.enter` and `animate.leave`) and programmatic hooks that integrate seamlessly with native CSS and libraries like **GSAP**.

---

## 1. Native Template Animations

Angular provides built-in attributes on elements inside control flow (`@if`, `@for`) to manage enter and leave transitions cleanly without extra packages:

### `animate.enter` and `animate.leave`

* **`animate.enter="css-class"`**: Applied when an element enters the DOM. Angular automatically strips the class once the CSS transition or animation finishes.
* **`animate.leave="css-class"`**: Applied when an element is removed. Angular **waits for the animation/transition to complete** before detaching the element from the DOM.

```html
@if (isShown()) {
  <div
    class="card-box"
    animate.enter="fade-in"
    animate.leave="fade-out"
  >
    <p>Animated content</p>
  </div>
}
```

```css
.card-box {
  transition: opacity 250ms ease-out, transform 250ms ease-out;
}

.fade-in {
  animation: slideIn 250ms cubic-bezier(0, 0, 0.2, 1) forwards;
}

.fade-out {
  animation: slideOut 200ms cubic-bezier(0.4, 0, 1, 1) forwards;
}

@keyframes slideIn {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes slideOut {
  from { opacity: 1; transform: translateY(0); }
  to { opacity: 0; transform: translateY(-8px); }
}
```

---

## 2. GSAP & JavaScript Integration

For rich animations, bind to the `(animate.enter)` and `(animate.leave)` event hooks:

```html
@if (isOpen()) {
  <div
    (animate.enter)="animateEnter($event)"
    (animate.leave)="animateLeave($event)"
  >
    Modal Content
  </div>
}
```

```typescript
import { Component, AnimationCallbackEvent } from '@angular/core';
import { gsap } from 'gsap';

@Component({
  selector: 'app-dialog-box',
  templateUrl: './dialog-box.component.html',
})
export class DialogBoxComponent {
  animateEnter(event: AnimationCallbackEvent): void {
    gsap.fromTo(
      event.target,
      { opacity: 0, scale: 0.95 },
      {
        opacity: 1,
        scale: 1,
        duration: 0.3,
        ease: 'power2.out',
        onComplete: () => event.animationComplete(),
      }
    );
  }

  animateLeave(event: AnimationCallbackEvent): void {
    // CRITICAL: You MUST call event.animationComplete() when finished
    // so Angular knows when to safely remove the element from the DOM!
    gsap.to(event.target, {
      opacity: 0,
      scale: 0.9,
      duration: 0.2,
      ease: 'power2.in',
      onComplete: () => event.animationComplete(),
    });
  }
}
```

---

## 3. Modern CSS `@starting-style`

Modern browsers support CSS `@starting-style` to animate entry styles directly without extra keyframes:

```css
.card {
  opacity: 1;
  transform: scale(1);
  transition: opacity 0.3s, transform 0.3s;

  @starting-style {
    opacity: 0;
    transform: scale(0.9);
  }
}
```

---

## Summary

* **Do NOT install `@angular/animations`**: It is deprecated in favor of native CSS and template attributes.
* **Use `animate.enter` & `animate.leave`** for standard CSS animations.
* **Use `(animate.leave)="onLeave($event)"` + `event.animationComplete()`** when driving animations with **GSAP**.
