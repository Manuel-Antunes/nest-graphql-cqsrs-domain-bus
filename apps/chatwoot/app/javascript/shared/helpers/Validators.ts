/**
 * Checks if a string is a valid E.164 phone number format.
 */
export const isPhoneE164 = (value: string): boolean =>
  !!value.match(/^\+[1-9]\d{1,14}$/);

/**
 * Validates a phone number after removing the dial code.
 */
export const isPhoneNumberValid = (value: string, dialCode: string): boolean => {
  const number = value.replace(dialCode, '');
  return !!number.match(/^[0-9]{1,14}$/);
};

/**
 * Checks if a string is either a valid E.164 phone number or empty.
 */
export const isPhoneE164OrEmpty = (value: string): boolean =>
  isPhoneE164(value) || value === '';

/**
 * Validates a phone number with dial code, requiring at least 5 digits.
 */
export const isPhoneNumberValidWithDialCode = (value: string): boolean => {
  const number = value.replace(/^\+/, ''); // Remove the '+' sign
  return !!number.match(/^[1-9]\d{4,}$/); // Validate the phone number with minimum 5 digits
};

/**
 * Checks if a string starts with a plus sign.
 */
export const startsWithPlus = (value: string): boolean => value.startsWith('+');

/**
 * Checks if a string is a valid URL (starts with 'http') or is empty.
 */
export const shouldBeUrl = (value = ''): boolean =>
  value ? value.startsWith('http') : true;

/**
 * Validates a password for complexity requirements.
 */
export const isValidPassword = (value: string): boolean => {
  const containsUppercase = /[A-Z]/.test(value);
  const containsLowercase = /[a-z]/.test(value);
  const containsNumber = /[0-9]/.test(value);
  const containsSpecialCharacter = /[!@#$%^&*()_+\-=[\]{}|'"/\\.,`<>:;?~]/.test(
    value
  );
  return (
    containsUppercase &&
    containsLowercase &&
    containsNumber &&
    containsSpecialCharacter
  );
};

/**
 * Checks if a string consists only of digits.
 */
export const isNumber = (value: string): boolean => /^\d+$/.test(value);

/**
 * Validates a domain name.
 */
export const isDomain = (value: string): boolean => {
  if (value !== '') {
    const domainRegex = /^([\p{L}0-9]+(-[\p{L}0-9]+)*\.)+[a-z]{2,}$/gmu;
    return domainRegex.test(value);
  }
  return true;
};

/**
 * Creates a RegExp object from a string representation of a regular expression.
 */
export const getRegexp = (regexPatternValue: string): RegExp => {
  let lastSlash = regexPatternValue.lastIndexOf('/');
  return new RegExp(
    regexPatternValue.slice(1, lastSlash),
    regexPatternValue.slice(lastSlash + 1)
  );
};

/**
 * Checks if a string is a valid slug (letters, numbers, hyphens only, no spaces or other symbols).
 */
export const isValidSlug = (value: string): boolean =>
  /^[a-zA-Z0-9-]+$/.test(value);
