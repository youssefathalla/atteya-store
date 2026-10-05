import { Component, afterNextRender } from '@angular/core';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

@Component({
  selector: 'app-gsap-tab',
  imports: [],
  templateUrl: './gsap-tab.component.html',
})
export class GsapTabComponent {
  constructor() {
    // Runs once, after Angular has painted the DOM (client-side only).
    // afterNextRender(() => {
    //   gsap.to('.box-2', {
    //     scrollTrigger: {
    //       trigger: '.box-2', // element that starts the animation
    //       start: 'top center', // when box's top hits the viewport's vertical center
    //       end: 'bottom top', // when box's bottom leaves through the top of the viewport
    //       markers: true, // uncomment to see the trigger points while testing
    //       toggleActions: 'restart pause reverse pause', // toggleActions: 'onEnter - onLeave - onEnterBack  - onLeaveBack ',
    //     },
    //     x: (i, target) => target.parentElement.clientWidth * 0.5, // 50% of parent width, in px
    //     duration: 4,
    //   });
    // });
  }
}
