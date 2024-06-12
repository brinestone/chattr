import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'chattr-cookie-consent',
  standalone: true,
  imports: [CommonModule],
  template: `<p>cookie-consent works!</p>`,
  styles: `
    :host {
      display: block;
    }
  `,
})
export class CookieConsentComponent {}
