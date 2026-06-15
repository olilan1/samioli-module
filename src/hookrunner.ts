import { ActorPF2e, ChatMessagePF2e, ItemPF2e, TokenDocumentPF2e } from "foundry-pf2e";
import { getSetting, SettingsKey } from "./settings.ts";

export function hook<T extends unknown[]>(
    func: (...args: T) => void,
    ...args: T
): HookRunner<T> {
    return new HookRunner<T>(func, ...args);
}

function extractTokenDocument(obj: unknown): TokenDocumentPF2e | undefined {
    if (!obj) return undefined;
    if ((obj as { documentName?: string }).documentName === "Token") {
        return obj as TokenDocumentPF2e;
    }
    const doc = (obj as { document?: unknown }).document;
    if (doc && (doc as { documentName?: string }).documentName === "Token") {
        return doc as TokenDocumentPF2e;
    }
    return undefined;
}

export class HookRunner<T extends unknown[]> {
    func: (...args: T) => boolean | void;
    args: T;
    shouldRun = true;
    private isGuarded = false;

    constructor(func: (...args: T) => void, ...args: T) {
        this.func = func;
        this.args = args;
    }

    private getActor(): ActorPF2e | undefined {
        for (const arg of this.args) {
            if (!arg) continue;
            if ((arg as { documentName?: string }).documentName === "Actor") {
                return arg as ActorPF2e;
            }
            if ((arg as { actor?: ActorPF2e }).actor) {
                return (arg as { actor?: ActorPF2e }).actor;
            }
        }
        console.warn(
            `HookRunner: Could not resolve actor from hook arguments ` +
            `for function "${this.func.name}".`
        );
        return undefined;
    }

    private getItem(): ItemPF2e | undefined {
        for (const arg of this.args) {
            if (!arg) continue;
            if ((arg as { documentName?: string }).documentName === "Item") {
                return arg as ItemPF2e;
            }
            const item = (arg as { item?: ItemPF2e }).item;
            if (item?.documentName === "Item") {
                return item;
            }
        }
        console.warn(
            `HookRunner: Could not resolve item from hook arguments ` +
            `for function "${this.func.name}".`
        );
        return undefined;
    }

    private getToken(): TokenDocumentPF2e | undefined {
        for (const arg of this.args) {
            if (!arg) continue;
            const directToken = extractTokenDocument(arg);
            if (directToken) return directToken;

            const nestedToken = extractTokenDocument((arg as { token?: unknown }).token);
            if (nestedToken) return nestedToken;
        }
        console.warn(
            `HookRunner: Could not resolve token document from hook arguments ` +
            `for function "${this.func.name}".`
        );
        return undefined;
    }

    ifEnabled(...settings: SettingsKey[]): this {
        for (const setting of settings) {
            if (!getSetting(setting)) {
                this.shouldRun = false;
            }
        }
        return this;
    }

    ifGM(): this {
        if (!game.user.isGM) {
            this.shouldRun = false;
        }
        return this;
    }

    ifMessagePoster(): this {
        const message = this.args[0] as ChatMessagePF2e | undefined;
        if (message && game.user.id !== message.author?.id) {
            this.shouldRun = false;
        }
        return this;
    }

    ifMessagePosterAndActorOwner(): this {
        const message = this.args[0] as ChatMessagePF2e | undefined;
        if (message) {
            const isAuthor = game.user.id === message.author?.id;
            const isOwner = !!message.actor?.isOwner;
            if (!isAuthor || !isOwner) {
                this.shouldRun = false;
            }
        }
        return this;
    }

    ifUser(userId: string): this {
        if (game.user.id !== userId) {
            this.shouldRun = false;
        }
        return this;
    }

    ifV12(): this {
        if (!game.version.startsWith("12.")) {
            this.shouldRun = false;
        }
        return this;
    }

    if(predicate: (...args: T) => boolean): this {
        this.isGuarded = true;
        if (!predicate(...this.args)) {
            this.shouldRun = false;
        }
        return this;
    }

    ifMessageOption(option: string): this {
        this.isGuarded = true;
        const message = this.args[0] as ChatMessagePF2e | undefined;
        const options = message?.flags.pf2e?.context?.options 
            ?? message?.flags.pf2e?.origin?.rollOptions;
        if (!options?.includes(option)) {
            this.shouldRun = false;
        }
        return this;
    }

    ifNotMessageOption(option: string): this {
        this.isGuarded = true;
        const message = this.args[0] as ChatMessagePF2e | undefined;
        const options = message?.flags.pf2e?.context?.options 
            ?? message?.flags.pf2e?.origin?.rollOptions;
        if (options?.includes(option)) {
            this.shouldRun = false;
        }
        return this;
    }

    ifMessageOptionAny(...optionsToCheck: string[]): this {
        this.isGuarded = true;
        const message = this.args[0] as ChatMessagePF2e | undefined;
        const options = message?.flags.pf2e?.context?.options 
            ?? message?.flags.pf2e?.origin?.rollOptions;
        if (!optionsToCheck.some(opt => options?.includes(opt))) {
            this.shouldRun = false;
        }
        return this;
    }

    ifMessageItemSlug(slug: string): this {
        this.isGuarded = true;
        const message = this.args[0] as ChatMessagePF2e | undefined;
        if (message?.item?.slug !== slug) {
            this.shouldRun = false;
        }
        return this;
    }

    ifMessageHasTarget(): this {
        this.isGuarded = true;
        const message = this.args[0] as ChatMessagePF2e | undefined;
        if (!message?.target?.actor) {
            this.shouldRun = false;
        }
        return this;
    }

    ifTargetHasEffect(effectSlug: string): this {
        this.isGuarded = true;
        const message = this.args[0] as ChatMessagePF2e | undefined;
        const targetActor = message?.target?.actor;
        const hasEffect = targetActor?.itemTypes.effect.some(e => e.slug === effectSlug) ?? false;
        if (!hasEffect) {
            this.shouldRun = false;
        }
        return this;
    }

    ifMessageOutcomeIn(...outcomes: string[]): this {
        this.isGuarded = true;
        const message = this.args[0] as ChatMessagePF2e | undefined;
        const outcome = message?.flags.pf2e?.context?.outcome;
        if (!outcome || !outcomes.includes(outcome)) {
            this.shouldRun = false;
        }
        return this;
    }

    ifActorHasFeat(featSlug: string): this {
        this.isGuarded = true;
        const actor = this.getActor();
        const hasFeat = actor?.itemTypes.feat.some(f => f.slug === featSlug) ?? false;
        if (!hasFeat) {
            this.shouldRun = false;
        }
        return this;
    }

    ifActorHasEffect(effectSlug: string): this {
        this.isGuarded = true;
        const actor = this.getActor();
        const hasEffect = actor?.items.some(
            item => item.type === "effect" && item.slug === effectSlug
        ) ?? false;
        if (!hasEffect) {
            this.shouldRun = false;
        }
        return this;
    }

    ifActorHasEffectWithSlugPrefix(prefix: string): this {
        this.isGuarded = true;
        const actor = this.getActor();
        const hasEffect = actor?.items.some(
            item => item.type === "effect" && (item.slug?.startsWith(prefix) ?? false)
        ) ?? false;
        if (!hasEffect) {
            this.shouldRun = false;
        }
        return this;
    }

    ifActorHasCondition(conditionSlug: string): this {
        this.isGuarded = true;
        const actor = this.getActor();
        const hasCondition = actor?.items.some(
            item => item.type === "condition" && item.slug === conditionSlug
        ) ?? false;
        if (!hasCondition) {
            this.shouldRun = false;
        }
        return this;
    }

    ifActorHasEffectWithFlag(scope: string, flagName: string): this {
        this.isGuarded = true;
        const actor = this.getActor();
        const hasEffect = actor?.items.some(
            item => item.type === "effect" && item.getFlag(scope, flagName) !== undefined
        ) ?? false;
        if (!hasEffect) {
            this.shouldRun = false;
        }
        return this;
    }

    ifItemType(type: string): this {
        this.isGuarded = true;
        const item = this.getItem();
        if (item?.type !== type) {
            this.shouldRun = false;
        }
        return this;
    }

    ifItemSlug(slug: string): this {
        this.isGuarded = true;
        const item = this.getItem();
        if (item?.slug !== slug) {
            this.shouldRun = false;
        }
        return this;
    }

    ifItemSlugStartsWith(prefix: string): this {
        this.isGuarded = true;
        const item = this.getItem();
        if (!item?.slug?.startsWith(prefix)) {
            this.shouldRun = false;
        }
        return this;
    }

    ifTokenHasFlag(scope: string, flagName: string): this {
        this.isGuarded = true;
        const token = this.getToken();
        const flagValue = token?.getFlag(scope, flagName);
        if (flagValue === undefined || flagValue === null || flagValue === "") {
            this.shouldRun = false;
        }
        return this;
    }

    ifSceneHasTemplateWithFlag(scope: string, flagName: string): this {
        this.isGuarded = true;
        const hasTemplate = canvas.templates?.placeables.some(
            t => !!t.document.getFlag(scope, flagName)
        ) ?? false;
        if (!hasTemplate) {
            this.shouldRun = false;
        }
        return this;
    }

    ifMessageHasFlag(scope: string, flagName: string): this {
        this.isGuarded = true;
        const message = this.args[0] as ChatMessagePF2e | undefined;
        const flags = message?.flags as
            | Record<string, Record<string, unknown> | undefined>
            | undefined;
        if (flags?.[scope]?.[flagName] === undefined) {
            this.shouldRun = false;
        }
        return this;
    }

    allowUnfilteredRun(): this {
        this.isGuarded = true;
        return this;
    }

    run(): boolean | void {
        if (!this.isGuarded) {
            throw new Error(
                `HookRunner: You must add guards to the hook, or call allowUnfilteredRun() ` +
                `before calling run() for function "${this.func.name}".`
            );
        }

        if (this.shouldRun) {
            return this.func(...this.args);
        }
        return false;
    }
}
