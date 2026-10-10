"""
What every verification provider takes and returns. Providers only look a
registration up; deciding anything from the result is apply_verification's
job, and approving or rejecting a doctor is an admin's.
"""

from dataclasses import asdict, dataclass, field
from datetime import date

FOUND = 'found'
NOT_FOUND = 'not_found'
AMBIGUOUS = 'ambiguous'
UNAVAILABLE = 'unavailable'


class ProviderUnavailable(Exception):
    """The provider could not be reached or answered with something unusable."""


@dataclass(frozen=True)
class Lookup:
    """What is being checked. `reference` is our id for the doctor (Decentro wants one per request)."""
    reg_no: str
    council: str
    year: int | None = None
    name: str = ''
    reference: str = ''
    # The doctor agreed to have their registration checked through outside
    # verification partners. Without it only NMC's own register is asked.
    consent: bool = False


@dataclass
class VerificationResult:
    status: str
    provider: str
    nmc_doctor_id: str = ''
    name: str = ''
    qualification: str = ''
    university: str = ''
    registration_date: date | None = None
    registration_year: int | None = None
    is_suspended: bool = False
    suspension_remarks: str = ''
    raw: dict | None = field(default=None)
    error: str = ''
    # NOT_FOUND only: the same number listed under other councils — usually
    # the doctor picked the wrong one. [{council, council_name, registration_no, year}]
    other_councils: list = field(default_factory=list)
    # Every provider asked for this answer, in order:
    # [{"provider": "nmc", "result": "unavailable", "ms": 20012, "error": "..."}]
    attempts: list = field(default_factory=list)

    def to_cache(self) -> dict:
        data = asdict(self)
        data['registration_date'] = self.registration_date.isoformat() if self.registration_date else None
        return data

    @classmethod
    def from_cache(cls, data: dict) -> 'VerificationResult':
        data = dict(data)
        if data.get('registration_date'):
            data['registration_date'] = date.fromisoformat(data['registration_date'])
        return cls(**data)
