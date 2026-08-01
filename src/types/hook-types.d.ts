export type SamiOliHooks = {
    on<H extends string, Args extends unknown[]>(
        hook: H,
        fn: (...args: Args) => boolean | void | Promise<boolean | void>
    ): number;
    once<H extends string, Args extends unknown[]>(
        hook: H,
        fn: (...args: Args) => boolean | void | Promise<boolean | void>
    ): number;
    off<Args extends unknown[]>(
        hook: string,
        fn: ((...args: Args) => boolean | void | Promise<boolean | void>) | number
    ): void;
    callAll(hook: string, ...args: unknown[]): boolean;
    call(hook: string, ...args: unknown[]): boolean;
};
