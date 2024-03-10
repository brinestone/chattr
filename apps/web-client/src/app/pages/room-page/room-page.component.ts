import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { Auth, authState, getIdToken } from '@angular/fire/auth';
import { ActivatedRoute } from '@angular/router';
import { MessageService } from 'primeng/api';
import { EMPTY, mergeMap, switchMap } from 'rxjs';
import { RoomService } from '../../services/room.service';

@Component({
  selector: 'chattr-room-page',
  standalone: true,
  providers: [MessageService],
  imports: [CommonModule],
  templateUrl: './room-page.component.html',
  styleUrl: './room-page.component.scss',
})
export class RoomPageComponent implements OnInit {
  private readonly roomId = inject(ActivatedRoute).snapshot.paramMap.get('id');
  private readonly roomService = inject(RoomService);
  private readonly auth = inject(Auth);
  private readonly messageService = inject(MessageService);

  ngOnInit(): void {
    if (!this.roomId) return;
    authState(this.auth).pipe(
      switchMap(user => {
        if (!user) return EMPTY;
        return getIdToken(user);
      }),
      mergeMap(idToken => {
        return this.roomService.joinRoom(this.roomId as string, idToken);
      })
    ).subscribe({
      next: x => {
        console.log(x);
      },
      error: (error: Error) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: error.message
        });
      }
    })
  }
}
