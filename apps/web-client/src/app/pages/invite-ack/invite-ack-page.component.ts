import { Component } from '@angular/core';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

@Component({
  selector: 'chattr-invite-ack-page',
  standalone: true,
  imports: [
    ProgressSpinnerModule
  ],
  templateUrl: './invite-ack-page.component.html',
  styleUrl: './invite-ack-page.component.scss',
})
export class InviteAckPageComponent { }
