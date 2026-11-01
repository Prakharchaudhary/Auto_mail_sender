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

/** "09:30" -> 570 (minutes after midnight). Returns null for bad input. */
export function parseClock(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Minutes after local midnight of `date` in the given timezone. */
export function localMinutesOfDay(date = new Date(), timeZone = 'Asia/Kolkata') {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return Number(parts.hour) * 60 + Number(parts.minute);
}

/**
 * True when `date` falls inside the [start, end) sending window ("09:30"-"18:00")
 * in the given timezone. A bad or missing window means "no restriction".
 */
export function isWithinSendWindow(date, timeZone, start, end) {
  const from = parseClock(start);
  const to = parseClock(end);
  if (from === null || to === null || from === to) return true;
  const now = localMinutesOfDay(date, timeZone);
  return from < to ? now >= from && now < to : now >= from || now < to;
}

/**
 * "YYYY-MM-DD" range in the given timezone -> { start, end } UTC Dates (end exclusive).
 * Either side may be empty. Throws a 400 error for malformed dates.
 */
export function localDateRange(from, to, timeZone = 'Asia/Kolkata') {
  const toDayStart = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const error = new Error('Dates must look like YYYY-MM-DD.');
      error.statusCode = 400;
      throw error;
    }
    // Noon UTC is still the same calendar date in any timezone between UTC-11 and UTC+11.
    return localDayInfo(new Date(`${value}T12:00:00Z`), timeZone).startOfDay;
  };
  const range = {};
  if (from) range.start = toDayStart(String(from));
  if (to) range.end = new Date(toDayStart(String(to)).getTime() + 24 * 60 * 60 * 1000);
  if (range.start && range.end && range.start >= range.end) {
    const error = new Error('"From" date must be on or before "To" date.');
    error.statusCode = 400;
    throw error;
  }
  return range;
}

/** The job role a campaign applies for: the saved role, else taken from the subject or name. */
export function campaignAppliedRole(campaign = {}) {
  if (campaign.role) return String(campaign.role).trim();
  const fromSubject = /application\s+for\s+(?:the\s+)?(.+?)(?:\s+(?:role|position|opening))?\s*$/i.exec(campaign.subject || '');
  if (fromSubject) return fromSubject[1].trim();
  return String(campaign.name || '').replace(/\s+applications?$/i, '').trim();
}
