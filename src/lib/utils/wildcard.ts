export function toWildcardRegExp(pattern: string) {
  try {
    const escaped = pattern.replace(/[-/\\^$+?.()|[\]{}]/g, "\\$&");
    const regexPattern = `^${escaped.replace(/\\\*/g, ".*")}$`;
    return new RegExp(regexPattern);
  } catch {
    return undefined;
  }
}

export function createWildcardRegexes(patterns: Iterable<string>) {
  const regexes: RegExp[] = [];
  for (const pattern of patterns) {
    const regex = toWildcardRegExp(pattern);
    if (regex) {
      regexes.push(regex);
    }
  }
  return regexes;
}

export function partitionWildcardPatterns(patterns: Iterable<string>) {
  const exact: string[] = [];
  const wildcard: string[] = [];

  for (const pattern of patterns) {
    if (pattern.includes("*")) {
      wildcard.push(pattern);
    } else {
      exact.push(pattern);
    }
  }

  return { exact, wildcard };
}
