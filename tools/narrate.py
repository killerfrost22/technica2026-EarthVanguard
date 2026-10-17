#!/usr/bin/env python3
"""Generate the narration clips in narration/SCRIPT.md and the story cutscenes with ElevenLabs text-to-speech.

Reads every clip table in the script (clip id, text, voice role, length), picks each clip's voice from
narration/voices.json ("sections": a voice per clip-id prefix, longest match wins; otherwise the role's voice; the
role's settings always apply), and writes narration/audio/<clip id>.mp3 plus narration/audio/manifest.json (voice,
duration, characters). Clips that already exist are skipped, so re-running only fills the gaps; --force redoes them. A clip whose text
changed since it was generated (the manifest keeps the text) is redone automatically, so audio always matches the
words on screen.
The cutscene lines (ids cs_<cutscene>_<nn>) come from cutscenes/earth-vanguard-cutscenes/cutscenes/scenes.js through
tools/cutscene_lines.js (needs Node), use the role voices, and are written at 64 kbps because tools/build.py inlines
them into the game file. --prune deletes cs_ clips whose line is no longer in the script.
Clips with a time limit (the script's "keep each under N seconds" notes and "(hard limit)" lengths) are checked
after generation and reported if they run long.

Setup:
  export ELEVENLABS_API_KEY=...        # from elevenlabs.io > Profile > API key; never commit it
  python3 tools/narrate.py --voices    # list the voices on your account, to choose names for voices.json

Usage:
  python3 tools/narrate.py --dry-run           # show what would be generated, the voices and the character count
  python3 tools/narrate.py                     # generate every missing clip
  python3 tools/narrate.py --only puff_intro,memory1_voice_1 --force
  python3 tools/narrate.py --role "The Directorate" --force   # redo one voice after changing its settings

Only the Python standard library is needed.
"""
import argparse
import json
import os
import pathlib
import re
import subprocess
import sys
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
SCRIPT = ROOT / 'narration' / 'SCRIPT.md'
VOICES = ROOT / 'narration' / 'voices.json'
OUT = ROOT / 'narration' / 'audio'
API = 'https://api.elevenlabs.io/v1'
ROLES = ['Narrator', 'Blue Arrow', 'Puff', 'The Directorate', 'Commander Kade']
OUTPUT_FORMAT = 'mp3_44100_128'     # constant 128 kbps, so duration = bytes * 8 / 128000
CUTSCENE_FORMAT = 'mp3_44100_64'    # inlined into the game, so half the size


def kbps(fmt):
    return int(fmt.rsplit('_', 1)[1])


def cutscene_clips():
    """The spoken lines of every cutscene, from tools/cutscene_lines.js."""
    try:
        out = subprocess.run(['node', str(ROOT / 'tools' / 'cutscene_lines.js')], check=True, capture_output=True,
                             text=True).stdout
    except FileNotFoundError:
        sys.exit('Node is needed to read the cutscene script (tools/cutscene_lines.js).')
    except subprocess.CalledProcessError as e:
        sys.exit('tools/cutscene_lines.js failed:\n' + e.stderr)
    return [{'id': c['id'], 'text': c['text'], 'role': c['role'], 'limit': None, 'format': CUTSCENE_FORMAT}
            for c in json.loads(out)]


def parse_script(text):
    """Returns [{id, text, role, limit}] in script order."""
    clips = []
    role = None      # the section's default voice ("**Voice: Narrator.**")
    limit = None     # seconds, from "keep each under N seconds"; applies to the next table only
    cols = None      # column names of the table being read
    for line in text.splitlines():
        s = line.strip()
        if s.startswith('## '):
            role, limit, cols = None, None, None
            continue
        if not s.startswith('|'):
            if cols is not None:          # a table just ended
                cols, limit = None, None
            m = re.search(r'Voice:\s*\**\s*(Narrator|Blue Arrow|Puff|The Directorate)', s)
            if m:
                role = m.group(1)
            m = re.search(r'under (\d+(?:\.\d+)?) seconds', s)
            if m:
                limit = float(m.group(1))
            continue
        cells = [c.strip() for c in s.strip('|').split('|')]
        if cells and cells[0] == 'Clip':
            cols = cells
            continue
        if cols is None or set(s) <= set('|-: '):
            continue
        row = dict(zip(cols, cells))
        m = re.fullmatch(r'`([a-z0-9_]+)`', row.get('Clip', ''))
        if not m:
            continue
        r = row.get('Voice') or role
        if r not in ROLES:
            sys.exit('clip %s: unknown voice role %r (expected one of %s)' % (m.group(1), r, ', '.join(ROLES)))
        clip_limit = limit
        hard = re.search(r'(\d+(?:\.\d+)?)\s*s\s*\(hard limit\)', row.get('Length', ''))
        if hard:
            clip_limit = float(hard.group(1))
        clips.append({'id': m.group(1), 'text': row['Text'], 'role': r, 'limit': clip_limit})
    return clips


def api(path, key, body=None):
    req = urllib.request.Request(API + path, headers={'xi-api-key': key, 'Content-Type': 'application/json'},
                                 data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        detail = e.read().decode('utf-8', 'replace')[:400]
        sys.exit('ElevenLabs %s %s failed: HTTP %d %s' % ('POST' if body is not None else 'GET', path, e.code, detail))


def account_voices(key):
    data = json.loads(api('/voices', key))
    return {v['name']: v['voice_id'] for v in data.get('voices', [])}


def voice_for(clip, config):
    """The section voice for this clip id (longest matching prefix in "sections"), else its role's voice."""
    sections = {k: v for k, v in config.get('sections', {}).items() if not k.startswith('_')}
    best = max((p for p in sections if clip['id'].startswith(p)), key=len, default=None)
    if best:
        return sections[best]
    v = config.get(clip['role'], {}).get('voice')
    if not v:
        sys.exit('narration/voices.json has no voice for clip %s (role %s)' % (clip['id'], clip['role']))
    return v


def resolve(specs, key):
    """Maps each voice spec to a voice_id: a 20-character id is used as is; a name ("George") is looked up."""
    by_name = None
    out = {}
    for v in specs:
        if re.fullmatch(r'[A-Za-z0-9]{20}', v):
            out[v] = v
            continue
        if by_name is None:
            by_name = account_voices(key)
        match = by_name.get(v) or next((i for n, i in by_name.items() if n.split(' - ')[0].lower() == v.lower()), None)
        if not match:
            sys.exit('voice %r is not on your account. Run --voices to see the names, or paste a voice_id.' % v)
        out[v] = match
    return out


def main():
    ap = argparse.ArgumentParser(description='Generate narration clips with ElevenLabs.')
    ap.add_argument('--dry-run', action='store_true', help='list the clips, voices and character count; no API calls')
    ap.add_argument('--voices', action='store_true', help='list the voices on your ElevenLabs account')
    ap.add_argument('--only', default='', help='comma-separated clip ids')
    ap.add_argument('--role', default='', help='only clips for this voice role')
    ap.add_argument('--force', action='store_true', help='regenerate clips that already exist')
    ap.add_argument('--prune', action='store_true', help='delete cutscene clips whose line is no longer in the script')
    a = ap.parse_args()

    key = os.environ.get('ELEVENLABS_API_KEY', '').strip()
    if a.voices:
        if not key:
            sys.exit('Set ELEVENLABS_API_KEY first.')
        for name, vid in sorted(account_voices(key).items()):
            print('%-40s %s' % (name, vid))
        return

    config = json.loads(VOICES.read_text(encoding='utf-8'))
    clips = parse_script(SCRIPT.read_text(encoding='utf-8')) + cutscene_clips()
    mpath = OUT / 'manifest.json'
    manifest = json.loads(mpath.read_text(encoding='utf-8')) if mpath.exists() else {}
    if a.prune:
        live = {c['id'] for c in clips}
        for k in [k for k in manifest if k.startswith('cs_') and k not in live]:
            (OUT / (k + '.mp3')).unlink(missing_ok=True)
            del manifest[k]
            print('pruned', k)
        mpath.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    only = {x.strip() for x in a.only.split(',') if x.strip()}
    unknown = only - {c['id'] for c in clips}
    if unknown:
        sys.exit('not in SCRIPT.md or the cutscenes: ' + ', '.join(sorted(unknown)))
    todo = [c for c in clips if (not only or c['id'] in only) and (not a.role or c['role'] == a.role)]
    if not a.force:
        todo = [c for c in todo if not (OUT / (c['id'] + '.mp3')).exists()
                or manifest.get(c['id'], {}).get('text', c['text']) != c['text']]

    chars = sum(len(c['text']) for c in todo)
    print('%d clips in SCRIPT.md and the cutscenes; %d to generate (%d characters)' % (len(clips), len(todo), chars))
    if a.dry_run:
        for c in todo:
            lim = ' (limit %gs)' % c['limit'] if c['limit'] else ''
            print('  %-16s %-16s %-22s %s%s' % (c['id'], c['role'], voice_for(c, config), c['text'][:44], lim))
        return
    if not todo:
        return
    if not key:
        sys.exit('Set ELEVENLABS_API_KEY first (elevenlabs.io > Profile > API key).')

    ids = resolve({voice_for(c, config) for c in todo}, key)
    model = config.get('model', 'eleven_multilingual_v2')
    OUT.mkdir(parents=True, exist_ok=True)
    long = []
    for i, c in enumerate(todo, 1):
        role = config[c['role']]
        body = {
            'text': c['text'],
            'model_id': model,
            'voice_settings': {k: role[k] for k in ('stability', 'similarity_boost', 'style', 'use_speaker_boost', 'speed') if k in role},
        }
        voice = voice_for(c, config)
        fmt = c.get('format', OUTPUT_FORMAT)
        audio = api('/text-to-speech/%s?output_format=%s' % (ids[voice], fmt), key, body)
        (OUT / (c['id'] + '.mp3')).write_bytes(audio)
        secs = len(audio) * 8 / (kbps(fmt) * 1000)
        manifest[c['id']] = {'role': c['role'], 'voice': voice, 'model': model, 'seconds': round(secs, 2),
                             'chars': len(c['text']), 'text': c['text']}
        flag = ''
        if c['limit'] and secs > c['limit']:
            flag = '  TOO LONG (limit %gs)' % c['limit']
            long.append(c['id'])
        print('[%d/%d] %-18s %5.1fs  %s%s' % (i, len(todo), c['id'], secs, c['role'], flag))
        mpath.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    if long:
        print('\nOver their time limit: %s\nTry a higher "speed" for that voice in voices.json, then --only <ids> --force.'
              % ', '.join(long))


if __name__ == '__main__':
    main()
