export function DateTimeString(start?: string, end?: string) {
    if (start) {
        return start.includes('T') ? start : `${start}T00:00:00`;
    } else if (end) {
        return end.includes('T') ? end : `${end}T23:59:59`;
    } 
    return '';
}