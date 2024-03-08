import { Injectable, inject } from "@angular/core";
import { Auth, authState } from "@angular/fire/auth";
import { Firestore, collectionChanges, query, where } from '@angular/fire/firestore';
import { Room } from "@chattr/dto";
import { collection } from "firebase/firestore";
import { filter, from, map, mergeMap, of, switchMap, toArray } from "rxjs";

@Injectable({
    providedIn: 'root'
})
export class RoomService {
    private readonly db = inject(Firestore);
    private readonly auth = inject(Auth);

    getRooms() {
        return authState(this.auth).pipe(
            switchMap(user => {
                if (!user) return of([]);
                const ref = collection(this.db, 'rooms');
                const _filter = query(ref, where('acceptedMembers', 'array-contains', { uid: user.uid }));
                return collectionChanges(_filter, {
                    events: ["added", 'modified', 'removed']
                }).pipe(
                    mergeMap(changes => {
                        return from(changes).pipe(
                            filter(change => change.doc.exists()),
                            map(change => {
                                const room = change.doc.data() as Room;
                                room.id = change.doc.id;
                                return room;
                            }),
                            toArray()
                        );
                    })
                );
            })
        );
    }
}