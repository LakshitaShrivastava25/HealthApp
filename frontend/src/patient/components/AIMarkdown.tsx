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
 */
export default function AIMarkdown({ content }: { content: string }) {
  return (
    <div className="text-sm leading-relaxed space-y-2 [&_strong]:font-semibold">
      <ReactMarkdown
        components={{
          p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-4 space-y-1 my-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-4 space-y-1 my-1">{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          h1: ({ children }) => <p className="font-semibold text-sm mt-1">{children}</p>,
          h2: ({ children }) => <p className="font-semibold text-sm mt-1">{children}</p>,
          h3: ({ children }) => <p className="font-semibold text-sm mt-1">{children}</p>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
