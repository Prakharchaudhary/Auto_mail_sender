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
