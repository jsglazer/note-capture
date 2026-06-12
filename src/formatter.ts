/** Substitute the page number into the user's page-reference template. */
export function formatPage(template: string, page: string): string {
  return template.split("${page}").join(page);
}

/**
 * Build a Markdown bullet line.
 *   buildBullet("the author argues X", "42", "(${page})", false, "\t")
 *     -> "- the author argues X (42)"
 *   nested == true prepends the indent:
 *     -> "\t- a sub point (42)"
 */
export function buildBullet(
  text: string,
  page: string,
  pageTemplate: string,
  nested: boolean,
  indent: string
): string {
  const ref = formatPage(pageTemplate, page);
  const prefix = nested ? indent : "";
  return `${prefix}- ${text} ${ref}`;
}
