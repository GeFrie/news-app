export function formatTimeToSql(date: Date | null | undefined): string | null {
 
    if (!date || isNaN(date.getTime())) return null;
 
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
 
    return `${hours}:${minutes}:00`;
}

  export function getTime(timeStr: string | null) {
    if (timeStr) {
      const parts = timeStr.split(':');
      const date = new Date();
      date.setHours(Number(parts[0]), Number(parts[1]), 0, 0);
      return date;
    }
    return null;
  }
