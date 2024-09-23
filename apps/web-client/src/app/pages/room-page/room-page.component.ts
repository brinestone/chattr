import { animate, query, state, style, transition, trigger } from '@angular/animations';
import { NgClass, NgStyle, SlicePipe } from '@angular/common';
import {
  Component,
  computed,
  effect,
  inject,
  signal
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { Actions, dispatch, ofActionDispatched, ofActionErrored, select } from '@ngxs/store';
import { MessageService } from 'primeng/api';
import { BadgeModule } from 'primeng/badge';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { DividerModule } from 'primeng/divider';
import { DropdownModule } from 'primeng/dropdown';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { SidebarModule } from 'primeng/sidebar';
import { SkeletonModule } from 'primeng/skeleton';
import { TooltipModule } from 'primeng/tooltip';
import { EMPTY, filter, map, switchMap, take } from 'rxjs';
import { ConnectToRoom, CreateInviteLink, CreatePresentation, DevicesFound, FindDevices, RoomError, SetAudioDevice, SetVideoDevice, ToggleAudio, ToggleVideo, UpdateConnectionStatus } from '../../actions';
import { RoomMemberComponent } from '../../components/room-member/room-member.component';
import { Selectors } from '../../state/selectors';
import { errorToMessage } from '../../util';
import { RoomPresentationComponent } from '../../components/room-presentation/room-presentation.component';
import { RoomPresentationSpectatorComponent } from '../../components/room-presentation-spectator/room-presentation-spectator.component';
@Component({
  selector: 'chattr-room-page',
  standalone: true,
  providers: [MessageService],
  imports: [
    TooltipModule,
    ButtonModule,
    ProgressSpinnerModule,
    NgStyle,
    SlicePipe,
    DropdownModule,
    ProgressSpinnerModule,
    NgClass,
    DividerModule,
    RoomPresentationComponent,
    RoomMemberComponent,
    SidebarModule,
    BadgeModule,
    SkeletonModule,
    DialogModule,
    ReactiveFormsModule,
    RoomPresentationSpectatorComponent
  ],
  templateUrl: './room-page.component.html',
  styleUrl: './room-page.component.scss',
  animations: [
    trigger('fade', [
      state('void', style({
        opacity: 0
      })),
      transition('void => *', [
        animate(500)
      ]),
      transition('* => void', [
        animate(500)
      ])
    ]),
    trigger('sessions', [
      transition('* => *', [
        query(':enter', [
          style({
            opacity: 0,
            scale: .5
          }),
          animate('.5s linear', style({ opacity: 1, scale: 1 }))
        ], { optional: true }),
        query(':leave', [
          style({
            opacity: 1,
            scale: 1
          }),
          animate('.5s linear', style({ opacity: 0, scale: .5 }))
        ], { optional: true })
      ])
    ])
  ]
})
export class RoomPageComponent {
  private readonly createPresentationFn = dispatch(CreatePresentation);
  private readonly roomConnectFn = dispatch(ConnectToRoom);
  private readonly loadDevicesFn = dispatch(FindDevices);
  private readonly setAudioDeviceFn = dispatch(SetAudioDevice);
  private readonly videoToggleFn = dispatch(ToggleVideo);
  private readonly audioToggleFn = dispatch(ToggleAudio);
  private readonly setVideoDeviceFn = dispatch(SetVideoDevice);
  private readonly createInviteLinkFn = dispatch(CreateInviteLink);
  private readonly roomId = toSignal(inject(ActivatedRoute).params.pipe(
    map(params => params['id'] as string)
  ))
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly title = inject(Title);
  private readonly router = inject(Router);
  private readonly messageService = inject(MessageService);
  private readonly actions$ = inject(Actions);
  private readonly preferredAudioDevice = select(Selectors.audioInDevice);
  private readonly preferredVideoDevice = select(Selectors.videoInDevice);
  readonly gettingShareLink = signal(false);
  readonly shareLink = select(Selectors.inviteLink);
  readonly roomInfo = select(Selectors.connectedRoomInfo);
  readonly videoDisabled = select(Selectors.isVideoDisabled);
  readonly audioDisabled = select(Selectors.isAudioDisabled);
  readonly devicesConfigured = select(Selectors.devicesConfigured);
  readonly audioDeviceSet = computed(() => !!this.preferredAudioDevice());
  readonly videoDeviceSet = computed(() => !!this.preferredVideoDevice());
  readonly presentation = select(Selectors.currentPresentation);
  readonly publishSession = select(Selectors.producibleSession);
  readonly canPublishInSession = select(Selectors.isPresentationOwner);
  showDevicesConfigSidebar = false;
  showInviteDialog = false;
  initConnection = false;
  readonly reconnecting = toSignal(this.actions$.pipe(
    ofActionDispatched(UpdateConnectionStatus),
    map(({ status }) => status == 'reconnecting')
  ));
  private readonly mediaDevices = toSignal(this.actions$.pipe(
    ofActionDispatched(DevicesFound),
    map(({ devices }) => devices)
  ));
  readonly sessions = select(Selectors.allSessions);
  readonly videoDevices = computed(() => {
    const devices = this.mediaDevices();
    if (!devices) return [];

    return [({ id: null, type: 'video', name: 'No Device' }), ...devices.filter(m => m.type == 'video')];
  });
  readonly audioDevices = computed(() => {
    const devices = this.mediaDevices();
    if (!devices) return [];

    return [({ id: null, type: 'audio', name: 'No Device' }), ...devices.filter(m => m.type == 'audio')];
  });
  readonly loadingDevices = signal(false);
  readonly spectorsPanelExpanded = signal(false);
  readonly deviceConfigForm = new FormGroup({
    audio: new FormControl<string>('', []),
    video: new FormControl<string>('', [])
  });
  readonly previewStream = toSignal(this.deviceConfigForm.valueChanges.pipe(
    switchMap(({ video, audio }) => {
      const constraints: MediaStreamConstraints = {};
      if (video)
        constraints.video = {
          deviceId: video,
          width: 320,
          height: 240
        };

      if (audio)
        constraints.audio = {
          deviceId: audio
        };

      if (!audio && !video) return EMPTY;

      return navigator.mediaDevices.getUserMedia(constraints);
    })
  ));

  constructor() {
    this.actions$.pipe(
      takeUntilDestroyed(),
      ofActionErrored(RoomError),
      filter(({ result }) => (result.error as RoomError | undefined)?.roomId == this.roomId() && !!this.roomId()),
      map(({ result }) => result.error)
    ).subscribe((e) => {
      this.messageService.add(errorToMessage(e as Error));
    });

    this.actions$.pipe(
      takeUntilDestroyed(),
      ofActionDispatched(UpdateConnectionStatus),
      filter(({ status }) => status == 'connected'),
      take(1)
    ).subscribe(() => this.initConnection = true);

    effect(() => {
      if (!this.devicesConfigured())
        this.showDevicesConfigSidebar = true;
    }, { allowSignalWrites: true });
    effect(() => {
      const roomId = this.roomId();
      if (!roomId) return;
      this.roomConnectFn(roomId);
    });

    effect(() => {
      const roomName = this.roomInfo()?.name;
      if (!roomName) return;
      this.title.setTitle(roomName);
    });
  }

  onDeviceConfigSidebarShown() {
    this.actions$.pipe(
      ofActionDispatched(DevicesFound),
      take(1)
    ).subscribe(() => this.loadingDevices.set(false));

    this.loadingDevices.set(true);
    this.loadDevicesFn();
    this.deviceConfigForm.controls.audio.setValue(this.preferredAudioDevice() ?? '');
    this.deviceConfigForm.controls.video.setValue(this.preferredVideoDevice() ?? '');
  }

  onDeviceConfigSidebarHidden() {
    const { audio, video } = this.deviceConfigForm.value;
    this.setAudioDeviceFn(audio ?? undefined);
    this.setVideoDeviceFn(video ?? undefined);
    this.previewStream()?.getTracks().forEach(track => track.stop());
  }

  onMemberSessionError(error: Error) {
    this.messageService.add(errorToMessage(error));
  }

  onToggleAudioButtonClicked() {
    this.audioToggleFn();
  }

  onToggleVideoButtonClicked() {
    this.videoToggleFn();
  }

  onCopyShareLinkButtonClicked() {
    const inviteLink = this.shareLink();
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink).then(() => {
      this.messageService.add({
        severity: 'info',
        summary: 'Info',
        detail: 'Invite link was copied to your clipboard'
      })
    });
  }

  onInviteDialogOpened() {
    const redirectPath = this.router.createUrlTree(['../../invite/ack'], { relativeTo: this.activatedRoute }).toString();
    this.gettingShareLink.set(true);
    this.createInviteLinkFn(redirectPath, 'code').subscribe({
      error: () => this.gettingShareLink.set(false),
      complete: () => this.gettingShareLink.set(false),
    });
  }

  onPresentScreenButtonClicked() {
    this.createPresentationFn().subscribe({
      error: (error: Error) => {
        this.messageService.add(errorToMessage(error));
      }
    });
  }
}
