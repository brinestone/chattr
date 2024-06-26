import { NgClass, NgStyle, SlicePipe } from '@angular/common';
import {
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Actions, dispatch, ofActionDispatched, select } from '@ngxs/store';
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
import { EMPTY, map, switchMap, take } from 'rxjs';
import { ConnectToRoom, CreateInviteLink, DevicesFound, FindDevices, SetAudioDevice, SetVideoDevice, ToggleAudio, ToggleVideo } from '../../actions';
import { RoomMemberComponent } from '../../components/room-member/room-member.component';
import { Selectors } from '../../state/selectors';
import { errorToMessage } from '../../util';
@Component({
  selector: 'chattr-room-page',
  standalone: true,
  providers: [MessageService],
  imports: [
    TooltipModule,
    ButtonModule,
    NgStyle,
    SlicePipe,
    DropdownModule,
    ProgressSpinnerModule,
    NgClass,
    DividerModule,
    RoomMemberComponent,
    SidebarModule,
    BadgeModule,
    SkeletonModule,
    DialogModule,
    ReactiveFormsModule
  ],
  templateUrl: './room-page.component.html',
  styleUrl: './room-page.component.scss',
})
export class RoomPageComponent implements OnInit {
  private readonly roomConnectFn = dispatch(ConnectToRoom);
  private readonly loadDevicesFn = dispatch(FindDevices);
  private readonly setAudioDeviceFn = dispatch(SetAudioDevice);
  private readonly videoToggleFn = dispatch(ToggleVideo);
  private readonly audioToggleFn = dispatch(ToggleAudio);
  private readonly setVideoDeviceFn = dispatch(SetVideoDevice);
  private readonly createInviteLinkFn = dispatch(CreateInviteLink);
  private readonly roomId = inject(ActivatedRoute).snapshot.params['id'] as string;
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly messageService = inject(MessageService);
  private readonly actions$ = inject(Actions);
  private readonly preferredAudioDevice = select(Selectors.audioInDevice);
  private readonly preferredVideoDevice = select(Selectors.videoInDevice);
  readonly gettingShareLink = signal(false);
  readonly shareLink = select(Selectors.inviteLink);
  readonly videoDisabled = select(Selectors.isVideoDisabled);
  readonly audioDisabled = select(Selectors.isAudioDisabled);
  readonly devicesConfigured = select(Selectors.devicesConfigured);
  showDevicesConfigSidebar = false;
  showInviteDialog = false;
  private readonly mediaDevices = toSignal(this.actions$.pipe(
    ofActionDispatched(DevicesFound),
    map(({ devices }) => devices)
  ));
  readonly sessions = select(Selectors.allSessions);
  readonly videoDevices = computed(() => {
    const devices = this.mediaDevices();
    if (!devices) return [];

    return devices.filter(m => m.type == 'video');
  });
  readonly audioDevices = computed(() => {
    const devices = this.mediaDevices();
    if (!devices) return [];

    return devices.filter(m => m.type == 'audio');
  });
  readonly loadingDevices = signal(false);
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
    effect(() => {
      if (!this.devicesConfigured())
        this.showDevicesConfigSidebar = true;
    }, { allowSignalWrites: true });
  }

  ngOnInit(): void {
    this.roomConnectFn(this.roomId);
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
    console.log(redirectPath);
    this.gettingShareLink.set(true);
    this.createInviteLinkFn(redirectPath, 'code').subscribe({
      error: () => this.gettingShareLink.set(false),
      complete: () => this.gettingShareLink.set(false),
    });
  }
}
