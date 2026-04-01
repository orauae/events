import DOMPurify from "dompurify"

/**
 * Sanitize HTML content to prevent XSS attacks.
 * Allows safe HTML tags commonly used in email/message content.
 */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      "p", "br", "b", "strong", "i", "em", "u", "a", "ul", "ol", "li",
      "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "code",
      "span", "div", "img", "table", "thead", "tbody", "tr", "th", "td",
      "hr", "sup", "sub",
    ],
    ALLOWED_ATTR: [
      "href", "target", "rel", "src", "alt", "width", "height",
      "style", "class", "id", "colspan", "rowspan",
    ],
    ALLOW_DATA_ATTR: false,
  })
}
