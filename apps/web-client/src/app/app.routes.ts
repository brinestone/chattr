import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const appRoutes: Routes = [
    { canActivate: [authGuard('/rooms', { tab: 'sign-in' })], path: 'rooms/:id', loadComponent: () => import('./pages/room-page/room-page.component').then(m => m.RoomPageComponent) },
    { path: 'rooms', title: 'Rooms', loadComponent: () => import('./pages/rooms-page/rooms-page.component').then(m => m.RoomsPageComponent) },
    { canActivate: [authGuard('/rooms', { tab: 'sign-in' })], path: 'invite/ack', loadComponent: () => import('./pages/invite-ack/invite-ack-page.component').then(m => m.InviteAckPageComponent) },
    { path: '', pathMatch: 'full', redirectTo: 'rooms' }
]
