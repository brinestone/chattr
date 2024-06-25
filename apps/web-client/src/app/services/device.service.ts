import { Injectable } from "@angular/core";
import { filter, from, identity, map, mergeMap, switchMap, tap, toArray } from "rxjs";
import { MediaDevice } from "./room.service";

@Injectable({ providedIn: 'root' })
export class DeviceService {
    findMediaDevices() {

        return from(navigator.mediaDevices.getUserMedia({ audio: true, video: true })).pipe(
            tap(stream => stream.getTracks().forEach(track => track.stop())),
            switchMap(() => navigator.mediaDevices.enumerateDevices()),
            mergeMap(identity),
            filter(
                (device) => device.kind == 'audioinput' || device.kind == 'videoinput'
            ),
            map(({ deviceId, label, kind }) => {
                return {
                    id: deviceId,
                    name: label ?? 'Default Device',
                    type: kind == 'audioinput' ? 'audio' : 'video',
                } as MediaDevice;
            }),
            toArray()
        );
    }
}
