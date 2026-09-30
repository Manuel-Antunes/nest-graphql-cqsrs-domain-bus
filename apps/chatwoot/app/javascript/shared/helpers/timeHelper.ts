import {
  format,
  isSameYear,
  isThisYear,
  isToday,
  isYesterday,
  fromUnixTime,
  formatDistanceToNow,
  differenceInDays,
} from 'date-fns';
import { enUS, ptBR } from 'date-fns/locale';

/**
 * Display locale for relative times. The dashboard is pinned to `pt_BR`
 * (`dashboard/i18n/instance.js`), and `date-fns` defaults to en-US, which is
 * why the contact notes read "less than a minute ago" (issue #555).
 *
 * This file is `shared/`, so it is also in the widget's import graph — but the
 * widget only pulls `messageStamp`, and `date-fns` is `sideEffects: false`, so
 * these two locale objects tree-shake out of the widget bundle.
 */
const DISPLAY_LOCALE = ptBR;

/**
 * Locale for the distance strings that get PARSED rather than displayed.
 *
 * `shortTimestamp` below and `shortenSnoozeTime`
 * (`dashboard/helper/snoozeHelpers.js`) both work by matching English words
 * ("minutes ago", a leading "in ") to reach the number. Feeding them the
 * display locale is what makes translating `dynamicTime` silently blank out
 * every short timestamp in the conversation and inbox lists, so their input is
 * pinned here instead of following the display.
 */
const PARSE_LOCALE = enUS;

/**
 * Formats a Unix timestamp into a human-readable time format.
 * @param time - Unix timestamp.
 * @param dateFormat - Desired format of the time.
 * @returns Formatted time string.
 */
export const messageStamp = (time: number, dateFormat = 'h:mm a'): string => {
  const unixTime = fromUnixTime(time);
  return format(unixTime, dateFormat);
};

/**
 * Provides a formatted timestamp, adjusting the format based on the current year.
 * @param time - Unix timestamp.
 * @param dateFormat - Desired date format.
 * @returns Formatted date string.
 */
export const messageTimestamp = (
  time: number,
  dateFormat = 'MMM d, yyyy'
): string => {
  const messageTime = fromUnixTime(time);
  const now = new Date();
  const messageDate = format(messageTime, dateFormat);
  if (!isSameYear(messageTime, now)) {
    return format(messageTime, 'LLL d y, h:mm a');
  }
  return messageDate;
};

/**
 * Formats a Unix timestamp relative to today: the time for today, a caller-
 * supplied label for yesterday, and a date otherwise. The yesterday label is
 * passed in so the caller keeps ownership of translation.
 * @param time - Unix timestamp.
 * @param yesterdayLabel - Localized label shown for yesterday.
 * @returns Formatted timestamp string.
 */
export const relativeDayTimestamp = (
  time: number,
  yesterdayLabel: string
): string => {
  const date = fromUnixTime(time);
  if (isToday(date)) return format(date, 'h:mm a');
  if (isYesterday(date)) return yesterdayLabel;
  if (isThisYear(date)) return format(date, 'MMM d');
  return format(date, 'MMM d, yyyy');
};

/**
 * Converts a Unix timestamp to a relative time string for DISPLAY, in the
 * dashboard's locale (e.g. `há 3 horas`).
 * @param time - Unix timestamp.
 * @returns Relative time string.
 */
export const dynamicTime = (time: number): string => {
  const unixTime = fromUnixTime(time);
  return formatDistanceToNow(unixTime, {
    addSuffix: true,
    locale: DISPLAY_LOCALE,
  });
};

/**
 * The same relative time, in ENGLISH, for the helpers that PARSE it instead of
 * rendering it — {@link shortTimestamp} here and `shortenSnoozeTime` in
 * `dashboard/helper/snoozeHelpers.js`.
 *
 * Never put this on screen; use {@link dynamicTime} for that. It exists so a
 * change of display language cannot reach the parsers.
 * @param time - Unix timestamp.
 * @returns Relative time string in en-US.
 */
export const dynamicTimeInEnglish = (time: number): string => {
  const unixTime = fromUnixTime(time);
  return formatDistanceToNow(unixTime, {
    addSuffix: true,
    locale: PARSE_LOCALE,
  });
};

/**
 * Formats a Unix timestamp into a specified date format.
 * @param time - Unix timestamp.
 * @param df - Desired date format.
 * @returns Formatted date string.
 */
export const dateFormat = (time: number, df = 'MMM d, yyyy'): string => {
  const unixTime = fromUnixTime(time);
  return format(unixTime, df);
};

/**
 * Shortens a relative time to `1m` / `1h` / `1d` / `1mo` / `1y`.
 *
 * Pass a **Unix timestamp** — the English distance string is then produced
 * internally, so the caller never has to know that the shortening works by
 * reading English words. A string is still accepted for callers that already
 * hold one (and for upstream compatibility), but it MUST be English: a
 * localized string falls through every branch below and is returned unchanged,
 * which is how "há 5 minutos" would reach a slot sized for "5m".
 *
 * The bucketing is `date-fns`' (`about 1 hour` for 50 minutes, and so on), so
 * output is unchanged from when callers passed `dynamicTime(...)` themselves.
 *
 * @param time - Unix timestamp, or an English distance string.
 * @param withAgo - Append ' ago'. English-only, and unused by the app today.
 * @returns Shortened time description.
 */
export const shortTimestamp = (
  time: number | string,
  withAgo = false
): string => {
  if (typeof time === 'number') {
    return shortTimestamp(dynamicTimeInEnglish(time), withAgo);
  }
  // This function takes a time string and converts it to a short time string
  // with the following format: 1m, 1h, 1d, 1mo, 1y
  // The function also takes an optional boolean parameter withAgo
  // which will add the word "ago" to the end of the time string
  const suffix = withAgo ? ' ago' : '';
  const timeMappings: Record<string, string> = {
    'less than a minute ago': 'now',
    'in less than a minute': 'now',
    'a minute ago': `1m${suffix}`,
    'an hour ago': `1h${suffix}`,
    'a day ago': `1d${suffix}`,
    'a month ago': `1mo${suffix}`,
    'a year ago': `1y${suffix}`,
  };
  // Check if the time string is one of the specific cases
  if (timeMappings[time]) {
    return timeMappings[time];
  }
  const convertToShortTime = time
    .replace(/about|over|almost|/g, '')
    .replace(' minute ago', `m${suffix}`)
    .replace(' minutes ago', `m${suffix}`)
    .replace(' hour ago', `h${suffix}`)
    .replace(' hours ago', `h${suffix}`)
    .replace(' day ago', `d${suffix}`)
    .replace(' days ago', `d${suffix}`)
    .replace(' month ago', `mo${suffix}`)
    .replace(' months ago', `mo${suffix}`)
    .replace(' year ago', `y${suffix}`)
    .replace(' years ago', `y${suffix}`);
  return convertToShortTime;
};

/**
 * Formats a duration in seconds into mm:ss or hh:mm:ss.
 * @param durationInSeconds - Duration in seconds.
 * @returns Formatted duration string. Empty string for invalid input.
 */
export const formatDuration = (
  durationInSeconds: number | string | null | undefined
): string => {
  if (durationInSeconds === null || durationInSeconds === undefined) return '';

  const totalSeconds = Number(durationInSeconds);
  if (Number.isNaN(totalSeconds) || totalSeconds < 0) return '';

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const mm = minutes.toString().padStart(2, '0');
  const ss = seconds.toString().padStart(2, '0');
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
};

/**
 * Calculates the difference in days between now and a given timestamp.
 * @param now - Current date/time.
 * @param timestampInSeconds - Unix timestamp in seconds.
 * @returns Number of days difference.
 */
export const getDayDifferenceFromNow = (
  now: Date,
  timestampInSeconds: number
): number => {
  const date = new Date(timestampInSeconds * 1000);
  return differenceInDays(now, date);
};

/**
 * Checks if more than 24 hours have passed since a given timestamp.
 * Useful for determining if retry/refresh actions should be disabled.
 * @param timestamp - Unix timestamp.
 * @returns True if more than 24 hours have passed.
 */
export const hasOneDayPassed = (timestamp?: number): boolean => {
  if (!timestamp) return true; // Defensive check
  return getDayDifferenceFromNow(new Date(), timestamp) >= 1;
};
