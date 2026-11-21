from datetime import date

from django.test import TestCase

from .dates import parse_ai_date


class ParseAiDateTests(TestCase):
    """
    The parser between a model's answer and the document_date column.

    These exist because the strict `date.fromisoformat` this replaced turned
    every printed-as-written Indian date into None, and the upload then came
    back with no date and no explanation.
    """

    def test_iso_is_accepted(self):
        self.assertEqual(parse_ai_date('2026-03-14'), date(2026, 3, 14))

    def test_iso_timestamp_keeps_only_the_date(self):
        self.assertEqual(parse_ai_date('2026-03-14T09:30:00Z'), date(2026, 3, 14))

    def test_surrounding_whitespace_is_ignored(self):
        self.assertEqual(parse_ai_date('  2026-03-14 '), date(2026, 3, 14))

    def test_indian_slash_format_is_read_day_first(self):
        self.assertEqual(parse_ai_date('14/03/2026'), date(2026, 3, 14))

    def test_indian_dash_format_is_read_day_first(self):
        self.assertEqual(parse_ai_date('14-03-2026'), date(2026, 3, 14))

    def test_ambiguous_slash_date_resolves_day_first(self):
        # 03/05/2026 is 3 May in India, not 5 March. The prompts tell the
        # model to return null when it genuinely cannot tell, so a value
        # arriving here is taken at its printed convention.
        self.assertEqual(parse_ai_date('03/05/2026'), date(2026, 5, 3))

    def test_month_first_date_that_cannot_be_day_first_is_rejected(self):
        # "03/14/2026" has no 14th month. Better None than a silent swap to
        # 3 March, which would look right and be wrong.
        self.assertIsNone(parse_ai_date('03/14/2026'))

    def test_unparseable_values_are_none(self):
        for value in ('garbage', '14 Mar 2026', 'Mar 14, 2026', '2026', '', '   '):
            with self.subTest(value=value):
                self.assertIsNone(parse_ai_date(value))

    def test_non_strings_are_none(self):
        for value in (None, 20260314, {'date': '2026-03-14'}, ['2026-03-14']):
            with self.subTest(value=value):
                self.assertIsNone(parse_ai_date(value))

    def test_impossible_calendar_date_is_none(self):
        self.assertIsNone(parse_ai_date('2026-02-30'))
