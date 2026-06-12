/** Substitute the page number (with optional prefix) into the user's page-reference template. */
export function formatPage(template: string, page: string, pagePrefix = ""): string {
  return template.split("${page}").join(pagePrefix + page);
}

/**
 * Build a Markdown bullet line.
 *   buildBullet("the author argues X", "42", "(${page})", false, "\t")
 *     -> "- the author argues X (42)"
 *   nested == true prepends the indent:
 *     -> "\t- a sub point (42)"
 *   pagePrefix "Smith, " with page "42":
 *     -> "- the author argues X (Smith, 42)"
 */
export function buildBullet(
  text: string,
  page: string,
  pageTemplate: string,
  nested: boolean,
  indent: string,
  pagePrefix = ""
): string {
  const ref = formatPage(pageTemplate, page, pagePrefix);
  const linePrefix = nested ? indent : "";
  return `${linePrefix}- ${text} ${ref}`;
}
