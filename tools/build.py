#!/usr/bin/env python3
"""Build Earth Vanguard into single self-contained HTML files.

  dist/earthvanguard.html       full document: double-click to play; used by all tests
  dist/publish/index.html   claude.ai artifact page: same content without the doctype/html/head/body
                            wrapper (the artifact host adds its own skeleton)

src/shell.html holds two marked regions:
  <!--HEAD--> ... <!--/HEAD-->   title, meta tags (goes first, so <title> sits in the first 8 KB)
  <!--BODY--> ... <!--/BODY-->   page markup
All src/*.css files (sorted by name) are inlined into one <style>; all src/*.js files (sorted by name)
are inlined, then the cutscene player, art and script from cutscenes/earth-vanguard-cutscenes/cutscenes/,
each in its own <script> ending with //# sourceURL=<path>, so stack traces and the
test harness name the real source file and line.

Options:
  --out PATH         where to write the full document (default dist/earthvanguard.html)
  --exclude a.js,b   leave files out (isolated testing)
  --no-publish       skip dist/publish/index.html
"""
import argparse
import base64
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'src'
CUTSCENES = ROOT / 'cutscenes' / 'earth-vanguard-cutscenes' / 'cutscenes'
CUTSCENE_JS = ['cutscenes.js', 'art.js', 'scenes.js']
NARRATION = ROOT / 'narration' / 'audio'


# The artifact host may serve the page without a charset, so the output is pure ASCII: non-ASCII characters
# become \uXXXX escapes in JS (surrogate pairs above U+FFFF), \XXXXXX escapes in CSS and &#x...; in HTML.
def js_ascii(code):
    out = []
    for ch in code:
        o = ord(ch)
        if o < 128:
            out.append(ch)
        elif o <= 0xFFFF:
            out.append('\\u%04x' % o)
        else:
            o -= 0x10000
            out.append('\\u%04x\\u%04x' % (0xD800 + (o >> 10), 0xDC00 + (o & 0x3FF)))
    return ''.join(out)


def css_ascii(css):
    return re.sub(r'[^\x00-\x7f]', lambda m: '\\%06x' % ord(m.group(0)), css)


def html_ascii(html):
    return re.sub(r'[^\x00-\x7f]', lambda m: '&#x%x;' % ord(m.group(0)), html)


def voice_clips(prefix, with_seconds=False):
    """Generated voice clips whose id starts with prefix, as {on-screen text: data URI} (or [URI, seconds])."""
    manifest = NARRATION / 'manifest.json'
    if not manifest.exists():
        return {}
    vo = {}
    for cid, m in json.loads(manifest.read_text(encoding='utf-8')).items():
        mp3 = NARRATION / (cid + '.mp3')
        if cid.startswith(prefix) and mp3.exists() and m.get('text'):
            uri = 'data:audio/mpeg;base64,' + base64.b64encode(mp3.read_bytes()).decode('ascii')
            vo[m['text']] = [uri, m.get('seconds', 0)] if with_seconds else uri
    return vo


def region(text, name):
    m = re.search(r'<!--%s-->(.*?)<!--/%s-->' % (name, name), text, re.S)
    if not m:
        sys.exit('shell.html is missing the <!--%s--> ... <!--/%s--> region' % (name, name))
    return m.group(1).strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=str(ROOT / 'dist' / 'earthvanguard.html'))
    ap.add_argument('--exclude', default='')
    ap.add_argument('--no-publish', action='store_true')
    a = ap.parse_args()
    exclude = {x.strip() for x in a.exclude.split(',') if x.strip()}

    shell = (SRC / 'shell.html').read_text(encoding='utf-8')
    head, body = html_ascii(region(shell, 'HEAD')), html_ascii(region(shell, 'BODY'))

    css_parts = []
    for p in sorted(SRC.glob('*.css')):
        if p.name in exclude:
            continue
        css = p.read_text(encoding='utf-8')
        if '</style' in css.lower():
            sys.exit('%s contains "</style", which would end the inlined <style> early' % p.name)
        css_parts.append('/* ==== %s ==== */\n%s' % (p.name, css_ascii(css)))

    js_parts = []
    for p in sorted(SRC.glob('*.js')):
        if p.name in exclude:
            continue
        code = p.read_text(encoding='utf-8')
        if '</script' in code.lower():
            sys.exit('%s contains "</script", which would end the inlined <script> early; split the string' % p.name)
        js_parts.append('<script>\n%s\n//# sourceURL=src/%s\n</script>' % (js_ascii(code), p.name))

    # The story cutscenes keep their own folder (with a standalone preview, demo.html); the player, art and script
    # load after the game modules, in this order. src/26_cutscenes.js wires them into the game.
    # Their voice clips (narration/audio/cs_*.mp3, made by tools/narrate.py) go in first as window.CUTSCENE_VO, a map
    # from each line's text to a data: URI, so a line whose text changed since its clip was made simply plays silent.
    vo = voice_clips('cs_')
    if vo:
        js_parts.append('<script>\nwindow.CUTSCENE_VO = %s;\n</script>' % json.dumps(vo, separators=(',', ':')))
    # Radio voice lines (narration/audio/radio_*.mp3) for the radio box (src/16_story.js): text -> [data: URI, seconds].
    radio = voice_clips('radio_', with_seconds=True)
    radio.update(voice_clips('prompt_', with_seconds=True))  # Decision prompts, read aloud in the choice dialog
    if radio:
        js_parts.append('<script>\nwindow.RADIO_VO = %s;\n</script>' % json.dumps(radio, separators=(',', ':')))
    # Blue Arrow's memory-shard lines in Echo (narration/audio/echo_memory_*.mp3) for src/24_echo.js, the same way.
    evo = voice_clips('echo_memory_', with_seconds=True)
    if evo:
        js_parts.append('<script>\nwindow.ECHO_VO = %s;\n</script>' % json.dumps(evo, separators=(',', ':')))
    # Puff's memory in Mission 1 (narration/audio/memory1_*.mp3) for src/25_puffstory.js: clip id -> [data: URI,
    # seconds, text]. The game checks the text against what it shows (ignoring case), so a reworded line plays silent.
    pvo = {}
    manifest = NARRATION / 'manifest.json'
    for cid, m in (json.loads(manifest.read_text(encoding='utf-8')).items() if manifest.exists() else []):
        mp3 = NARRATION / (cid + '.mp3')
        if cid.startswith('memory1_') and mp3.exists():
            pvo[cid] = ['data:audio/mpeg;base64,' + base64.b64encode(mp3.read_bytes()).decode('ascii'),
                        m.get('seconds', 0), m.get('text', '')]
    if pvo:
        js_parts.append('<script>\nwindow.PUFF_VO = %s;\n</script>' % json.dumps(pvo, separators=(',', ':')))
    for name in CUTSCENE_JS:
        p = CUTSCENES / name
        if name in exclude:
            continue
        code = p.read_text(encoding='utf-8')
        if '</script' in code.lower():
            sys.exit('%s contains "</script", which would end the inlined <script> early; split the string' % p)
        js_parts.append('<script>\n%s\n//# sourceURL=%s\n</script>' % (js_ascii(code), p.relative_to(ROOT).as_posix()))

    style = '<style>\n%s\n</style>' % '\n'.join(css_parts)
    scripts = '\n'.join(js_parts)

    full = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
            '%s\n%s\n</head>\n<body>\n%s\n%s\n</body>\n</html>\n') % (head, style, body, scripts)
    out = pathlib.Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(full, encoding='utf-8')
    print('wrote %s (%d KB, %d css, %d js)' % (out.relative_to(ROOT) if out.is_relative_to(ROOT) else out,
                                               len(full.encode('utf-8')) // 1024, len(css_parts), len(js_parts)))

    if not a.no_publish:
        pub = '%s\n%s\n%s\n%s\n' % (head, style, body, scripts)
        pout = ROOT / 'dist' / 'publish' / 'index.html'
        pout.parent.mkdir(parents=True, exist_ok=True)
        pout.write_text(pub, encoding='utf-8')
        print('wrote %s (%d KB)' % (pout.relative_to(ROOT), len(pub.encode('utf-8')) // 1024))


if __name__ == '__main__':
    main()
