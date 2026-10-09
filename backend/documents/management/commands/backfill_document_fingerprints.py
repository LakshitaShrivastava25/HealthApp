import hashlib
import io
from collections import defaultdict

from django.core.management.base import BaseCommand
from pypdf import PdfReader
from pypdf.errors import PdfReadError

from documents.derived import rebuild_derived_records
from documents.duplicates import SIMILAR_TEXT_THRESHOLD, page_fingerprints, text_similarity
from config.migration_check import require_migrations
from documents.models import Document


def _pdf_pages(data):
    try:
        return [(page.extract_text() or '').strip() for page in PdfReader(io.BytesIO(data)).pages]
    except (PdfReadError, ValueError, KeyError):
        return []


class Command(BaseCommand):
    help = (
        'Hash every stored document (SHA-256 of the bytes + per-page text fingerprints) and link '
        'verified copies to their original. Dry run by default; --apply to save. Downloads each '
        'file once from storage.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Save hashes and copy links.')
        parser.add_argument('--profile', help='Only this profile id.')
        parser.add_argument('--rehash', action='store_true', help='Recompute documents that already have a hash.')

    def handle(self, *args, **options):
        require_migrations('documents', 'medicines')
        documents = Document.objects.all().order_by('uploaded_at')
        if options['profile']:
            documents = documents.filter(profile_id=options['profile'])
        mode = 'APPLY' if options['apply'] else 'DRY RUN (nothing is saved)'
        self.stdout.write(self.style.MIGRATE_HEADING(f'Document fingerprints — {mode}'))

        by_profile = defaultdict(list)
        for document in documents:
            if options['rehash'] or not document.file_sha256:
                try:
                    with document.file.storage.open(document.file.name) as handle:
                        data = handle.read()
                except Exception as exc:  # a missing file must not stop the run
                    self.stdout.write(self.style.WARNING(f'  could not read {document.file.name}: {exc}'))
                    continue
                document.file_sha256 = hashlib.sha256(data).hexdigest()
                document.file_size = len(data)
                if document.file.name.lower().endswith('.pdf'):
                    document.page_fingerprints = page_fingerprints(_pdf_pages(data))
                if options['apply']:
                    document.save(update_fields=['file_sha256', 'file_size', 'page_fingerprints'])
            by_profile[document.profile_id].append(document)

        linked = flagged = 0
        for profile_id, docs in by_profile.items():
            originals = []
            for document in docs:  # oldest first
                if document.duplicate_of_id:
                    continue
                original, kind = None, ''
                for candidate in originals:
                    if candidate.file_sha256 and candidate.file_sha256 == document.file_sha256:
                        original, kind = candidate, Document.DuplicateKind.EXACT
                        break
                    mine = [f for f in document.page_fingerprints if f]
                    if mine and mine == [f for f in candidate.page_fingerprints if f]:
                        original, kind = candidate, Document.DuplicateKind.SAME_CONTENT
                        break
                if original is None:
                    originals.append(document)
                    continue
                linked += 1
                self.stdout.write(
                    f'profile …{str(profile_id)[-4:]}: {kind.upper()} copy — '
                    f'"{document.title}" ({document.uploaded_at:%Y-%m-%d %H:%M}) '
                    f'of "{original.title}" ({original.uploaded_at:%Y-%m-%d %H:%M})'
                )
                if options['apply']:
                    document.duplicate_of = original
                    document.duplicate_kind = kind
                    document.possible_duplicate_of = None
                    document.save(update_fields=['duplicate_of', 'duplicate_kind', 'possible_duplicate_of'])
                    rebuild_derived_records(document)

            # Unverified overlaps among what is left: flag, never link.
            for i, document in enumerate(originals):
                if document.duplicate_check_dismissed or document.possible_duplicate_of_id:
                    continue
                best = None
                for other in originals[:i]:
                    shared = {f for f in document.page_fingerprints if f} & {f for f in other.page_fingerprints if f}
                    if shared:
                        union = {f for f in document.page_fingerprints if f} | {f for f in other.page_fingerprints if f}
                        score = len(shared) / len(union)
                        pages = [n + 1 for n, f in enumerate(document.page_fingerprints) if f in shared]
                    else:
                        score = text_similarity(document.raw_ocr_text, other.raw_ocr_text)
                        pages = []
                        if score < SIMILAR_TEXT_THRESHOLD:
                            continue
                    if best is None or score > best[1]:
                        best = (other, round(score, 3), pages)
                if best:
                    flagged += 1
                    self.stdout.write(
                        f'profile …{str(profile_id)[-4:]}: possible duplicate ({best[1]:.0%}) — '
                        f'"{document.title}" vs "{best[0].title}"'
                    )
                    if options['apply']:
                        document.possible_duplicate_of = best[0]
                        document.possible_duplicate_score = best[1]
                        document.possible_duplicate_pages = best[2]
                        document.save(update_fields=[
                            'possible_duplicate_of', 'possible_duplicate_score', 'possible_duplicate_pages',
                        ])

        self.stdout.write(self.style.SUCCESS(
            f'{linked} verified cop{"y" if linked == 1 else "ies"} linked, {flagged} possible duplicate(s) flagged'
            + ('' if options['apply'] else ' (dry run)')
        ))
