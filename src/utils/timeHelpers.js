export const timeStringToDate = (str) => {
  const [hour, minute] = str.split(':').map(Number);
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
};

export const dateToTimeString = (date) => {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
};

export const formatTime = (str) => {
  const [hour, minute] = str.split(':').map(Number);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h = hour % 12 || 12;
  return `${h}:${String(minute).padStart(2, '0')} ${ampm}`;
};

// Hours between bedtime and wake time, wrapping past midnight
export const computeSleepHours = (bedTime, wakeTime) => {
  const toMinutes = (t) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  let diff = toMinutes(wakeTime) - toMinutes(bedTime);
  if (diff <= 0) diff += 24 * 60;
  return Math.min(12, Math.round((diff / 60) * 10) / 10);
};
