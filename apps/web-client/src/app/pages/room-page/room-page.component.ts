import {
  Component,
  OnInit,
  inject
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { dispatch, select } from '@ngxs/store';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DividerModule } from 'primeng/divider';
import { TooltipModule } from 'primeng/tooltip';
import { ConnectToRoom } from '../../actions';
import { RoomMemberComponent } from '../../components/room-member/room-member.component';
import { Selectors } from '../../state/selectors';
import { NgClass, NgStyle, SlicePipe } from '@angular/common';

@Component({
  selector: 'chattr-room-page',
  standalone: true,
  providers: [MessageService],
  imports: [
    TooltipModule,
    ButtonModule,
    NgStyle,
    SlicePipe,
    NgClass,
    DividerModule,
    RoomMemberComponent
  ],
  templateUrl: './room-page.component.html',
  styleUrl: './room-page.component.scss',
})
export class RoomPageComponent implements OnInit {
  private readonly sessionConnectFn = dispatch(ConnectToRoom);
  private readonly activatedRoute = inject(ActivatedRoute);
  readonly sessions = select(Selectors.allSessions);

  ngOnInit(): void {
    const roomId = String(this.activatedRoute.snapshot.params['id']);
    this.sessionConnectFn(roomId);
  }
}
