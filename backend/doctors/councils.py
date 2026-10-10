"""
The medical councils a doctor can be registered with, keyed by the code the
NMC Indian Medical Register uses (https://nmc.org.in/indian-medical-register/states).

The register's search takes these codes as its `state` filter, so the code
is what we store and send; the name is what people see. Taken from the live
endpoint on 2026-10-09 — if NMC adds or renames a council, update it here
(names follow NMC's, with two spelling slips corrected).
"""

COUNCILS = [
    ('AND', 'Andhra Pradesh Medical Council'),
    ('ARU', 'Arunachal Pradesh Medical Council'),
    ('ASS', 'Assam Medical Council'),
    ('BIH', 'Bihar Medical Council'),
    ('CHA', 'Chhattisgarh Medical Council'),
    ('DEL', 'Delhi Medical Council'),
    ('GOA', 'Goa Medical Council'),
    ('GUJ', 'Gujarat Medical Council'),
    ('HAR', 'Haryana Medical Council'),
    ('HIM', 'Himachal Pradesh Medical Council'),
    ('JAM', 'Jammu & Kashmir Medical Council'),
    ('JHA', 'Jharkhand Medical Council'),
    ('KAR', 'Karnataka Medical Council'),
    ('MAD', 'Madhya Pradesh Medical Council'),
    ('MAH', 'Maharashtra Medical Council'),
    ('MAN', 'Manipur Medical Council'),
    ('MCI', 'Medical Council of India'),
    ('MIZ', 'Mizoram Medical Council'),
    ('NAG', 'Nagaland Medical Council'),
    ('ORI', 'Orissa Council of Medical Registration'),
    ('PUN', 'Punjab Medical Council'),
    ('RAJ', 'Rajasthan Medical Council'),
    ('SIK', 'Sikkim Medical Council'),
    ('TAM', 'Tamil Nadu Medical Council'),
    ('TEL', 'Telangana State Medical Council'),
    ('TC', 'Travancore Cochin Medical Council, Trivandrum'),
    ('TRI', 'Tripura State Medical Council'),
    ('UP', 'Uttar Pradesh Medical Council'),
    ('UTT', 'Uttarakhand Medical Council'),
    ('WES', 'West Bengal Medical Council'),
]

COUNCIL_NAMES = dict(COUNCILS)

# The register's own spelling, where it differs from ours. Outside
# verification providers (Apify, Decentro) take the council as free text and
# match it against the register, so they are sent the register's version.
REGISTER_SPELLINGS = {
    'CHA': 'Chattisgarh Medical Council',
    'HIM': 'Himanchal Pradesh Medical Council',
}


def council_name(code):
    return COUNCIL_NAMES.get(code or '', code or '')


def register_council_name(code):
    """The council's name exactly as the NMC register writes it."""
    return REGISTER_SPELLINGS.get(code or '') or council_name(code)
