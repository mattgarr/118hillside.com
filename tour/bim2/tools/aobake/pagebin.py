"""Reader for export_page.js output."""
import json, struct
import numpy as np


def read(path):
    b = open(path, 'rb').read()
    n = struct.unpack('<I', b[:4])[0]
    j = json.loads(b[4:4 + n])
    base = 4 + n

    def blob(o, dt):
        return np.frombuffer(b, dtype=dt, count=o['len'] // np.dtype(dt).itemsize, offset=base + o['off'])
    for m in j['pkg']:
        m['pos'] = blob(m['pos'], np.float32).reshape(-1, 3).astype(np.float64)
        m['idx'] = blob(m['idx'], np.uint32).reshape(-1, 3).astype(np.int64) if m.get('idx') else None
    j['occ'] = blob(j['occ'], np.float32).reshape(-1, 3, 3)
    return j


if __name__ == '__main__':
    import sys, collections
    j = read(sys.argv[1])
    c = collections.Counter()
    for o in j['objs']:
        c[(o['group'], o['cat'] or '-', o['kind'] or '-')] += o['nt']
    for k, v in sorted(c.items(), key=lambda x: -x[1])[:80]:
        print(v, k)
