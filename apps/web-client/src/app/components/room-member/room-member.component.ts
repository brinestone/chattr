import { AfterViewInit, Component, DestroyRef, OnDestroy, computed, inject, input } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RoomMemberSession } from '@chattr/interfaces';
import { Actions, dispatch, ofActionCompleted, ofActionDispatched, select } from '@ngxs/store';
import { Device } from 'mediasoup-client';
import { Consumer } from 'mediasoup-client/lib/Consumer';
import { RtpCapabilities } from 'mediasoup-client/lib/RtpParameters';
import { Transport } from 'mediasoup-client/lib/Transport';
import { CardModule } from 'primeng/card';
import { filter, take } from 'rxjs';
import { ConnectTransport, CreateServerSideConsumer, CreateServerSideProducer, JoinSession, LeaveSession, NewSessionProducer, ServerSideConsumerCreated, ServerSideProducerCreated, SessionJoined, ToggleConsumerStream, TransportConnected, UpdateConnectionStatus } from '../../actions';
import { Selectors } from '../../state/selectors';

@Component({
  selector: 'chattr-room-member',
  standalone: true,
  imports: [CardModule],
  templateUrl: './room-member.component.html',
  styleUrl: './room-member.component.scss',
})
export class RoomMemberComponent implements AfterViewInit, OnDestroy {
  private readonly actions$ = inject(Actions);
  private readonly destroyRef = inject(DestroyRef);
  readonly session = input.required<RoomMemberSession>();
  private readonly producibleSession = select(Selectors.producibleSession);
  private readonly joinSessionFn = dispatch(JoinSession);
  private readonly transportConnectFn = dispatch(ConnectTransport);
  private readonly consumerToggleFn = dispatch(ToggleConsumerStream);
  private readonly leaveSessionFn = dispatch(LeaveSession);
  private readonly createServerProducerFn = dispatch(CreateServerSideProducer);
  private readonly createServerConsumerFn = dispatch(CreateServerSideConsumer);
  private readonly preferredAudioDevice = select(Selectors.audioInDevice);
  private readonly preferredVideoDevice = select(Selectors.videoInDevice);
  private readonly consumers = new Map<string, Consumer>();
  private readonly canPublish = computed(() => {
    const producibleSession = this.producibleSession();
    const session = this.session();
    return session.id == producibleSession?.id;
  })
  readonly avatar = computed(() => {
    const { displayName } = this.session();
    const bgColor = getComputedStyle(document.documentElement).getPropertyValue('--primary-color').substring(1);
    const url = `https://api.dicebear.com/9.x/open-peeps/svg?seed=${displayName.split(' ')[0]}&scale=80&size=100&backgroundColor=${bgColor}&backgroundType=gradientLinear`;
    return url;
  });

  private readonly device = new Device();
  private transport?: Transport;

  ngOnDestroy(): void {
    if (this.transport?.connectionState == 'connected') {
      this.transport.close();
    }
    this.leaveSessionFn(this.session().id);
  }

  ngAfterViewInit(): void {
    this.actions$.pipe(
      takeUntilDestroyed(this.destroyRef),
      ofActionCompleted(SessionJoined),
      filter(completion => completion.action.sessionId == this.session().id),
      take(1),
    ).subscribe(async ({ action: { rtpCapabilities, transportParams } }) => {
      await this.setupDevice(rtpCapabilities);
      this.setupTransports(transportParams);
      if (this.canPublish()) {
        this.startPublishing();
      } else {
        this.startConsuming();

        this.actions$.pipe(
          takeUntilDestroyed(this.destroyRef),
          ofActionCompleted(NewSessionProducer),
          filter(({ action: { sessionId } }) => sessionId == this.session().id)
        ).subscribe(({ action: { producerId } }) => {
          this.consumeProducerMedia(producerId);
        })
      }
    });

    // setTimeout(() => {
    this.actions$.pipe(
      takeUntilDestroyed(this.destroyRef),
      ofActionDispatched(UpdateConnectionStatus),
      filter(({ status }) => status == 'connected')
    ).subscribe(() => this.joinSessionFn(this.session().id));
    // }, 20);
  }

  private startConsuming() {
    console.log('Consuming media on session: ' + this.session().id);
    for (const producerId of this.session().producers) {
      this.consumeProducerMedia(producerId);
    }
  }

  private consumeProducerMedia(producerId: string) {
    this.actions$.pipe(
      takeUntilDestroyed(this.destroyRef),
      ofActionDispatched(ServerSideConsumerCreated),
      filter(({ sessionId, producerId: _producerId }) => _producerId == producerId && sessionId == this.session().id),
      take(1)
    ).subscribe(async ({ id, kind, rtpParameters }) => {
      const consumer = await this.transport!.consume({ id, kind, producerId, rtpParameters });
      this.consumers.set(consumer.id, consumer);

      consumer.observer.on('close', () => {
        this.consumers.delete(consumer.id);
      });

      this.consumerToggleFn(id);
    });

    this.createServerConsumerFn(producerId, this.session().id, this.device.rtpCapabilities);
  }

  private async startPublishing() {
    // let stream = await navigator.mediaDevices.getUserMedia({});

    // if(this.preferredAudioDevice() && !this.preferredVideoDevice()) {
    //   stream = await navigator.mediaDevices.getUserMedia({
    //     audio: {
    //       deviceId: this.preferredAudioDevice()
    //     }
    //   });
    // }

    // const audioTrack = stream.getAudioTracks()[0];
    // const videoTrack = stream.getVideoTracks()[0];

    // const audioProducer = this.transport!.produce({
    //   track: audioTrack
    // });


  }

  private setupTransports(transportParams: any) {
    if (this.canPublish()) {
      this.transport = this.device.createSendTransport(transportParams);
      this.transport.on('produce', ({ kind, rtpParameters }, callback, errBack) => {
        this.actions$.pipe(
          takeUntilDestroyed(this.destroyRef),
          ofActionCompleted(ServerSideProducerCreated),
          filter(({ action: { sessionId } }) => sessionId == this.session().id),
          take(1)
        ).subscribe(({ result, action: { producerId } }) => {
          if (result.error) {
            errBack(result.error);
          } else {
            callback({ id: producerId });
          }
        });

        this.createServerProducerFn(this.session().id, kind, rtpParameters);
      });
    } else {
      this.transport = this.device.createRecvTransport(transportParams);
    }
    this.transport.on('connect', ({ dtlsParameters }, callback, errBack) => {
      this.actions$.pipe(
        takeUntilDestroyed(this.destroyRef),
        ofActionCompleted(TransportConnected),
        filter(({ action }) => action.sessionId == this.session().id),
        take(1)
      ).subscribe(({ result }) => {
        if (result.error) {
          errBack(result.error);
        } else {
          callback();
        }
      });

      this.transportConnectFn(this.session().id, dtlsParameters);
    })
  }

  private async setupDevice(rtpCapabilities: RtpCapabilities) {
    await this.device.load({ routerRtpCapabilities: rtpCapabilities });
  }
}
