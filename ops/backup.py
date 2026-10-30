"""Local/VPS backup and isolated restore check. Run from the repository root."""
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import tarfile
import tempfile
from datetime import datetime, timezone
from pathlib import Path


def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def checksum(file):
    h = hashlib.sha256()
    with file.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser()
    parser.add_argument('--dest', required=True, type=Path, help='Use an off-host mounted backup destination for pilot')
    parser.add_argument('--local-files', type=Path, help='Local development file root instead of the api volume')
    parser.add_argument('--retain', type=int, default=14)
    parser.add_argument('--restore-check', action='store_true')
    args = parser.parse_args()
    if args.retain < 1:
        parser.error('--retain must be at least 1')
    root = args.dest.resolve()
    root.mkdir(parents=True, exist_ok=True)
    destination = root / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    destination.mkdir()
    dump, archive = destination / 'database.dump', destination / 'files.tar.gz'
    with dump.open('wb') as stream:
        run(['docker', 'compose', 'exec', '-T', 'postgres', 'pg_dump', '-U', 'nexus', '-d', 'nexus', '-Fc'], stdout=stream)
    if args.local_files:
        files = args.local_files.resolve(strict=True)
        with tarfile.open(archive, 'w:gz') as tar:
            tar.add(files, arcname='files')
    else:
        with archive.open('wb') as stream:
            run(['docker', 'compose', 'exec', '-T', 'api', 'tar', '-C', '/data', '-czf', '-', 'files'], stdout=stream)
    manifest = {'database.dump': checksum(dump), 'files.tar.gz': checksum(archive)}
    (destination / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    if args.restore_check:
        name = 'nexus_restore_test'
        # The restore target is deliberately fixed and never the application database.
        # Always restore into a fresh disposable DB: --clean against an older
        # schema can fail on newly added serial columns before it drops tables.
        run(['docker', 'compose', 'exec', '-T', 'postgres', 'dropdb', '--if-exists', '-U', 'nexus', name])
        run(['docker', 'compose', 'exec', '-T', 'postgres', 'createdb', '-U', 'nexus', name])
        with dump.open('rb') as stream:
            run(['docker', 'compose', 'exec', '-T', 'postgres', 'pg_restore', '-U', 'nexus', '-d', name, '--clean', '--if-exists', '--no-owner', '--exit-on-error'], stdin=stream)
        run(['docker', 'compose', 'exec', '-T', 'postgres', 'psql', '-U', 'nexus', '-d', name, '-v', 'ON_ERROR_STOP=1', '-c', 'SELECT count(*) AS bank_releases FROM bank_releases; SELECT count(*) AS migrations FROM nexus_migrations;'])
        with tempfile.TemporaryDirectory(prefix='nexus-restore-') as temporary:
            with tarfile.open(archive) as tar:
                tar.extractall(temporary, filter='data')
            extracted = Path(temporary) / 'files'
            if not extracted.is_dir():
                raise RuntimeError('File archive did not restore the expected files directory')
            if args.local_files:
                for file in args.local_files.resolve().rglob('*'):
                    if file.is_file() and checksum(file) != checksum(extracted / file.relative_to(args.local_files.resolve())):
                        raise RuntimeError('Restored file checksum mismatch')
        print('Restore check passed in isolated nexus_restore_test database and temporary file directory.')
    # Only complete timestamp-named backups immediately below the selected destination are eligible.
    complete = sorted(p for p in root.iterdir() if p.is_dir() and not p.is_symlink() and re.fullmatch(r'\d{8}T\d{12}Z', p.name) and (p / 'manifest.json').is_file())
    for old in complete[:-args.retain]:
        if old.resolve().parent != root:
            raise RuntimeError('Backup retention target escaped destination')
        shutil.rmtree(old)
    print(f'Backup ready: {destination}')


if __name__ == '__main__':
    main()
