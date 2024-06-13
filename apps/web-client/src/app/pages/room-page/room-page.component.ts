import {
  Component,
  inject
} from '@angular/core';
import { Store } from '@ngxs/store';
import { MessageService } from 'primeng/api';

@Component({
  selector: 'chattr-room-page',
  standalone: true,
  providers: [MessageService],
  imports: [
    
  ],
  templateUrl: './room-page.component.html',
  styleUrl: './room-page.component.scss',
})
export class RoomPageComponent {
  private readonly store = inject(Store);
}
