import { Injectable, inject, signal, computed } from '@angular/core';
import { Auth, signInWithPopup, GoogleAuthProvider, signOut } from '@angular/fire/auth';

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private readonly auth = inject(Auth);
  principal = signal(this.auth.currentUser);
  isSignedIn = computed(() => !!this.principal());
  constructor() {
    this.auth.onAuthStateChanged(this.principal.set);
  }

  initSignIn() {
    signInWithPopup(this.auth, new GoogleAuthProvider());
  }

  signOut() {
    signOut(this.auth);
  }
}
