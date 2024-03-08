import { Routes } from '@angular/router';
import { RoomsPageComponent } from './pages/rooms-page/rooms-page.component';
import { RoomPageComponent } from './pages/room-page/room-page.component';

export const appRoutes: Routes = [
    { path: 'rooms/:id', component: RoomPageComponent },
    { path: 'rooms', title: 'Rooms', component: RoomsPageComponent },
    { path: '', pathMatch: 'full', redirectTo: 'rooms' }
]