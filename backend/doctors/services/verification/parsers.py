"""
Parsing shared by the verification providers: comparing registration
numbers, reading the register's dates and years, and removing personal
fields before anything is stored.

Two record shapes exist. NMC's current register (nmc_provider.py) answers in
snake_case ("registration_no", "state_code"). The older NMC API, which
Decentro still returns, uses camelCase ("registrationNo", "smcName") —
parse_mci_record reads that one.
"""

import re
from datetime import datetime

# Personal fields a register record (or a provider's copy of one) can carry.
# Every provider keeps an allow-list of what it stores; strip_pii is the
# second net over whatever ends up in Doctor.nmc_payload.
PII_KEYS = frozenset({
    'address', 'permanentaddress', 'permanent_address', 'dateofbirth', 'dob', 'date_of_birth',
    'phone', 'mobile', 'email', 'aadhaar', 'uprnno', 'uprn_no', 'photo',
    'fathername', 'father_name', 'parentname', 'parent_name',
})


def strip_pii(value):
    """`value` with every personal key removed, at any depth."""
    if isinstance(value, dict):
        return {k: strip_pii(v) for k, v in value.items() if str(k).lower() not in PII_KEYS}
    if isinstance(value, list):
        return [strip_pii(v) for v in value]
    return value


def comparable(reg_no) -> str:
    """Registration numbers compared on letters and digits only, leading zeros dropped."""
    return re.sub(r'[^0-9A-Z]', '', str(reg_no or '').upper()).lstrip('0')


def _number_part(reg_no) -> str:
    match = re.search(r'(\d+)\D*$', str(reg_no or ''))
    return match.group(1).lstrip('0') if match else ''


def same_number(typed, listed) -> bool:
    """
    Whether a number a doctor typed is the one on the register.

    Several councils store their own prefix with the number — Delhi as
    "DMC/R/11030", Andhra Pradesh as "APMC/FMR/110324", older Maharashtra
    entries as "B-15892" — while the certificate number a doctor types is
    often just "11030". So when exactly one side has letters, the numbers
    are compared on their digits alone. Two different prefixes never match.
    """
    a, b = comparable(typed), comparable(listed)
    if not a or not b:
        return False
    if a == b:
        return True
    if a.isdigit() != b.isdigit():
        number = _number_part(typed)
        return bool(number) and number == _number_part(listed)
    return False


def parse_date(value):
    text = str(value or '').strip()
    for fmt in ('%d-%m-%Y', '%Y-%m-%d %H:%M:%S', '%Y-%m-%d', '%d/%m/%Y'):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def year_of(value):
    try:
        return int(str(value).strip()[:4])
    except (TypeError, ValueError):
        return None


def truthy(value) -> bool:
    """The register writes booleans as true / "1" / "Y" / "yes" depending on the endpoint."""
    if isinstance(value, bool):
        return value
    return str(value or '').strip().lower() not in ('', '0', 'none', 'null', 'false', 'n', 'no')


# Kept from an older-API record; everything else is dropped.
MCI_KEPT_FIELDS = (
    'doctorId', 'firstName', 'registrationNo', 'regDate', 'yearInfo', 'smcId', 'smcName',
    'doctorDegree', 'university', 'yearOfPassing', 'removedStatus',
)


def parse_mci_record(record: dict) -> dict:
    """
    One record in the older NMC API's shape, as the fields a
    VerificationResult carries. `raw` keeps only MCI_KEPT_FIELDS — the
    address and parent's name are never stored.
    """
    return {
        'nmc_doctor_id': str(record.get('doctorId') or ''),
        'name': ' '.join(str(record.get('firstName') or '').split()).rstrip('.').strip(),
        'qualification': ' '.join(
            str(part) for part in (record.get('doctorDegree'), record.get('yearOfPassing')) if part
        ),
        'university': str(record.get('university') or '').strip(),
        'registration_date': parse_date(record.get('regDate')),
        'registration_year': year_of(record.get('yearInfo')),
        'is_suspended': truthy(record.get('removedStatus')),
        'raw': {key: record.get(key) for key in MCI_KEPT_FIELDS if key in record},
    }
