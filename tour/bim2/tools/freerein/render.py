"""usage: python3 tour/bim2/tools/freerein/render.py <out-dir> [name ...]   ->  <out-dir>/<name>.svg and <name>@2x.png"""
import sys, os, subprocess
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bench, concepts
OUT = sys.argv[1].rstrip('/') + '/'
JOBS = {'bench-asbuilt': bench.asbuilt, 'bench-jan24': bench.jan24, 'bench-apr24b': bench.apr24b}
JOBS.update({'freerein-%d' % (i + 1): f for i, f in enumerate(concepts.ALL)})
names = sys.argv[2:] or list(JOBS)
for n in names:
    p = JOBS[n]()
    print(n, '-', p.title)
    if p.own: p.check()
    open(OUT + n + '.svg', 'w').write(p.svg())
    subprocess.check_call(['rsvg-convert', '-z', '2', OUT + n + '.svg', '-o', OUT + n + '@2x.png'])
