export type BlogFaqItem = {
  question: string;
  answerHtml: string;
};

const decodeText = (value: string) => value
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&nbsp;/g, ' ')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ')
  .trim();

const faqHeadingPattern = /<h2\b[^>]*>\s*(?:frequently\s+asked\s+questions|faq|faqs)\s*<\/h2>/i;

export const extractBlogFaq = (html: string): BlogFaqItem[] => {
  const headingMatch = faqHeadingPattern.exec(html);
  if (!headingMatch) return [];

  const section = html.slice(headingMatch.index + headingMatch[0].length);
  const sectionUntilNextHeading = section.split(/<h2\b/i, 1)[0] || section;

  return Array.from(sectionUntilNextHeading.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)(?=<h3\b|$)/gi))
    .map((match) => ({
      question: decodeText(match[1]),
      answerHtml: match[2].trim(),
    }))
    .filter((item) => item.question.length > 0 && decodeText(item.answerHtml).length > 0);
};

export const removeBlogFaqSection = (html: string) => {
  const headingMatch = faqHeadingPattern.exec(html);
  if (!headingMatch) return html;

  const before = html.slice(0, headingMatch.index);
  const afterSection = html.slice(headingMatch.index + headingMatch[0].length).split(/<h2\b/i);
  return `${before}${afterSection.length > 1 ? `<h2${afterSection[1]}` : ''}`.trim();
};

export const faqAnswerToPlainText = (answerHtml: string) => decodeText(answerHtml);
