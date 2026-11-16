"""
One date parser for everything read out of an AI response.

The structuring prompts tell the model to return ISO "YYYY-MM-DD" and to
return null when a printed date is genuinely ambiguous, but a prompt is not
a contract. Before this, both callers used `date.fromisoformat` alone, so a
model that passed a date through as it appeared on the page — "14/03/2026",
which is how most Indian prescriptions and lab reports print it — produced
None, and the document silently came back with no date at all.

Day-first, not month-first: these are Indian documents, and the prompts
already describe the printed form as DD/MM/YYYY. "03/05/2026" is therefore
read as 3 May. A model that cannot tell is instructed to return null rather
than guess, so this parser never has to.
"""

from datetime import date, datetime

# Tried in order. ISO first: it is what the prompts ask for, and what the
# database column already holds.
_FORMATS = ('%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y')


def parse_ai_date(value):
    """
    A `date` from whatever the model returned, or None.

    Never raises. One malformed date must not fail an entire upload — the
    person can always type it on the review screen.
    """
    if not value or not isinstance(value, str):
        return None
    text = value.strip()
    if not text:
        return None
    # ISO values may arrive as a full timestamp; the date part is enough.
    for fmt in _FORMATS:
        candidate = text[:10] if fmt == '%Y-%m-%d' else text
        try:
            return datetime.strptime(candidate, fmt).date()
        except ValueError:
            continue
    return None


__all__ = ['parse_ai_date', 'date']
