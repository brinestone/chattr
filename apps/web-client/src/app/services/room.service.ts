import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { Auth, authState } from "@angular/fire/auth";
import { Firestore, collectionChanges, query, where } from '@angular/fire/firestore';
import { Room } from "@chattr/dto";
import { getIdToken } from "firebase/auth";
import { collection } from "firebase/firestore";
import { Device } from "mediasoup-client";
import { DtlsParameters, MediaKind, RtpParameters, Transport } from "mediasoup-client/lib/types";
import { filter, from, identity, map, mergeMap, of, scan, switchMap, throwError, toArray } from "rxjs";
import { Socket, io } from 'socket.io-client';
import { environment } from "../../environments/environment.development";

export type RoomEvent<T = any> = {
    event: 'error' | 'message';
    data?: T
}

export type MediaDevice = {
    type: MediaKind;
    id: string;
    name: string;
    track?: MediaStreamTrack;
}

@Injectable({
    providedIn: 'root'
})
export class RoomService {
    private readonly db = inject(Firestore);
    private readonly auth = inject(Auth);
    private readonly httpClient = inject(HttpClient);
    private socket?: Socket;
    private device: Device = new Device();
    private sendTransport?: Transport;

    findMediaDevices() {
        return from(navigator.mediaDevices.enumerateDevices()).pipe(
            switchMap(identity),
            filter(device => device.kind == 'audioinput' || device.kind == 'videoinput'),
            map(({ deviceId, label, kind }) => {
                debugger;
                return { id: deviceId, name: label, type: kind == 'audioinput' ? 'audio' : 'video' } as MediaDevice;
            }),
            toArray()
        );
    }

    createRoom(name: string) {
        const user = this.auth.currentUser;
        if (!user) {
            return throwError(() => new Error('You have not signed in'));
        }
        const room: Room = {
            name,
            members: [
                { isBanned: false, uid: user.uid }
            ],
            roleMap: {
                [user.uid]: 'owner'
            },
            sessions: {}
        };

        return from(getIdToken(user)).pipe(
            switchMap(idToken => this.httpClient.post<Room>(`${environment.backendOrigin}/rooms`, room, {
                headers: {
                    authorization: idToken
                }
            }))
        );
    }

    private assertSocket(userIdToken: string) {
        if (!this.socket) {
            this.socket = io(`${environment.backendOrigin}`, {
                transports: ['websocket'],
                query: {
                    token: userIdToken
                }
            });
        }
    }

    joinRoom(id: string, userIdToken: string) {
        this.assertSocket(userIdToken);
        return from(this.socket!.emitWithAck('init_session', [{ roomId: id }])).pipe(
            switchMap(async ({ rtpCapabilities, transportParams, sessionId }) => {
                await this.device.load({ routerRtpCapabilities: rtpCapabilities });
                this.sendTransport = this.device.createSendTransport(transportParams);
                this.sendTransport.on('connect', ({ dtlsParameters }, callback, errBack) => {
                    this.transportConnectCallback(id, sessionId, dtlsParameters, callback, errBack);
                });
                this.sendTransport.on('produce', ({ kind, rtpParameters }, callback: (arg: { id: string }) => void, errBack: (error: Error) => void) => {
                    this.transportProduceCallback(id, sessionId, kind, rtpParameters, callback, errBack);
                })
            })
        )
    }

    private async transportProduceCallback(roomId: string, sessionId: string, kind: MediaKind, rtpParameters: RtpParameters, callback: Function, errBack: Function) {
        try {
            const { producerId } = await this.socket!.emitWithAck('produce', { roomId }, { kind, sessionId, rtpParameters })
            callback({ id: producerId });
        } catch (error) {
            errBack(error as Error);
        }
    }

    private async transportConnectCallback(roomId: string, sessionId: string, dtlsParameters: DtlsParameters, callback: () => void, errBack: (error: Error) => void) {
        try {
            await this.socket!.emitWithAck('connect_transport', { roomId }, { dtlsParameters, sessionId });
            callback();
        } catch (error) {
            errBack(error as Error);
        }
    }

    leaveCurrentRoom() {

    }

    getRooms() {
        return authState(this.auth).pipe(
            switchMap(user => {
                if (!user) return of(new Set<Room>());
                const ref = collection(this.db, 'rooms');
                const _filter = query(ref, where('members', 'array-contains', { uid: user.uid, isBanned: false }));
                return collectionChanges(_filter, {
                    events: ["added", 'modified', 'removed']
                }).pipe(
                    mergeMap(identity),
                    filter(change => change.doc.exists()),
                    map(change => {
                        const room = change.doc.data() as Room;
                        room.id = change.doc.id;
                        return room;
                    }),
                    scan((set, curr) => {
                        set.add(curr);
                        return set;
                    }, new Set<Room>())
                    // mergeMap(changes => {
                    //     console.log(changes);
                    //     return from(changes).pipe(
                    //         filter(change => change.doc.exists()),
                    //         map(change => {
                    //             const room = change.doc.data() as Room;
                    //             room.id = change.doc.id;
                    //             return room;
                    //         }),
                    //         toArray()
                    //     );
                    // })
                );
            })
        );
    }
}