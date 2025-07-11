import { getSetting, SETTINGS } from "./settings.ts";

export function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function getRandomNumberBetween(min: number, max: number) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function shuffleArray<T>(array: T[]): T[] {
    let currentIndex = array.length, randomIndex;

    while (currentIndex !== 0) {

        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;

        [array[currentIndex], array[randomIndex]] = [
            array[randomIndex], array[currentIndex]];
    }

    return array;
}

export function getTokenIdsFromTokens(tokens: Token[]) {
    return tokens.map(token => token.id);
}

export function getHashCode(str: string) {
    let hash = 0;
    if (str.length === 0) return hash;

    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer 
    }

    return hash;
}

export function logd(message: unknown) {
    if (getSetting(SETTINGS.DEBUG_LOGGING)) {
        console.log(message);
    }
}