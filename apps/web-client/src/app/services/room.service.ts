import { Injectable, inject } from "@angular/core";
import { Auth, authState } from "@angular/fire/auth";
import { Firestore, collectionChanges, query, where } from '@angular/fire/firestore';
import { Room } from "@chattr/dto";
import { collection } from "firebase/firestore";
import { Observable, filter, from, identity, map, mergeMap, of, scan, switchMap, tap, throwError, toArray } from "rxjs";
import { io } from 'socket.io-client';
import { environment } from "../../environments/environment.development";
import { HttpClient } from "@angular/common/http";
import { getIdToken } from "firebase/auth";

export type RoomEvent<T = any> = {
    event: 'error' | 'message';
    data?: T
}

@Injectable({
    providedIn: 'root'
})
export class RoomService {
    private readonly db = inject(Firestore);
    private readonly auth = inject(Auth);
    private readonly httpClient = inject(HttpClient);

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
            sessions: []
        };

        return from(getIdToken(user)).pipe(
            switchMap(idToken => this.httpClient.post<Room>(`${environment.backendOrigin}/rooms`, room, {
                headers: {
                    authorization: idToken
                }
            }))
        );
    }

    joinRoom(id: string, userIdToken: string) {
        return new Observable<RoomEvent>(subscriber => {

            const socket = io(`${environment.backendOrigin}`, {
                transports: ['websocket'],
                query: {
                    token: userIdToken
                },
                extraHeaders: {
                    authorization: userIdToken
                }
            });
            subscriber.add(() => socket.close());

            socket.on(id, (json) => {
                subscriber.next({ event: 'message', data: JSON.parse(json) });
            });

            socket.on('errors', (json) => {
                subscriber.next({ event: 'error', data: JSON.parse(json) });
            });

            socket.on('connect', () => {
                socket.emitWithAck('init_session', [{ roomId: id }, { foo: 'foo', bar: 'bar' },]);
            });
        })
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