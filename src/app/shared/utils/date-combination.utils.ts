export function combineDateAndTime(date: Date | null, time: Date | null): Date | null {
    if (!date) {
        return null;
    }

    const combined = new Date(date);
    combined.setHours(
        time?.getHours() ?? 23,
        time?.getMinutes() ?? 59,
        time?.getSeconds() ?? 59,
        time?.getMilliseconds() ?? 0
    );
    return combined;
}