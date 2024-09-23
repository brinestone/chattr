import { HttpErrorResponse } from "@angular/common/http";
import { Signal, effect, signal } from "@angular/core";
import { ActionCompletion, ActionType, Actions, ofActionCompleted, ofActionDispatched } from "@ngxs/store";
import { Message } from "primeng/api";
import { ObservableInput, identity, map, merge, mergeMap, throwError } from "rxjs";

export function signalDebounce<T>(refSignal: Signal<T>, timeOutMs = 0): Signal<T> {
    const debounceSignal = signal(refSignal());
    effect(() => {
        const value = refSignal();
        const timeout = setTimeout(() => {
            debounceSignal.set(value);
        }, timeOutMs);
        return () => {
            clearTimeout(timeout);
        };
    });
    return debounceSignal;
}

export function extractInitials(text?: string) {
    if (!text) return '';
    const tokens = text.trim().toUpperCase().split(' ').map(x => x[0]);
    if (!tokens) return '';
    return [tokens[0], tokens[1]].join('');
}

export function monitorAction<TOutput, TAction = ActionType>(actions$: Actions, actionType: ActionType, dispatchMapper?: (action: TAction) => TOutput, completionMapper?: (completion: ActionCompletion<TAction>) => TOutput | ActionCompletion<TAction>) {
    return merge([
        actions$.pipe(
            ofActionDispatched(actionType),
            map(dispatchMapper ?? identity)
        ),

        actions$.pipe(
            ofActionCompleted(actionType),
            map(completionMapper ?? identity)
        )
    ]).pipe(
        mergeMap(identity)
    )
}


export function errorToMessage(error: Error, life?: number) {
    return { severity: 'error', summary: 'Error', detail: error.message, life } as Message;
}

export function parseHttpClientError(error: Error): ObservableInput<never> {
    if (error instanceof HttpErrorResponse) {
        let message = error.message;

        if (error.error && Array.isArray(error.error.message)) {
            message = error.error.message.join('\n');
        } else if (error.error && typeof error.error.message == 'string') {
            message = error.error.message;
        } else if (error.error && typeof error.error == 'string') {
            message = error.error;
        }

        return throwError(() => new Error(`${error.status} - ${message}`));
    }

    return throwError(() => error);
}
