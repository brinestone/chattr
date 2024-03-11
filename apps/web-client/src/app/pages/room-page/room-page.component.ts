import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Auth, authState, getIdToken } from '@angular/fire/auth';
import { ActivatedRoute } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { EMPTY, mergeMap, switchMap } from 'rxjs';
import { MediaDevice, RoomService } from '../../services/room.service';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';

@Component({
  selector: 'chattr-room-page',
  standalone: true,
  providers: [MessageService],
  imports: [CommonModule, DialogModule, ButtonModule],
  templateUrl: './room-page.component.html',
  styleUrl: './room-page.component.scss',
})
export class RoomPageComponent implements OnInit {
  private readonly roomId = inject(ActivatedRoute).snapshot.paramMap.get('id');
  private readonly roomService = inject(RoomService);
  private readonly auth = inject(Auth);
  private readonly messageService = inject(MessageService);
  readonly showDeviceConfigurationDialog = signal(!!localStorage.getItem('devicesConfigured'));
  private readonly mediaSources = toSignal(this.roomService.findMediaDevices().pipe(
    takeUntilDestroyed()
  ));

  readonly audioSources = computed(() => {
    return this.mediaSources()?.filter(device => device.type == 'audio') ?? [];
  })
  readonly videoSources = computed(() => {
    console.log(this.mediaSources());
    return this.mediaSources()?.filter(device => device.type == 'video') ?? [];
  })

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
