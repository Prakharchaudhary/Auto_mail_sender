export function isBusinessDay(date = new Date(), allowedDays = []) {
  const day = new Date(date).getDay();

  if (!Array.isArray(allowedDays) || allowedDays.length === 0) {
    return true;
  }

  return allowedDays.includes(day);
}

export function getAllowedDailyBatchSize(campaign = {}, sentTodayCount = 0, referenceDate = new Date()) {
  const allowedDays = Array.isArray(campaign.allowedDays) ? campaign.allowedDays : [];

  if (!isBusinessDay(referenceDate, allowedDays)) {
    return 0;
  }

  const dailyLimit = Number(campaign.dailyLimit || 10);
  const batchSize = Number(campaign.batchSize || 10);
  const sentCount = Number(sentTodayCount || 0);
  const remainingToday = Math.max(dailyLimit - sentCount, 0);

  return Math.min(batchSize, remainingToday);
}

/**
 * Midnight (as a UTC Date) and weekday (0 = Sunday) of `date` in the given IANA timezone.
 * Used so "today" and the daily limit follow Indian time even though Vercel runs in UTC.
 */
export function localDayInfo(date = new Date(), timeZone = 'Asia/Kolkata') {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date).map((part) => [part.type, part.value]),
  );

  const year = Number(parts.year);
  const month = Number(parts.month) - 1;
  const day = Number(parts.day);
  const localAsUtc = Date.UTC(year, month, day, Number(parts.hour), Number(parts.minute), Number(parts.second));
  const offsetMs = localAsUtc - Math.floor(date.getTime() / 1000) * 1000;

  return {
    startOfDay: new Date(Date.UTC(year, month, day) - offsetMs),
    weekday: new Date(Date.UTC(year, month, day)).getUTCDay(),
  };
}
