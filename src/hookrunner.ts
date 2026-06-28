import { ActorPF2e, ChatMessagePF2e, ItemPF2e, TokenDocumentPF2e } from "foundry-pf2e";
import { getSetting, SettingsKey } from "./settings.ts";
import { logd } from "./utils.ts";

/**
 * Helper function to instantiate a HookRunner builder for registering a hook callback.
 * 
 * @template T The type of the arguments passed to the hook.
 * @param func The hook callback function to run.
 * @param args Arguments to pass to the hook callback function when executed.
 * @returns A new HookRunner instance to configure with filters and guards.
 * 
 * @example
 * hook(myCallback, message)
 *   .ifEnabled(SETTINGS.MY_SETTING)
 *   .ifGM()
 *   .run();
 */
export function hook<T extends unknown[]>(
    func: (...args: T) => void,
    ...args: T
): HookRunner<T> {
    return new HookRunner<T>(func, ...args);
}

/**
 * Extracts a TokenDocumentPF2e from an unknown object, if possible.
 * 
 * @param obj The object to inspect.
 * @returns The resolved TokenDocumentPF2e, or undefined.
 */
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

/**
 * Builder class that handles filtering and conditional execution of hook callbacks.
 * Provides fluent method chaining to enforce configuration settings, actor states,
 * message states, and user permissions before running a hook function.
 * 
 * By default, HookRunner will throw an error if `run()` is called without any filters,
 * to prevent accidental unfiltered execution. To run a hook, at least one content-specific
 * filter (e.g. `ifMessageType`, `ifMessageOption`, `ifItemType`) or an explicit call
 * to `allowUnfilteredRun()` must be chained. General environment checks (like `ifEnabled`,
 * `ifGM`, `ifUser`) do not count as filters for this purpose.
 * 
 * @template T The type of the arguments passed to the hook callback.
 */
export class HookRunner<T extends unknown[]> {
    func: (...args: T) => boolean | void;
    args: T;
    shouldRun = true;
    private isGuarded = false;

    /**
     * Creates an instance of HookRunner.
     * 
     * @param func The callback function to execute.
     * @param args The arguments to pass to the callback function.
     */
    constructor(func: (...args: T) => void, ...args: T) {
        this.func = func;
        this.args = args;
    }

    /**
     * Resolves the ActorPF2e document from the hook arguments.
     * Evaluates arguments sequentially from left to right.
     * Precedence:
     * 1. Direct ActorPF2e arguments.
     * 2. Nested actor properties (e.g. from a TokenDocumentPF2e or ChatMessagePF2e).
     * 
     * @returns The resolved ActorPF2e, or undefined if no actor was found in the arguments.
     */
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
        logd(
            `HookRunner: Could not resolve actor from hook arguments ` +
            `for function "${this.func.name}".`
        );
        return undefined;
    }

    /**
     * Resolves the ItemPF2e document from the hook arguments.
     * Evaluates arguments sequentially from left to right.
     * Precedence:
     * 1. Direct ItemPF2e arguments.
     * 2. Nested item properties (e.g. from a ChatMessagePF2e).
     * 
     * @returns The resolved ItemPF2e, or undefined if no item was found in the arguments.
     */
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
        logd(
            `HookRunner: Could not resolve item from hook arguments ` +
            `for function "${this.func.name}".`
        );
        return undefined;
    }

    /**
     * Resolves the TokenDocumentPF2e document from the hook arguments.
     * Evaluates arguments sequentially from left to right.
     * Precedence:
     * 1. Direct TokenDocumentPF2e arguments (or their internal documents).
     * 2. Nested token properties.
     * 
     * @returns The resolved TokenDocumentPF2e, or undefined if no token was found.
     */
    private getToken(): TokenDocumentPF2e | undefined {
        for (const arg of this.args) {
            if (!arg) continue;
            const directToken = extractTokenDocument(arg);
            if (directToken) return directToken;

            const nestedToken = extractTokenDocument((arg as { token?: unknown }).token);
            if (nestedToken) return nestedToken;
        }
        logd(
            `HookRunner: Could not resolve token document from hook arguments ` +
            `for function "${this.func.name}".`
        );
        return undefined;
    }

    /**
     * Ensures the hook only runs if the specified module settings are active.
     * 
     * @note This is a general environment check and does not count as a filter to allow the hook
     *       to run (a content-specific filter or `allowUnfilteredRun()` must still be called).
     * @param settings One or more settings keys to verify.
     * @returns The HookRunner instance for chaining.
     */
    ifEnabled(...settings: SettingsKey[]): this {
        for (const setting of settings) {
            if (!getSetting(setting)) {
                this.shouldRun = false;
            }
        }
        return this;
    }

    /**
     * Restricts the hook execution to the GM's client only.
     * Crucial for operations that modify documents (like token movement, template deletion, or
     * animation placement) to avoid multiple clients executing them concurrently.
     * 
     * @note This is a general environment check and does not count as a filter to allow the hook
     *       to run (a content-specific filter or `allowUnfilteredRun()` must still be called).
     * @returns The HookRunner instance for chaining.
     */
    ifGM(): this {
        if (!game.user.isGM) {
            this.shouldRun = false;
        }
        return this;
    }

    /**
     * Restricts the hook execution to the client of the user who posted the chat message.
     * 
     * @note This is a general environment check and does not count as a filter to allow the hook
     *       to run (a content-specific filter or `allowUnfilteredRun()` must still be called).
     * @returns The HookRunner instance for chaining.
     */
    ifMessagePoster(): this {
        const message = this.args[0] as ChatMessagePF2e | undefined;
        if (message && game.user.id !== message.author?.id) {
            this.shouldRun = false;
        }
        return this;
    }

    /**
     * Restricts execution to the client of the user who is both the message author and the owner
     * of the message's associated actor.
     * 
     * @note This is a general environment check and does not count as a filter to allow the hook
     *       to run (a content-specific filter or `allowUnfilteredRun()` must still be called).
     * @returns The HookRunner instance for chaining.
     */
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

    /**
     * Restricts execution to a specific user ID.
     * 
     * @note This is a general environment check and does not count as a filter to allow the hook
     *       to run (a content-specific filter or `allowUnfilteredRun()` must still be called).
     * @param userId The ID of the user allowed to run the hook.
     * @returns The HookRunner instance for chaining.
     */
    ifUser(userId: string): this {
        if (game.user.id !== userId) {
            this.shouldRun = false;
        }
        return this;
    }

    /**
     * Restricts execution to Foundry VTT version 12 environments only.
     * 
     * @note This is a general environment check and does not count as a filter to allow the hook
     *       to run (a content-specific filter or `allowUnfilteredRun()` must still be called).
     * @returns The HookRunner instance for chaining.
     */
    ifV12(): this {
        if (!game.version.startsWith("12.")) {
            this.shouldRun = false;
        }
        return this;
    }

    /**
     * Restricts execution to a specific type of chat message (e.g. "attack-roll", "damage-roll").
     * 
     * @param type The chat message context/origin type to check.
     * @returns The HookRunner instance for chaining.
     */
    ifMessageType(type: string): this {
        this.isGuarded = true;
        const message = this.args[0] as ChatMessagePF2e | undefined;
        const msgType = message?.flags?.pf2e?.context?.type
            ?? message?.flags?.pf2e?.origin?.type
            ?? message?.flags?.["samioli-module"]?.type;
        if (msgType !== type) {
            this.shouldRun = false;
        }
        return this;
    }

    /**
     * Allows custom filtering logic by running a predicate function on the hook arguments.
     * 
     * @param predicate A callback function returning boolean.
     * @returns The HookRunner instance for chaining.
     */
    if(predicate: (...args: T) => boolean): this {
        this.isGuarded = true;
        if (!predicate(...this.args)) {
            this.shouldRun = false;
        }
        return this;
    }

    /**
     * Restricts execution to chat messages that include the specified roll option.
     * 
     * @param option The roll option string to check for.
     * @returns The HookRunner instance for chaining.
     */
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

    /**
     * Restricts execution to chat messages that do NOT include the specified roll option.
     * 
     * @param option The roll option string to check for exclusion.
     * @returns The HookRunner instance for chaining.
     */
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

    /**
     * Restricts execution to chat messages that contain at least one of the specified roll options.
     * 
     * @param optionsToCheck Roll option strings to check for.
     * @returns The HookRunner instance for chaining.
     */
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

    /**
     * Restricts execution to chat messages generated from an item matching the specified slug.
     * 
     * @param slug The item slug to verify.
     * @returns The HookRunner instance for chaining.
     */
    ifMessageItemSlug(slug: string): this {
        this.isGuarded = true;
        const message = this.args[0] as ChatMessagePF2e | undefined;
        if (message?.item?.slug !== slug) {
            this.shouldRun = false;
        }
        return this;
    }

    /**
     * Restricts execution to chat messages containing a valid target actor.
     * 
     * @returns The HookRunner instance for chaining.
     */
    ifMessageHasTarget(): this {
        this.isGuarded = true;
        const message = this.args[0] as ChatMessagePF2e | undefined;
        if (!message?.target?.actor) {
            this.shouldRun = false;
        }
        return this;
    }

    /**
     * Restricts execution to chat messages whose target actor possesses the specified active effect.
     * 
     * @param effectSlug The slug of the active effect.
     * @returns The HookRunner instance for chaining.
     */
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

    /**
     * Restricts execution to chat messages whose roll outcome matches one of the specified values
     * (e.g. "success", "failure", "criticalFailure").
     * 
     * @param outcomes The roll outcomes that allow execution.
     * @returns The HookRunner instance for chaining.
     */
    ifMessageOutcomeIn(...outcomes: string[]): this {
        this.isGuarded = true;
        const message = this.args[0] as ChatMessagePF2e | undefined;
        const outcome = message?.flags.pf2e?.context?.outcome;
        if (!outcome || !outcomes.includes(outcome)) {
            this.shouldRun = false;
        }
        return this;
    }

    /**
     * Restricts execution to hook arguments containing an actor who has the specified feat.
     * 
     * @param featSlug The slug of the feat.
     * @returns The HookRunner instance for chaining.
     */
    ifActorHasFeat(featSlug: string): this {
        this.isGuarded = true;
        const actor = this.getActor();
        const hasFeat = actor?.itemTypes.feat.some(f => f.slug === featSlug) ?? false;
        if (!hasFeat) {
            this.shouldRun = false;
        }
        return this;
    }

    /**
     * Restricts execution to hook arguments containing an actor who has the specified active effect.
     * 
     * @param effectSlug The slug of the active effect.
     * @returns The HookRunner instance for chaining.
     */
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

    /**
     * Restricts execution to hook arguments containing an actor who has an active effect starting
     * with the specified prefix.
     * 
     * @param prefix The prefix string of the active effect slug.
     * @returns The HookRunner instance for chaining.
     */
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

    /**
     * Restricts execution to hook arguments containing an actor who has the specified condition.
     * 
     * @param conditionSlug The slug of the condition (e.g. "frightened").
     * @returns The HookRunner instance for chaining.
     */
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

    /**
     * Restricts execution to hook arguments containing an actor who has an active effect carrying
     * the specified module flag.
     * 
     * @param scope The flag scope namespace.
     * @param flagName The name of the flag to check.
     * @returns The HookRunner instance for chaining.
     */
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

    /**
     * Restricts execution to hook arguments containing an item of the specified document type.
     * 
     * @param type The document type of the item (e.g., "effect").
     * @returns The HookRunner instance for chaining.
     */
    ifItemType(type: string): this {
        this.isGuarded = true;
        const item = this.getItem();
        if (item?.type !== type) {
            this.shouldRun = false;
        }
        return this;
    }

    /**
     * Restricts execution to hook arguments containing an item with the specified slug.
     * 
     * @param slug The slug of the item.
     * @returns The HookRunner instance for chaining.
     */
    ifItemSlug(slug: string): this {
        this.isGuarded = true;
        const item = this.getItem();
        if (item?.slug !== slug) {
            this.shouldRun = false;
        }
        return this;
    }

    /**
     * Restricts execution to hook arguments containing an item whose slug starts with the
     * specified prefix.
     * 
     * @param prefix The prefix string of the item slug.
     * @returns The HookRunner instance for chaining.
     */
    ifItemSlugStartsWith(prefix: string): this {
        this.isGuarded = true;
        const item = this.getItem();
        if (!item?.slug?.startsWith(prefix)) {
            this.shouldRun = false;
        }
        return this;
    }

    /**
     * Restricts execution to hook arguments containing a token that carries the specified flag.
     * 
     * @param scope The flag scope namespace.
     * @param flagName The name of the flag.
     * @returns The HookRunner instance for chaining.
     */
    ifTokenHasFlag(scope: string, flagName: string): this {
        this.isGuarded = true;
        const token = this.getToken();
        const flagValue = token?.getFlag(scope, flagName);
        if (flagValue === undefined || flagValue === null || flagValue === "") {
            this.shouldRun = false;
        }
        return this;
    }

    /**
     * Restricts execution to scenes that contain at least one measured template carrying the
     * specified flag.
     * 
     * @param scope The flag scope namespace.
     * @param flagName The name of the flag.
     * @returns The HookRunner instance for chaining.
     */
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

    /**
     * Restricts execution to hook arguments containing a chat message carrying the specified flag.
     * 
     * @param scope The flag scope namespace.
     * @param flagName The name of the flag.
     * @returns The HookRunner instance for chaining.
     */
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

    /**
     * Safety bypass to mark a hook as explicitly allowed to run without any conditional filters.
     * Prevents the internal safety check from throwing an error.
     * 
     * @returns The HookRunner instance for chaining.
     */
    allowUnfilteredRun(): this {
        this.isGuarded = true;
        return this;
    }

    /**
     * Executes the registered hook callback function if all filters and guards passed.
     * 
     * @returns The result of the callback function, or false if bypassed.
     * @throws {Error} If no safety filters or allowUnfilteredRun() were called on the builder
     *                 before running.
     */
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
