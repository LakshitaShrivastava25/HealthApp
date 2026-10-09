"""
What every verification provider returns. Providers only look a registration
up; deciding anything from the result is apply_verification's job, and
approving or rejecting a doctor is an admin's.
"""

from dataclasses import asdict, dataclass, field
from datetime import date

FOUND = 'found'
NOT_FOUND = 'not_found'
AMBIGUOUS = 'ambiguous'
UNAVAILABLE = 'unavailable'


class ProviderUnavailable(Exception):
    """The provider could not be reached or answered with something unusable."""


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
