import { pseudoRandomBytes } from "crypto";

export function generateRandomToken(length = 10) {
    return pseudoRandomBytes(length).toString('hex').toLowerCase();
}
