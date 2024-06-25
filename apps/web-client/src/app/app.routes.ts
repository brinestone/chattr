import { Routes } from '@angular/router';
import { RoomsPageComponent } from './pages/rooms-page/rooms-page.component';
import { RoomPageComponent } from './pages/room-page/room-page.component';
import { authGuard } from './guards/auth.guard';

export const appRoutes: Routes = [
    { canActivate: [authGuard('/rooms', { tab: 'sign-in' })], path: 'rooms/:id', component: RoomPageComponent },
    { path: 'rooms', title: 'Rooms', component: RoomsPageComponent },
    { path: '', pathMatch: 'full', redirectTo: 'rooms' }
]
