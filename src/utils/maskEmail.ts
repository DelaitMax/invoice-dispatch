export function maskEmail(email: string): string {
  const atIndex = email.indexOf("@");

  if (atIndex <= 0) {
    return "***";
  }

  return `${email[0]}***${email.slice(atIndex)}`;
}
