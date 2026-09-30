import fromUnixTime from 'date-fns/fromUnixTime';
import format from 'date-fns/format';
import isToday from 'date-fns/isToday';
import isYesterday from 'date-fns/isYesterday';
import { endOfDay, getUnixTime, startOfDay } from 'date-fns';

export const formatUnixDate = (
  date: number,
  dateFormat = 'MMM dd, yyyy'
): string => {
  const unixDate = fromUnixTime(date);
  return format(unixDate, dateFormat);
};

interface FormatDateOptions {
  date: string;
  todayText: string;
  yesterdayText: string;
}

export const formatDate = ({
  date,
  todayText,
  yesterdayText,
}: FormatDateOptions): string => {
  const dateValue = new Date(date);
  if (isToday(dateValue)) return todayText;
  if (isYesterday(dateValue)) return yesterdayText;
  return date;
};

export const isTimeAfter = (
  h1: number,
  m1: number,
  h2: number,
  m2: number
): boolean => {
  if (h1 < h2) {
    return false;
  }

  if (h1 === h2) {
    return m1 >= m2;
  }

  return true;
};

/** Get start of day as a UNIX timestamp */
export const getUnixStartOfDay = (date: Date | number): number =>
  getUnixTime(startOfDay(date));

/** Get end of day as a UNIX timestamp */
export const getUnixEndOfDay = (date: Date | number): number =>
  getUnixTime(endOfDay(date));

export const generateRelativeTime = (
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
  languageCode?: string
): string => {
  const code = languageCode?.replace(/_/g, '-'); // Hacky fix we need to handle it from source
  const rtf = new Intl.RelativeTimeFormat(code, {
    numeric: 'auto',
  });
  return rtf.format(value, unit);
};
