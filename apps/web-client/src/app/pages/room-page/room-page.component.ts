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
import { ActivatedRoute } from '@angular/router';
import { Actions, dispatch, ofActionDispatched, select } from '@ngxs/store';
import { MessageService } from 'primeng/api';
import { BadgeModule } from 'primeng/badge';
import { ButtonModule } from 'primeng/button';
import { DividerModule } from 'primeng/divider';
import { DropdownModule } from 'primeng/dropdown';
import { SidebarModule } from 'primeng/sidebar';
import { SkeletonModule } from 'primeng/skeleton';
import { TooltipModule } from 'primeng/tooltip';
import { EMPTY, map, switchMap, take } from 'rxjs';
import { ConnectToRoom, DevicesFound, FindDevices, SetAudioDevice, SetVideoDevice } from '../../actions';
import { RoomMemberComponent } from '../../components/room-member/room-member.component';
import { Selectors } from '../../state/selectors';

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
    NgClass,
    DividerModule,
    RoomMemberComponent,
    SidebarModule,
    BadgeModule,
    SkeletonModule,
    ReactiveFormsModule
  ],
  templateUrl: './room-page.component.html',
  styleUrl: './room-page.component.scss',
})
export class RoomPageComponent implements OnInit {
  private readonly sessionConnectFn = dispatch(ConnectToRoom);
  private readonly loadDevicesFn = dispatch(FindDevices);
  private readonly setAudioDeviceFn = dispatch(SetAudioDevice);
  private readonly setVideoDeviceFn = dispatch(SetVideoDevice);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly actions$ = inject(Actions);
  private readonly preferredAudioDevice = select(Selectors.audioInDevice);
  private readonly preferredVideoDevice = select(Selectors.videoInDevice);
  readonly devicesConfigured = select(Selectors.devicesConfigured);
  showDevicesConfigSidebar = false;
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
      let constraints: MediaStreamConstraints = {};
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
    const roomId = String(this.activatedRoute.snapshot.params['id']);
    this.sessionConnectFn(roomId);
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
}
