import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, isDevMode, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Actions, dispatch, ofActionDispatched, select, Store } from '@ngxs/store';
import { Device } from 'mediasoup-client';
import { RtpCapabilities } from 'mediasoup-client/lib/RtpParameters';
import { Consumer, Producer, Transport, TransportOptions } from 'mediasoup-client/lib/types';
import { debounceTime, filter, first, take } from 'rxjs';
import { ConnectPresentationTransport, CreatePresentationProducer, CreatePresentationConsumer, JoinPresentation, PresentationJoined, PresentationProducerCreated, PresentationStarted, PresentationTransportConnected, PresentationConsumerCreated, ToggleConsumerStream } from '../../actions';
import { Selectors } from '../../state/selectors';
import { signalDebounce } from '../../util';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

@Component({
  selector: 'chattr-room-presentation',
  standalone: true,
  imports: [CommonModule, ProgressSpinnerModule],
  templateUrl: './room-presentation.component.html',
  styleUrl: './room-presentation.component.scss',
})
export class RoomPresentationComponent {
  private device?: Device;
  private transport?: Transport;
  private producer?: Producer;
  private consumer?: Consumer;
  private readonly actions$ = inject(Actions);
  private readonly store = inject(Store);
  private readonly destroyRef = inject(DestroyRef);
  private readonly joinPresentation = dispatch(JoinPresentation)
  private readonly connectTransport = dispatch(ConnectPresentationTransport);
  private readonly createProducer = dispatch(CreatePresentationProducer);
  private readonly createConsumer = dispatch(CreatePresentationConsumer);
  private readonly toggleConsumer = dispatch(ToggleConsumerStream);
  readonly currentPresentation = signalDebounce(select(Selectors.currentPresentation), 1000);
  readonly canPublishInPresentation = select(Selectors.isPresentationOwner);
  readonly presentationStream = signal<MediaStream | null>(null);

  constructor() {
    this.store.select(Selectors.currentPresentation).pipe(
      takeUntilDestroyed(),
      debounceTime(1000)
    ).subscribe(presentation => {
      if (!presentation) {
        console.debug('No presentation');
        return;
      }
      console.debug(`Presentation status changed - canPublish = ${this.canPublishInPresentation()}`);
      this.doJoinPresentation();
    });
  }

  private doJoinPresentation() {
    this.actions$.pipe(
      takeUntilDestroyed(this.destroyRef),
      ofActionDispatched(PresentationJoined),
      filter(({ id }) => this.currentPresentation()?.id == id && !!this.currentPresentation()),
      take(1)
    ).subscribe(({ rtpCapabilities, transportParams }) => {
      this.setupDevice(rtpCapabilities).then(() => {
        if (this.canPublishInPresentation()) {
          return this.initPublish(transportParams);
        } else {
          return this.initConsume(transportParams);
        }
      })
    });

    this.joinPresentation(String(this.currentPresentation()?.id));
  }

  private configureTransportCallbacks() {
    const presentation = this.currentPresentation();
    if (!this.transport || !presentation) return;
    this.transport.on('connect', ({ dtlsParameters }, callback) => {
      this.actions$.pipe(
        takeUntilDestroyed(this.destroyRef),
        ofActionDispatched(PresentationTransportConnected),
        first(({ presentationId }) => presentationId == presentation.id),
      ).subscribe(() => {
        callback()
      });
      this.connectTransport(presentation.id, dtlsParameters);
    });

    if (this.transport.direction != 'send') return;
    this.transport.on('produce', ({ rtpParameters }, callback) => {
      this.actions$.pipe(
        takeUntilDestroyed(this.destroyRef),
        ofActionDispatched(PresentationProducerCreated),
        first(({ presentationId }) => presentationId == presentation.id),
      ).subscribe(({ producerId }) => {
        callback({ id: producerId });
      });
      this.createProducer(presentation.id, rtpParameters);
    });
  }

  private initConsume(transportOptions: TransportOptions) {
    if (!this.device) {
      if (isDevMode()) console.log('device not loaded');
      return;
    }
    this.transport = this.device.createRecvTransport(transportOptions);
    this.configureTransportCallbacks();


    this.actions$.pipe(
      takeUntilDestroyed(this.destroyRef),
      ofActionDispatched(PresentationStarted),
      filter(({ id }) => id == this.currentPresentation()?.id),
    ).subscribe(({ producerId }) => {
      const device = this.device;
      if (!device) return;

      this.actions$.pipe(
        takeUntilDestroyed(this.destroyRef),
        ofActionDispatched(PresentationConsumerCreated),
        first(({ presentationId, producerId: pid }) => pid == producerId && presentationId == this.currentPresentation()?.id)
      ).subscribe(async ({ id, rtpParameters }) => {
        if (!this.transport) return;
        this.consumer = await this.transport.consume({ id, producerId, rtpParameters, kind: 'video' });

        this.consumer.on('@close', () => {
          this.consumer?.close();
        });

        const stream = new MediaStream([this.consumer.track]);
        this.presentationStream.set(stream);

        this.toggleConsumer(id);
      });

      this.createConsumer(producerId, String(this.currentPresentation()?.id), device.rtpCapabilities);
    });
  }

  private async initPublish(transportOptions: TransportOptions) {
    if (!this.device?.loaded) {
      if (isDevMode())
        console.log('device not loaded');
      return;
    }

    this.transport = this.device.createSendTransport(transportOptions);
    this.configureTransportCallbacks();

    const stream = await navigator.mediaDevices.getDisplayMedia();
    this.presentationStream.set(stream);

    const tracks = stream.getVideoTracks();
    const track = tracks[tracks.length - 1];
    this.producer = await this.transport.produce({ track });

    this.producer.on('trackended', () => {
      this.producer?.close();
    });

    stream.onaddtrack = ({ track }) => {
      if (track.kind == 'video')
        this.producer?.replaceTrack({ track });
    };

    stream.onremovetrack = ({ track }) => {
      if (track.kind == 'video' && this.producer?.track?.id == track.id)
        this.producer.replaceTrack({ track: null });
    };
  }

  private async setupDevice(rtpCapabilities: RtpCapabilities) {
    this.device = new Device();
    await this.device.load({ routerRtpCapabilities: rtpCapabilities });
  }
}
