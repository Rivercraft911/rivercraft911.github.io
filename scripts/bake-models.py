# Blender's half of bake-models.mjs: one job (JSON, after `--`) in, one GLB out, its stats printed as a MODEL line.
# A job's parts are GLB, STL or OBJ files. A board's GLB is kicad-cli's, of board.kicad_pcb: its copper, pads, vias,
# silk, mask and body come as meshes named board_*, and each part under a node named by its reference. The copper and
# vias keep only the faces that look out of the board (the 35 µm walls and the faces against the laminate never
# show), then each class (board, parts, passives) is welded and collapsed to its share of the triangle budget,
# passives hardest, until the GLB fits its bytes. Materials the eye can't tell apart merge, so a model is one mesh of
# a few primitives, one per material.
import bpy, bmesh, json, math, os, re, sys
from mathutils import Matrix, Vector

job = json.loads(sys.argv[sys.argv.index('--') + 1])
board = job.get('kind') == 'board'
WELD = 1e-6  # m
SHARE = {'board': 1, 'part': 1, 'passive': 0.3}  # how hard each class holds on to its triangles
MADE = {}
PASSIVE = re.compile(r'^(R|C|L|FB)\d')
LAYER = re.compile(r'^board_(copper|via|pad|silkscreen|soldermask|PCB)(\.\d+)?$')


def material(name, rgba, metal, rough):  # one per look, so the same look is one primitive
    k = (*rgba, metal, rough)
    if k not in MADE:
        m = MADE[k] = bpy.data.materials.new(name)
        p = m.node_tree.nodes['Principled BSDF']
        p.inputs['Base Color'].default_value = rgba
        p.inputs['Metallic'].default_value, p.inputs['Roughness'].default_value = metal, rough
    return MADE[k]


def principled(m):
    return next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')


def load():
    objs = []
    for part in job['parts']:
        f, before = part['file'], set(bpy.data.objects)
        if f.endswith('.glb'): bpy.ops.import_scene.gltf(filepath=f)
        elif f.endswith('.stl'): bpy.ops.wm.stl_import(filepath=f)
        else: bpy.ops.wm.obj_import(filepath=f, forward_axis='Y', up_axis='Z')  # Onshape's OBJ is z up, as Blender is
        place = Matrix.Scale(part.get('scale', 1), 4) @ (Matrix.Rotation(math.pi / 2, 4, 'X') if part.get('yup') else Matrix())
        keep = part.get('keep')  # {node name: material}, the only nodes kept; else mat paints the whole file
        drop = re.compile(part['drop']) if part.get('drop') else None  # nodes left out, by a pattern of their names
        for o in [o for o in bpy.data.objects if o not in before and o.type == 'MESH']:
            names = [re.sub(r'\.\d+$', '', a.name) for a in chain(o)]
            hit = next((n for n in names if n in keep), None) if keep is not None else f.split('/')[-1]
            if hit is None or drop and any(drop.search(n) for n in names): continue
            mw = place @ o.matrix_world
            o.parent, o.matrix_world = None, Matrix()
            o.data = o.data.copy()
            o.data.transform(mw)
            ref = next((n for n in names if re.match(r'^[A-Z]+\d+$', n)), '')
            o['layer'] = LAYER.match(o.data.name)[1] if LAYER.match(o.data.name) else ''
            o['class'] = 'board' if o['layer'] else 'passive' if PASSIVE.match(ref) else 'part'
            m = keep[hit] if keep is not None else part.get('mat')
            if m:
                o.data.materials.clear()
                o.data.materials.append(material(hit, m[:3] + [1], *m[3:]))
            objs.append(o)
    for o in list(bpy.data.objects):
        if o not in objs: bpy.data.objects.remove(o)
    return objs


def chain(o):
    while o:
        yield o
        o = o.parent


def mid(objs):  # the board's mid-plane, from its body
    lo, hi = box([o for o in objs if o['layer'] == 'PCB'])
    return (lo.z + hi.z) / 2


def cull(o, z0):  # copper and vias: only faces that look out of the board
    if o['layer'] not in ('copper', 'via', 'pad'): return
    bm = bmesh.new()
    bm.from_mesh(o.data)
    walls = o['layer'] != 'pad'  # pads stand proud with their solder; their edges show
    inward = lambda f: f.normal.z * (f.calc_center_median().z - z0) < 0
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if inward(f) or (walls and abs(f.normal.z) < 0.5)], context='FACES')
    bm.to_mesh(o.data)
    bm.free()


def join(objs):
    if len(objs) > 1:
        with bpy.context.temp_override(active_object=objs[0], selected_editable_objects=objs):
            bpy.ops.object.join()
    return objs[0]


def tris(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


def box(objs):
    v = [w.co for o in objs for w in o.data.vertices]
    return [Vector([f(p[i] for p in v) for i in range(3)]) for f in (min, max)]


def weld(o):
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=WELD)
    bmesh.ops.dissolve_degenerate(bm, dist=WELD / 10, edges=bm.edges)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()


def colour(m):
    return list(principled(m).inputs['Base Color'].default_value)


# KiCad writes a part's STEP colour with no metal or roughness, which glTF reads as polished metal. Pins and
# terminations are the warm pale greys and golds; neutral greys, whites and colours are moulded or ceramic bodies.
def surface(m):
    p = principled(m)
    metal, rough, a = p.inputs['Metallic'], p.inputs['Roughness'], p.inputs['Alpha']
    if metal.default_value == 1 and rough.default_value == 1:
        r, g, b, _ = colour(m)
        shiny = board and 0.45 < r <= 1 and r >= g >= b and 0.55 < b / r < 0.97
        metal.default_value, rough.default_value = (1, 0.3) if shiny else (0, 0.55)
    if a.default_value > 0.89: a.default_value = 1  # silk and laminate are opaque; only the mask lets copper through
    m.surface_render_method = 'BLENDED' if a.default_value < 1 else 'DITHERED'


def key(m):
    p = principled(m)
    return [x ** 0.45 for x in colour(m)[:3]] + [p.inputs[k].default_value for k in ('Alpha', 'Metallic', 'Roughness')]


def far(m, r):
    return max(abs(a - b) for a, b in zip(key(m), key(r)))


# Heaviest first, a material joins the first it can't be told from; then, past the cap, the slightest opaque parts'
# go to their nearest. The board's own layers and the manifest's materials stay. A board's parts weigh by their
# triangles (an LED's lens is small, and many); a mesh's by the area they cover (a solar cell is two triangles).
def palette(objs, cap=12):
    grey, weight = material('plastic', [0.5, 0.5, 0.5, 1], 0, 0.55), {}
    for o in objs:
        if not o.data.materials: o.data.materials.append(grey)
        for i, m in enumerate(o.data.materials): o.data.materials[i] = m or grey
        for p in o.data.polygons:
            m = o.data.materials[p.material_index]
            weight[m] = weight.get(m, 0) + (1 if board else p.area)
    given, layers = set(MADE.values()) - {grey}, {m for o in objs if o['class'] == 'board' for m in o.data.materials}
    reps, to = [], {}
    for m in sorted(weight, key=lambda m: -weight[m]):
        surface(m)
        to[m] = None if m in given else next((r for r in reps if r not in given and far(m, r) < 0.1), None)
        if to[m]: weight[to[m]] += weight[m]
        else: to[m] = m; reps.append(m)
    while len(reps) > cap:
        opaque = [r for r in reps if key(r)[3] == 1]
        loose = [r for r in opaque if r not in given | layers]
        if not loose: break
        m = min(loose, key=weight.get)
        r = min((r for r in opaque if r is not m), key=lambda r: far(m, r))
        weight[r] += weight[m]
        reps.remove(m)
        to = {k: r if v is m else v for k, v in to.items()}
    for o in objs:
        for i, m in enumerate(o.data.materials): o.data.materials[i] = to[m]


def smooth(o, angle=math.radians(30)):
    bm = bmesh.new()
    bm.from_mesh(o.data)
    for f in bm.faces: f.smooth = True
    for e in bm.edges: e.smooth = e.is_manifold and e.calc_face_angle(math.pi) < angle
    bm.to_mesh(o.data)
    bm.free()


def decimate(o, ratio):
    if ratio >= 1: return
    d = o.modifiers.new('d', 'DECIMATE')
    d.ratio, d.use_collapse_triangulate = ratio, True
    with bpy.context.temp_override(object=o, active_object=o):
        bpy.ops.object.modifier_apply(modifier='d')


def ratios(counts, budget):  # r_k = min(1, s w_k), s so the classes sum to the budget
    lo, hi = 0, 1e3
    for _ in range(60):
        s = (lo + hi) / 2
        lo, hi = (s, hi) if sum(min(1, s * SHARE[k]) * n for k, n in counts.items()) < budget else (lo, s)
    return {k: min(1, lo * SHARE[k]) for k in counts}


bpy.ops.wm.read_factory_settings(use_empty=True)
objs = load()
z0 = mid(objs) if board else 0
for o in objs: cull(o, z0)
palette(objs)
classes = {}
for o in objs: classes.setdefault(o['class'], []).append(o)
classes = {k: join(v) for k, v in classes.items()}
for o in classes.values(): weld(o)
counts = {k: tris(o) for k, o in classes.items()}
print('RAW', json.dumps(counts))

# the centre: a board's outline (its layers' box) on its mid-plane, else the model's box
lo, hi = box([classes['board']] if board else classes.values())
centre = (lo + hi) / 2
if board: centre.z = z0

budget = job['tris']
while True:
    parts = []
    for k, o in classes.items():
        c = o.copy()
        c.data = o.data.copy()
        bpy.context.scene.collection.objects.link(c)
        parts.append(c)
    r = ratios(counts, budget)
    for c, k in zip(parts, classes): decimate(c, r[k])
    out = join(parts)
    out.name = out.data.name = job['id']
    out.data.transform(Matrix.Translation(-centre))
    smooth(out)
    for o in bpy.data.objects: o.select_set(o == out)
    bpy.ops.export_scene.gltf(filepath=job['out'], export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
        export_normals=True, export_texcoords=False, export_tangents=False, export_materials='EXPORT', export_vertex_color='NONE',
        export_attributes=False, export_extras=False)
    size = os.path.getsize(job['out'])
    if size <= job['bytes']: break
    budget = tris(out) * job['bytes'] / size * 0.97
    bpy.data.objects.remove(out)
    print('OVER', size, 'retry at', round(budget))

lo, hi = box([out])
used = {p.material_index for p in out.data.polygons}
print('MODEL ' + json.dumps({'tris': tris(out), 'bounds': [round(x, 5) for x in (lo[0], lo[2], -hi[1], hi[0], hi[2], -lo[1])],
    'materials': len(used), 'ratios': {k: round(x, 3) for k, x in r.items()}}))
