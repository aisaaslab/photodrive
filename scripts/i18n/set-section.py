#!/usr/bin/env python3
"""Write one section of the landing copy into the six dictionaries: set-section.py <section> <json>.
The JSON is {lang: {group: {key: text}}}; the groups are merged into `landing: {...}` of each lib/i18n/dictionaries/<lang>.ts
(existing groups with the same name are replaced, others kept). Keys stay in the order the JSON gives them."""
import json, re, sys

def ts(v, indent):
    pad = "  " * indent
    if isinstance(v, dict):
        return "{\n" + "".join(f"{pad}  {k}: {ts(x, indent + 1)},\n" for k, x in v.items()) + f"{pad}}}"
    return json.dumps(v, ensure_ascii=False)

def parse_landing(src):
    m = re.search(r"\n  landing: \{\n(.*?)\n  \},\n(?=\};)", src, re.S)
    groups = {}
    if m:
        body = m.group(1)
        for g in re.finditer(r"^    (\w+): \{\n(.*?)\n    \},?$", body, re.S | re.M):
            items = {}
            for line in g.group(2).split("\n"):
                kv = re.match(r"^      (\w+): (\".*\"),?$", line)
                if kv:
                    items[kv.group(1)] = json.loads(kv.group(2))
            groups[g.group(1)] = items
    return m, groups

data = json.load(open(sys.argv[1]))
for lang, new in data.items():
    p = f"lib/i18n/dictionaries/{lang}.ts"
    src = open(p, encoding="utf8").read()
    m, groups = parse_landing(src)
    groups.update(new)
    block = "\n  landing: " + ts(groups, 1).replace("\n}", "\n  }") + ",\n"
    block = block.replace("\n  landing: {\n", "\n  landing: {\n", 1)
    if m:
        src = src[:m.start()] + block.rstrip("\n").replace("\n  landing", "\n  landing", 1) + "\n" + src[m.end():]
    else:
        i = src.rindex("\n};")
        src = src[:i] + block.rstrip("\n") + src[i:]
    open(p, "w", encoding="utf8").write(src)
    print(lang, "ok", list(groups))
