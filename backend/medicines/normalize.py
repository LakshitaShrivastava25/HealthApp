"""
Deciding whether two prescription lines are the same medicine.

A person's prescriptions over several years name one medicine in many ways:
"ASPIRIN 75MG (ECOSPRIN)", "Aspirin 150mg", "Ecosprin 150". Treating every
spelling as a separate medicine is what turned one Aspirin into nine rows.
Merging anything whose name merely *looks* similar is the opposite mistake,
and a dangerous one — look-alike drug names are a known source of errors.

So identity here is strict and explainable:

  * the active ingredient(s), after brand → generic and spelling
    normalisation (case, salts, units, combination order);
  * the route (by mouth, injection, eye, ...);
  * whether it is a modified-release form (CR/SR/ER/XL...) — a plain tablet
    and a CR tablet of the same drug are different products and are often
    taken together (e.g. Syndopa Plus by day, Syndopa CR at night).

Strength is deliberately NOT part of identity: a strength change between
prescriptions is the same medicine being modified, and is reported as such.

Everything in this module is pure (no database access) so it can be used
from migrations, management commands and tests alike.
"""

import re
import unicodedata
from dataclasses import dataclass
from datetime import date, timedelta
from difflib import SequenceMatcher

# Brand -> active ingredients, for brands whose composition is certain.
# This is a fallback: new uploads get generic names from the extraction
# itself, and `normalize_medicines_ai` can fill older records. Keep entries
# to brands that cannot be ambiguous — a wrong entry here would merge two
# different medicines. Multi-word brands are matched before shorter ones.
BRAND_GENERICS = {
    'ecosprin av': ('aspirin', 'atorvastatin'),
    'ecosprin': ('aspirin',),
    'disprin': ('aspirin',),
    'thyronorm': ('levothyroxine',),
    'eltroxin': ('levothyroxine',),
    'thyrox': ('levothyroxine',),
    'syndopa': ('carbidopa', 'levodopa'),
    'tidomet': ('carbidopa', 'levodopa'),
    'brilinta': ('ticagrelor',),
    'pan d': ('domperidone', 'pantoprazole'),
    'pan': ('pantoprazole',),
    'pantocid': ('pantoprazole',),
    'meconerv': ('mecobalamin',),
    'encicarb': ('ferric carboxymaltose',),
    'ferinject': ('ferric carboxymaltose',),
    'dolo': ('paracetamol',),
    'calpol': ('paracetamol',),
    'crocin': ('paracetamol',),
    'telma h': ('hydrochlorothiazide', 'telmisartan'),
    'telma am': ('amlodipine', 'telmisartan'),
    'telma': ('telmisartan',),
    'amlong': ('amlodipine',),
    'stamlo': ('amlodipine',),
    'glycomet': ('metformin',),
    'clopilet': ('clopidogrel',),
    'plavix': ('clopidogrel',),
    'storvas': ('atorvastatin',),
    'lipitor': ('atorvastatin',),
    'rosuvas': ('rosuvastatin',),
    'rozavel': ('rosuvastatin',),
    'crestor': ('rosuvastatin',),
    'shelcal': ('calcium carbonate', 'cholecalciferol'),
    'pacitane': ('trihexyphenidyl',),
    'amantrel': ('amantadine',),
    'lasix': ('furosemide',),
    'concor': ('bisoprolol',),
    'augmentin': ('amoxicillin', 'clavulanic acid'),
    'azithral': ('azithromycin',),
    'azee': ('azithromycin',),
    'omez': ('omeprazole',),
    'rablet': ('rabeprazole',),
    'razo': ('rabeprazole',),
    'montair': ('montelukast',),
    'allegra': ('fexofenadine',),
    'januvia': ('sitagliptin',),
    'ultracet': ('paracetamol', 'tramadol'),
}
_BRANDS_LONGEST_FIRST = sorted(BRAND_GENERICS, key=len, reverse=True)

# Different names for the same active ingredient.
GENERIC_SYNONYMS = {
    'acetaminophen': 'paracetamol',
    'acetylsalicylic acid': 'aspirin',
    'thyroxine': 'levothyroxine',
    'l thyroxine': 'levothyroxine',
    'methylcobalamin': 'mecobalamin',
    'methylcobalamine': 'mecobalamin',
    'vitamin d3': 'cholecalciferol',
    'vit d3': 'cholecalciferol',
    'frusemide': 'furosemide',
    'l dopa': 'levodopa',
    'clavulanate': 'clavulanic acid',
    'clavulanate potassium': 'clavulanic acid',
    'albuterol': 'salbutamol',
    'glyceryl trinitrate': 'nitroglycerin',
}

# Salt names dropped when they FOLLOW the drug ("losartan potassium" ->
# "losartan"), never when they are the drug ("potassium chloride").
SALT_WORDS = {
    'hydrochloride', 'hcl', 'dihydrochloride', 'sodium', 'potassium',
    'besylate', 'besilate', 'maleate', 'mesylate', 'hyclate', 'monohydrate',
}

# Words naming the dosage form -> (form, route).
FORM_WORDS = {
    'tab': ('tablet', 'oral'), 'tabs': ('tablet', 'oral'), 'tablet': ('tablet', 'oral'),
    'tablets': ('tablet', 'oral'), 'cap': ('capsule', 'oral'), 'caps': ('capsule', 'oral'),
    'capsule': ('capsule', 'oral'), 'capsules': ('capsule', 'oral'),
    'syp': ('syrup', 'oral'), 'syrup': ('syrup', 'oral'), 'susp': ('suspension', 'oral'),
    'suspension': ('suspension', 'oral'), 'sachet': ('sachet', 'oral'),
    'inj': ('injection', 'injection'), 'injection': ('injection', 'injection'),
    'vial': ('injection', 'injection'), 'vials': ('injection', 'injection'),
    'amp': ('injection', 'injection'), 'ampoule': ('injection', 'injection'),
    'infusion': ('injection', 'injection'),
    'cream': ('cream', 'topical'), 'oint': ('ointment', 'topical'),
    'ointment': ('ointment', 'topical'), 'gel': ('gel', 'topical'), 'lotion': ('lotion', 'topical'),
    'inhaler': ('inhaler', 'inhaled'), 'rotacap': ('inhaler', 'inhaled'),
    'rotacaps': ('inhaler', 'inhaled'), 'respules': ('nebuliser', 'inhaled'),
    'patch': ('patch', 'transdermal'), 'supp': ('suppository', 'rectal'),
    'suppository': ('suppository', 'rectal'),
    'drop': ('drops', ''), 'drops': ('drops', ''),
}
ROUTE_HINTS = (
    (re.compile(r'\b(eye|ophthalmic)\b'), 'eye'),
    (re.compile(r'\b(ear|otic)\b'), 'ear'),
    (re.compile(r'\bnasal\b'), 'nasal'),
    (re.compile(r'\b(inj|injection|vials?|iv|im|sc|s/c|i/v|infusion|ns|normal saline)\b'), 'injection'),
)

# Modified-release markers. EC/DR (enteric coated, delayed release) are left
# out on purpose: an enteric-coated aspirin is still the same daily aspirin.
# "OD" is left out because on Indian prescriptions it almost always means
# "once daily", not "once-daily formulation".
RELEASE_WORDS = {'cr', 'sr', 'er', 'xr', 'xl', 'mr', 'pr', 'la', 'cd', 'retard'}
RELEASE_PHRASES = re.compile(
    r'\b(controlled|sustained|extended|modified|prolonged)[\s-]+release\b'
)

_UNIT_ALIASES = {'mcg': 'mcg', 'µg': 'mcg', 'μg': 'mcg', 'ug': 'mcg', 'mg': 'mg', 'g': 'g',
                 'gm': 'g', 'gms': 'g', 'ml': 'ml', 'iu': 'iu', 'unit': 'iu', 'units': 'iu', '%': '%'}
_STRENGTH = re.compile(
    r'(\d+(?:\.\d+)?)\s*(mcg|µg|μg|ug|mg|gms|gm|g|ml|iu|units|unit|%)(?![a-z])'
    r'(?:\s*/\s*(\d+(?:\.\d+)?)?\s*(ml)(?![a-z]))?'
)
_PAREN = re.compile(r'\(([^)]*)\)')
_SPLIT = re.compile(r'\s*(?:\+|&|/|,|\band\b|\bwith\b)\s*')


@dataclass(frozen=True)
class Identity:
    ingredients: tuple      # sorted generic names, e.g. ('carbidopa', 'levodopa')
    strengths: tuple        # as normalised, in written order, e.g. ('150 mg', '37.5 mg')
    strength_sig: tuple     # comparable strength signature
    form: str
    route: str
    release: str            # '' (standard) or 'mr' (modified release)
    release_label: str      # what was written, e.g. 'CR'
    brand: str
    key: str

    @property
    def generic_display(self):
        return ' + '.join(word.title() for word in self.ingredients)

    @property
    def strength_display(self):
        return ' + '.join(self.strengths)


def _fold(text):
    text = unicodedata.normalize('NFKC', str(text or '')).lower()
    return text.replace('µg', 'mcg').replace('μg', 'mcg')


def _number(value):
    num = float(value)
    return str(int(num)) if num == int(num) else f'{num:g}'


_ROUTE_VOCABULARY = {
    'oral': 'oral', 'po': 'oral', 'by mouth': 'oral', 'mouth': 'oral', 'sublingual': 'oral',
    'injection': 'injection', 'iv': 'injection', 'intravenous': 'injection', 'im': 'injection',
    'intramuscular': 'injection', 'sc': 'injection', 'subcutaneous': 'injection', 'parenteral': 'injection',
    'topical': 'topical', 'skin': 'topical', 'eye': 'eye', 'ophthalmic': 'eye', 'ear': 'ear', 'otic': 'ear',
    'nasal': 'nasal', 'inhaled': 'inhaled', 'inhalation': 'inhaled', 'transdermal': 'transdermal',
    'rectal': 'rectal', 'vaginal': 'vaginal',
}


def _route_from_hint(value):
    """Maps whatever route wording the extraction used onto this module's vocabulary."""
    return _ROUTE_VOCABULARY.get(_fold(value).strip(), '')


def _strengths(text):
    """Strengths in the order written, normalised ('1 g' -> '1000 mg')."""
    found = []
    for match in _STRENGTH.finditer(text):
        value, unit, per_value, per_unit = match.groups()
        unit = _UNIT_ALIASES[unit]
        num = float(value)
        if unit == 'g':
            num, unit = num * 1000, 'mg'
        strength = f'{_number(num)} {unit}'
        if per_unit:
            strength += f'/{_number(per_value) + " " if per_value else ""}ml'
        found.append(strength)
    return found


def _clean_piece(piece):
    words = re.sub(r'[^a-z\s-]', ' ', piece).replace('-', ' ').split()
    words = [w for w in words if w not in FORM_WORDS and w not in RELEASE_WORDS]
    # Salts only when they follow the drug name.
    if len(words) > 1:
        words = [words[0]] + [w for w in words[1:] if w not in SALT_WORDS]
    name = ' '.join(words).strip()
    return GENERIC_SYNONYMS.get(name, name)


def _brand_in(text):
    """The longest known brand that `text` starts with (whole words), or ''."""
    words = text.split()
    for brand in _BRANDS_LONGEST_FIRST:
        brand_words = brand.split()
        if words[:len(brand_words)] == brand_words:
            return brand
    return ''


def _split_generic_list(value):
    if not value:
        return []
    if isinstance(value, (list, tuple)):
        parts = value
    else:
        parts = _SPLIT.split(_fold(value))
    return [p for p in (_clean_piece(_fold(part)) for part in parts) if p]


def identify(name, dosage='', *, generic_name='', brand_name='', form='', route='', release=''):
    """
    The identity of one prescription line. `generic_name`, `brand_name`,
    `form`, `route` and `release` are optional hints from the AI extraction;
    the written name is always parsed too.
    """
    raw = _fold(name)
    dosage_text = _fold(dosage)
    paren_parts = [p.strip() for p in _PAREN.findall(raw)]
    base = _PAREN.sub(' ', raw)
    whole = f'{raw} {dosage_text}'

    # Release.
    release_label = ''
    for word in re.findall(r'[a-z]+', raw):
        if word in RELEASE_WORDS:
            release_label = word.upper()
            break
    if not release_label and RELEASE_PHRASES.search(raw):
        release_label = 'MR'
    hinted_release = _fold(release)
    if not release_label and (hinted_release in RELEASE_WORDS or RELEASE_PHRASES.search(hinted_release)):
        release_label = hinted_release.upper()[:10]
    release_class = 'mr' if release_label else ''

    # Form and route.
    found_form, found_route = '', ''
    for word in re.findall(r'[a-z]+', raw):
        if word in FORM_WORDS:
            found_form, found_route = FORM_WORDS[word]
            break
    found_form = found_form or _fold(form)[:30]
    found_route = found_route or _route_from_hint(route)
    if not found_route:
        for pattern, hinted in ROUTE_HINTS:
            if pattern.search(whole):
                found_route = hinted
                break
    route_value = found_route or 'oral'

    # Strengths: the name first, then anything in brackets, then the dose.
    strengths = _strengths(base) or _strengths(' '.join(paren_parts)) or _strengths(dosage_text)

    # Ingredients.
    stripped = _STRENGTH.sub(' ', base)
    pieces = [p for p in (_clean_piece(piece) for piece in _SPLIT.split(stripped)) if p]
    ingredients, raw_pieces, brand = [], [], ''
    for piece in pieces:
        found_brand = _brand_in(piece)
        if found_brand:
            brand = brand or found_brand
            ingredients.extend(BRAND_GENERICS[found_brand])
        else:
            raw_pieces.append(piece)
    for part in paren_parts:
        found_brand = _brand_in(_clean_piece(part))
        if found_brand:
            brand = brand or found_brand
            if not pieces:
                ingredients.extend(BRAND_GENERICS[found_brand])
    hinted_generics = _split_generic_list(generic_name)
    if raw_pieces:
        ingredients.extend(hinted_generics or raw_pieces)
    elif not ingredients and hinted_generics:
        ingredients.extend(hinted_generics)
    if not brand and brand_name:
        brand = _clean_piece(_fold(brand_name))
    if not brand:
        # A bracketed word that isn't a known brand is still how the
        # prescription named the product — keep it for display.
        for part in paren_parts:
            cleaned = _clean_piece(part)
            if cleaned and not _strengths(part):
                brand = cleaned
                break

    unique = tuple(sorted(set(i for i in ingredients if i)))

    # Pair strengths with ingredients only when the order is unambiguous:
    # as many written strengths as written ingredient names.
    written_order = raw_pieces if raw_pieces and not hinted_generics else []
    if len(unique) == 1 and len(strengths) == 1:
        strength_sig = (f'{unique[0]} {strengths[0]}',)
    elif written_order and len(written_order) == len(strengths) and len(set(written_order)) == len(written_order):
        strength_sig = tuple(sorted(f'{ing} {st}' for ing, st in zip(written_order, strengths)))
    else:
        strength_sig = tuple(sorted(strengths))

    if unique:
        key = f"{'+'.join(unique)}|{route_value}|{release_class}"
    else:
        fallback = re.sub(r'[^a-z]', '', stripped) or re.sub(r'[^a-z0-9]', '', raw)
        key = f'name:{fallback}|{route_value}|{release_class}'

    return Identity(
        ingredients=unique,
        strengths=tuple(strengths),
        strength_sig=strength_sig,
        form=found_form,
        route=route_value,
        release=release_class,
        release_label=release_label,
        brand=brand,
        key=key[:255],
    )


# -- frequency, duration and instructions --------------------------------

_DOSE_PATTERN = re.compile(
    r'(?<![\d.])(\d+(?:\.\d+)?|½)\s*-\s*(\d+(?:\.\d+)?|½)\s*-\s*(\d+(?:\.\d+)?|½)(?:\s*-\s*(\d+(?:\.\d+)?|½))?(?![\d.])'
)
_FREQUENCY_WORDS = (
    (re.compile(r'\b(stat|immediately|single dose|once only)\b'), 'stat'),
    (re.compile(r'\b(sos|prn|as needed|as required|when required|if required)\b'), 'prn'),
    (re.compile(r'\b(weekly|once a week|every week)\b'), 'weekly'),
    (re.compile(r'\b(alternate day|alternate days|every other day)\b'), 'alternate'),
    (re.compile(r'\b(qid|four times|4 times)\b'), '4'),
    (re.compile(r'\b(tds|tid|thrice|three times|3 times)\b'), '3'),
    (re.compile(r'\b(bd|bid|twice|two times|2 times)\b'), '2'),
    (re.compile(r'\b(od|qd|once daily|once a day|daily|every day|at bedtime|bedtime|hs|at night|every morning)\b'), '1'),
)


def frequency_signature(text):
    """
    How many doses a day, as a comparable string: '1', '2', '3', '1.5',
    'prn', 'weekly', 'stat' — or '' when it can't be read. Timing within
    the day (morning vs afternoon) is deliberately ignored: moving a dose
    from 1-0-0 to 0-1-0 is not a change of regimen worth flagging.
    """
    folded = _fold(text)
    if not folded:
        return ''
    match = _DOSE_PATTERN.search(folded)
    if match:
        total = sum(0.5 if part == '½' else float(part) for part in match.groups() if part)
        return _number(total)
    for pattern, signature in _FREQUENCY_WORDS:
        if pattern.search(folded):
            return signature
    return ''


_NUMBER_WORDS = {'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7,
                 'eight': 8, 'nine': 9, 'ten': 10, 'fifteen': 15, 'a': 1, 'an': 1}
_UNIT_DAYS = {'day': 1, 'days': 1, 'd': 1, 'week': 7, 'weeks': 7, 'wk': 7, 'wks': 7,
              'month': 30, 'months': 30, 'mon': 30, 'mth': 30, 'mths': 30, 'year': 365, 'years': 365}
_DURATION = re.compile(
    r'\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|a|an)\s*'
    r'(days|day|d|weeks|week|wks|wk|months|month|mths|mth|mon|years|year)\b'
)
_START_OFFSET = re.compile(
    r'\bstart(?:ing)?\s+(?:after|from)\s+(\d+|one|two|three|four|five|six|a|an)\s*'
    r'(days?|weeks?|months?)\b'
)
_ONGOING = re.compile(r'\b(till review|until review|continue|lifelong|life long|long term|ongoing|sos)\b')


def _days(amount, unit):
    count = _NUMBER_WORDS.get(amount) if not amount.isdigit() else int(amount)
    return (count or 0) * _UNIT_DAYS.get(unit, 0)


def course_end_date(prescribed_on, duration='', instructions=''):
    """
    When a time-limited course ends, or None when it is ongoing or the
    duration is not stated. "Start after 2 weeks" + "3 Months" ends three
    months after the delayed start, not after the prescription date.
    """
    if not prescribed_on:
        return None
    text = _fold(duration)
    if not text or _ONGOING.search(text):
        return None
    match = _DURATION.search(text)
    if not match:
        return None
    length = _days(*match.groups())
    if not length:
        return None
    start = prescribed_on
    offset = _START_OFFSET.search(_fold(instructions))
    if offset:
        start += timedelta(days=_days(offset.group(1), offset.group(2).rstrip('s') + 's'))
    return start + timedelta(days=length)


ACTION_START = 'start'
ACTION_CONTINUE = 'continue'
ACTION_CHANGE = 'change'
ACTION_STOP = 'stop'
ACTION_HOLD = 'hold'
ACTION_ONE_TIME = 'one_time'
ACTIONS = {ACTION_START, ACTION_CONTINUE, ACTION_CHANGE, ACTION_STOP, ACTION_HOLD, ACTION_ONE_TIME}

_CONDITIONAL = re.compile(r'\b(if|in case|incase|when|whenever|unless|should)\b')
_STOP_ONLY = re.compile(r'^\s*(stop|stopped|discontinue|discontinued|omit|omitted|withdrawn?)\b[\s.!]*'
                        r'(now|today|this|it|the medicine|the tablet)?[\s.!]*$')
_HOLD = re.compile(r'\b(withhold|hold|skip|do not take on)\b')
_CONTINUE = re.compile(r'\b(continue[ds]?|cont\.?|same as before|as before)\b')
_CHANGE = re.compile(r'\b(increase[ds]?|decrease[ds]?|reduce[ds]?|change[ds]?|taper(?:ed|ing)?)\b')


def classify_action(instructions='', frequency='', duration='', hinted=''):
    """
    What the doctor explicitly said about this medicine, or '' when nothing
    was said. Conservative on purpose:

      * a STOP is only an instruction that says stop and nothing else —
        "Stop if any giddiness/nausea" is a precaution, not a discontinuation;
      * "Withhold on day of surgery" is a temporary HOLD, not a stop;
      * a medicine that is simply absent from a later prescription gets no
        action at all here (see consolidation.py).
    """
    hinted = _fold(hinted).strip().replace(' ', '_')
    instructions_text = _fold(instructions)
    if hinted in ACTIONS:
        if hinted == ACTION_STOP and _CONDITIONAL.search(instructions_text):
            return ''
        return hinted
    if frequency_signature(frequency) == 'stat' or frequency_signature(instructions_text) == 'stat':
        return ACTION_ONE_TIME
    if _STOP_ONLY.match(instructions_text) or _STOP_ONLY.match(_fold(duration)):
        return ACTION_STOP
    if _CONDITIONAL.search(instructions_text):
        # "Continue on morning of surgery" still says continue; anything
        # else conditional is a precaution and says nothing about status.
        return ACTION_CONTINUE if _CONTINUE.search(instructions_text) else ''
    if _HOLD.search(instructions_text):
        return ACTION_HOLD
    if _CONTINUE.search(instructions_text):
        return ACTION_CONTINUE
    if _CHANGE.search(instructions_text):
        return ACTION_CHANGE
    return ''


def doctor_signature(name):
    folded = re.sub(r'\bdr\b\.?', ' ', _fold(name))
    return re.sub(r'[^a-z]', '', folded)


def instruction_signature(text):
    return re.sub(r'[^a-z0-9]', '', _fold(text))


def name_similarity(a, b):
    return SequenceMatcher(None, a, b).ratio()


def iso(value):
    return value.isoformat() if isinstance(value, date) else None
