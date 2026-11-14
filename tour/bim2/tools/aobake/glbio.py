"""Minimal GLB reader (numpy). Reads the scene packages the tour loads; never writes them."""
import hashlib, json, struct
import numpy as np

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for blk in iter(lambda: f.read(1 << 20), b''):
            h.update(blk)
    return h.hexdigest()


class GLB:
    def __init__(self, path):
        b = open(path, 'rb').read()
        self.path, self.bytes = path, len(b)
        n = struct.unpack('<I', b[12:16])[0]
        self.j = json.loads(b[20:20 + n])
        off = 20 + n + ((4 - n % 4) % 4 if False else 0)
        bl = struct.unpack('<I', b[off:off + 4])[0]
        self.bin = b[off + 8:off + 8 + bl]

    def acc(self, i):
        j = self.j
        a = j['accessors'][i]
        bv = j['bufferViews'][a['bufferView']]
        nc = NC[a['type']]
        dt = np.dtype(CT[a['componentType']])
        o = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        st = bv.get('byteStride', 0) or nc * dt.itemsize
        cnt = a['count']
        if st == nc * dt.itemsize:
            return np.frombuffer(self.bin, dtype=dt, count=cnt * nc, offset=o).reshape(cnt, nc).copy()
        raw = np.frombuffer(self.bin, dtype=np.uint8, count=st * (cnt - 1) + nc * dt.itemsize, offset=o)
        idx = (np.arange(cnt)[:, None] * st + np.arange(nc * dt.itemsize)[None, :])
        return np.frombuffer(raw[idx].tobytes(), dtype=dt).reshape(cnt, nc)

    def node_world(self):
        """world matrix per node index (column-major glTF -> 4x4 numpy)"""
        j = self.j
        W = {}

        def local(n):
            if 'matrix' in n:
                return np.array(n['matrix'], np.float64).reshape(4, 4).T
            T = np.eye(4)
            t = n.get('translation', [0, 0, 0]); r = n.get('rotation', [0, 0, 0, 1]); s = n.get('scale', [1, 1, 1])
            x, y, z, w = r
            R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                          [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                          [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
            T[:3, :3] = R * np.array(s)[None, :]
            T[:3, 3] = t
            return T

        def walk(i, P):
            M = P @ local(j['nodes'][i])
            W[i] = M
            for c in j['nodes'][i].get('children', []):
                walk(c, M)
        for r in j['scenes'][j.get('scene', 0)]['nodes']:
            walk(r, np.eye(4))
        return W

    def mesh_entries(self):
        """Meshes in the order three.js GLTFLoader's scene.traverse() meets them (depth-first, scene node order).
        Yields dict(name, node, mesh, prim, pos (world, float64), nrm, idx (n,3), extras)."""
        j = self.j
        W = self.node_world()
        order = []

        def walk(i):
            order.append(i)
            for c in j['nodes'][i].get('children', []):
                walk(c)
        for r in j['scenes'][j.get('scene', 0)]['nodes']:
            walk(r)
        for ni in order:
            n = j['nodes'][ni]
            if 'mesh' not in n:
                continue
            m = j['meshes'][n['mesh']]
            for pi, p in enumerate(m['primitives']):
                if p.get('mode', 4) != 4:
                    continue
                P = self.acc(p['attributes']['POSITION']).astype(np.float64)
                M = W[ni]
                Pw = P @ M[:3, :3].T + M[:3, 3]
                I = self.acc(p['indices']).reshape(-1, 3).astype(np.int64) if 'indices' in p else np.arange(len(P)).reshape(-1, 3)
                ex = dict(n.get('extras', {}))
                ex.update(m.get('extras', {}))
                yield dict(name=n.get('name') or m.get('name') or '', node=ni, mesh=n['mesh'], prim=pi, pos=Pw, idx=I, extras=ex,
                           nverts=len(P))
