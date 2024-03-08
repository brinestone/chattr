import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Room } from '@chattr/dto';
import { GalleriaModule } from 'primeng/galleria';
import { RoomService } from '../../services/room.service';
import { UserService } from '../../services/user.service';
import { NgxJdenticonModule } from "ngx-jdenticon";
import { RouterLink } from '@angular/router';

@Component({
  selector: 'chattr-rooms-page',
  standalone: true,
  imports: [CommonModule, RouterLink, GalleriaModule, NgxJdenticonModule],
  templateUrl: './rooms-page.component.html',
  styleUrl: './rooms-page.component.scss',
})
export class RoomsPageComponent implements OnInit {
  private readonly roomService = inject(RoomService);
  private readonly userService = inject(UserService);
  private readonly destroyRef = inject(DestroyRef);
  readonly rooms = signal<Room[]>([
    {
      name: 'foo',
      id: 'id_foo',
      acceptedMembers: [],
      bannedMembers: [],
      sessions: {}
    },
    {
      name: 'bar',
      id: 'id_bar',
      acceptedMembers: [],
      bannedMembers: [],
      sessions: {}
    }
  ]);

  ngOnInit(): void {
    // this.roomService.getRooms().pipe(
    //   takeUntilDestroyed(this.destroyRef)
    // ).subscribe({
    //   next: this.rooms.set
    // });
  }
}
