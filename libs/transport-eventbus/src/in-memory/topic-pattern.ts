/**
 * AMQP topic matching: `*` matches exactly one segment, `#` matches zero or more.
 *
 * It is here because the in-process transport has to do for itself what a broker does for the real
 * ones — and because it is what lets a spec assert that a binding matches (or does not) with nothing
 * running.
 */
export const topicMatches = (pattern: string, routingKey: string): boolean =>
  matches(pattern.split('.'), routingKey.split('.'));

const matches = (
  pattern: readonly string[],
  key: readonly string[],
): boolean => {
  if (pattern.length === 0) {
    return key.length === 0;
  }
  const [segment, ...rest] = pattern;
  if (segment === '#') {
    for (let skipped = 0; skipped <= key.length; skipped++) {
      if (matches(rest, key.slice(skipped))) {
        return true;
      }
    }
    return false;
  }
  if (key.length === 0) {
    return false;
  }
  return (segment === '*' || segment === key[0]) && matches(rest, key.slice(1));
};
