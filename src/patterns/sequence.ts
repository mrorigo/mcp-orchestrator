export async function sequence<T>(
    steps: Array<(ctx: T) => Promise<T>>,
    initialContext: T
): Promise<T> {
    let context = initialContext;
    for (const step of steps) {
        context = await step(context);
    }
    return context;
}
