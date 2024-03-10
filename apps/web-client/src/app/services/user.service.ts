import { Injectable, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Auth, GoogleAuthProvider, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup, signOut, authState } from '@angular/fire/auth';
import { FirebaseError } from 'firebase/app';
import { catchError, from, throwError } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private readonly auth = inject(Auth);
  principal = toSignal(authState(this.auth));
  isSignedIn = computed(() => !!this.principal());

  initEmailSignIn(email: string, password: string) {
    return from(createUserWithEmailAndPassword(this.auth, email, password)).pipe(
      catchError((error: Error) => {
        if (error instanceof FirebaseError) {
          if (error.message.includes('email-already-in-use')) {
            return signInWithEmailAndPassword(this.auth, email, password);
          }
        }
        return throwError(() => error);
      })
    )
  }

  initGoogleSignIn() {
    return from(signInWithPopup(this.auth, new GoogleAuthProvider()));
  }

  signOut() {
    signOut(this.auth);
  }
}
