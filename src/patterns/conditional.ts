export interface ConditionalOptions<T> {
    condition: () => boolean | Promise<boolean>;
    then: () => Promise<T>;
    else?: () => Promise<T>;
}

export async function conditional<T>(
    options: ConditionalOptions<T>
): Promise<T | undefined> {
    if (await options.condition()) {
        return options.then();
    } else if (options.else) {
        return options.else();
    }
    return undefined;
}
