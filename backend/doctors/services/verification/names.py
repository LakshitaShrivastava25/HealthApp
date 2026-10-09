import re
from difflib import SequenceMatcher

# Titles and degrees people put in front of or after their name; the register
# stores the bare name.
_TITLES = {'dr', 'doctor', 'prof', 'professor', 'mr', 'mrs', 'ms', 'shri', 'smt', 'kumari'}


def _tokens(name: str) -> list[str]:
    words = re.sub(r'[^a-z\s]', ' ', (name or '').lower()).split()
    return [w for w in words if w not in _TITLES]


def compute_name_match(submitted: str, nmc_name: str) -> float:
    """
    How closely the name a doctor typed matches the register's, 0.0–1.0.

    Indian names are routinely reordered ("Rao Asha" / "Asha Rao") and
    shortened ("A. K. Sharma"), so the comparison is on sorted words, and a
    name whose every word appears in the other one counts as a full match —
    "Asha Rao" against the register's "ASHA KRISHNA RAO".
    """
    a, b = _tokens(submitted), _tokens(nmc_name)
    if not a or not b:
        return 0.0
    shorter, longer = (a, b) if len(a) <= len(b) else (b, a)
    if set(shorter) <= set(longer):
        return 1.0
    # Initials: "a k sharma" covers "anil kumar sharma" when each single
    # letter starts a word of the other name and the full words match.
    full = [w for w in shorter if len(w) > 1]
    initials = [w for w in shorter if len(w) == 1]
    if full and set(full) <= set(longer):
        rest = [w for w in longer if w not in full]
        if all(any(r.startswith(i) for r in rest) for i in initials):
            return 1.0
    return SequenceMatcher(None, ' '.join(sorted(a)), ' '.join(sorted(b))).ratio()
