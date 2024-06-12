import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  OnInit,
  ViewChild,
  computed,
  inject
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Auth, authState, getIdToken } from '@angular/fire/auth';
import { ActivatedRoute } from '@angular/router';
import { Select, Store } from '@ngxs/store';
import { MenuItem, MessageService } from 'primeng/api';
import { BadgeModule } from 'primeng/badge';
import { ButtonModule } from 'primeng/button';
import { ButtonGroupModule } from 'primeng/buttongroup';
import { DialogModule } from 'primeng/dialog';
import { DropdownModule } from 'primeng/dropdown';
import { MenuModule } from 'primeng/menu';
import { OverlayPanelModule } from 'primeng/overlaypanel';
import { SplitButtonModule } from 'primeng/splitbutton';
import {
  BehaviorSubject,
  EMPTY,
  Observable,
  combineLatest,
  map,
  mergeMap,
  switchMap,
} from 'rxjs';
import { SaveDeviceConfig, SetAudioDevice, SetVideoDevice } from '../../actions';
import { MediaDevice, RoomService } from '../../services/room.service';
import { AppStateModel } from '../../state';

@Component({
  selector: 'chattr-room-page',
  standalone: true,
  providers: [MessageService],
  imports: [
    CommonModule,
    DialogModule,
    MenuModule,
    OverlayPanelModule,
    ButtonGroupModule,
    BadgeModule,
    ButtonModule,
    DropdownModule,
    SplitButtonModule,
  ],
  templateUrl: './room-page.component.html',
  styleUrl: './room-page.component.scss',
})
export class RoomPageComponent implements OnInit {
  @Select() appConfig$!: Observable<AppStateModel>;
  @ViewChild('previewVideo', { static: true })
  private previewVideo!: ElementRef<HTMLVideoElement>;
  private readonly roomId = inject(ActivatedRoute).snapshot.paramMap.get('id');
  private readonly roomService = inject(RoomService);
  private readonly auth = inject(Auth);
  private readonly store = inject(Store);
  private readonly messageService = inject(MessageService);
  readonly deviceConfigDialog = toSignal(this.appConfig$.pipe(
    takeUntilDestroyed(),
    map(({ deviceConfig: { unconfigured } }) => unconfigured)
  ))
  private readonly mediaSources = toSignal(
    this.roomService.findMediaDevices().pipe(takeUntilDestroyed())
  );
  readonly audioSources = computed(() => {
    return (
      this.mediaSources()?.filter((device) => device.type == 'audio') ?? []
    );
  });
  readonly videoSources = computed(() => {
    return (
      this.mediaSources()?.filter((device) => device.type == 'video') ?? []
    );
  });
  private readonly chosenAudioDeviceSubject =
    new BehaviorSubject<MediaDevice | null>(this.audioSources()[0]);
  private readonly chosenVideoDeviceSubject =
    new BehaviorSubject<MediaDevice | null>(this.videoSources()[0]);
  readonly previewStream$ = this.roomService.getPreviewStreamProvider$(() =>
    combineLatest([
      this.chosenAudioDeviceSubject,
      this.chosenVideoDeviceSubject,
    ])
  );

  readonly audioSourceMenuItems = computed(() => {
    return [
      {
        label: 'None',
        id: '',
        command: () => {
          this.chosenAudioDeviceSubject.next(null);
        },
      },
      ...this.audioSources().map(
        (mediaDevice) =>
        ({
          label: mediaDevice.name,
          id: mediaDevice.id,
          command: () => {
            this.chosenAudioDeviceSubject.next(mediaDevice);
          },
        } as MenuItem)
      ),
    ];
  });
  readonly videoSourceMenuItems = computed(() => {
    return [
      {
        label: 'None',
        id: '',
        command: () => {
          this.chosenVideoDeviceSubject.next(null);
        },
      },
      ...this.videoSources().map(
        (mediaDevice) =>
        ({
          label: mediaDevice.name,
          id: mediaDevice.id,
          command: () => {
            this.chosenVideoDeviceSubject.next(mediaDevice);
          },
        } as MenuItem)
      ),
    ];
  });

  constructor() {
    this.previewStream$.pipe(takeUntilDestroyed()).subscribe((stream) => {
      if (!this.previewVideo) return;
      this.previewVideo.nativeElement.srcObject = stream;
    });

    this.chosenAudioDeviceSubject
      .pipe(takeUntilDestroyed())
      .subscribe((device) => {
        this.store.dispatch(new SetAudioDevice(device?.id));
      });

    this.chosenVideoDeviceSubject
      .pipe(takeUntilDestroyed())
      .subscribe((device) => {
        this.store.dispatch(new SetVideoDevice(device?.id));
      });
  }

  ngOnInit(): void {
    if (!this.roomId) return;
    authState(this.auth)
      .pipe(
        switchMap((user) => {
          if (!user) return EMPTY;
          return getIdToken(user);
        }),
        mergeMap((idToken) => {
          return this.roomService.joinRoom(this.roomId as string, idToken);
        })
      )
      .subscribe({
        error: (error: Error) => {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: error.message,
          });
        },
      });
  }

  onDeviceConfigDone() {
    this.store.dispatch(new SaveDeviceConfig());
  }
}
