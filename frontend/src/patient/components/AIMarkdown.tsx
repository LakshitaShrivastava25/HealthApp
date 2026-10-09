import ReactMarkdown from 'react-markdown';

/**
 * Renders an AI response's markdown correctly instead of showing raw
 * ** and - characters as literal text. Claude's answers are genuinely
 * formatted markdown (bold, bullet lists, occasional headers) — the
 * chat bubbles were just dropping the raw string into a <div> with no
 * parsing at all, so every "**bold**" showed up as literal asterisks.
 *
 * Styled narrowly for a chat-bubble context: no large heading sizes,
 * tight spacing, and lists that actually look like lists instead of
 * default browser indentation.
 *
 * The answer is model output grounded in uploaded documents, so it is
 * treated as untrusted: a document can carry instructions the model
 * follows. Raw HTML is dropped, images are not rendered (an image URL is a
 * request the browser makes on its own — a way to send record details to
 * someone else's server without a click), and only https links render, in
 * a new tab with no referrer.
 */
export default function AIMarkdown({ content }: { content: string }) {
  return (
    <div className="text-sm leading-relaxed space-y-2 [&_strong]:font-semibold">
      <ReactMarkdown
        skipHtml
        disallowedElements={['img']}
        unwrapDisallowed
        components={{
          p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-4 space-y-1 my-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-4 space-y-1 my-1">{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          h1: ({ children }) => <p className="font-semibold text-sm mt-1">{children}</p>,
          h2: ({ children }) => <p className="font-semibold text-sm mt-1">{children}</p>,
          h3: ({ children }) => <p className="font-semibold text-sm mt-1">{children}</p>,
          a: ({ href, children }) =>
            href && /^https:\/\//i.test(href) ? (
              <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2">
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
