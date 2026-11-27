# A STEP that KiCad's exporter can't mesh (it skips every node of Raspberry Pi's CM5 "without triangulation data"),
# meshed by OCCT directly with its colours and names: step2glb.py in.step out.glb [options], options JSON: `paint`, a map
# of node names ('*' for all) to [r, g, b, metallic, roughness] (linear) for parts whose colour the STEP has wrong; `half`, an axis
# (±x, ±y or ±z of the STEP, as [x, y, z]) whose side of the origin alone is kept, to cut a part in two. Run with a
# Python that has OCP (cadquery's), as bake-models.mjs does for a model marked `occt`. STEP is z up, glTF y up.
import sys
from OCP.STEPCAFControl import STEPCAFControl_Reader
from OCP.TDocStd import TDocStd_Document
from OCP.TCollection import TCollection_ExtendedString, TCollection_AsciiString
from OCP.XCAFDoc import XCAFDoc_DocumentTool
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.TDF import TDF_LabelSequence
from OCP.RWGltf import RWGltf_CafWriter
from OCP.TColStd import TColStd_IndexedDataMapOfStringString
from OCP.Message import Message_ProgressRange
from OCP.BRepAlgoAPI import BRepAlgoAPI_Common
from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox
from OCP.gp import gp_Pnt
import json, struct

opt = json.loads(sys.argv[3] if len(sys.argv) > 3 else '{}')

doc = TDocStd_Document(TCollection_ExtendedString('step'))
r = STEPCAFControl_Reader()
r.SetColorMode(True), r.SetNameMode(True)
r.ReadFile(sys.argv[1]), r.Transfer(doc)
shapes, free = XCAFDoc_DocumentTool.ShapeTool_s(doc.Main()), TDF_LabelSequence()
shapes.GetFreeShapes(free)
for i in range(1, free.Length() + 1):
    if 'half' in opt:  # what lies on the axis's side of the origin, within a metre
        lo, hi = [-1e3 if a <= 0 else 0 for a in opt['half']], [1e3 if a >= 0 else 0 for a in opt['half']]
        shapes.SetShape(free.Value(i), BRepAlgoAPI_Common(shapes.GetShape_s(free.Value(i)), BRepPrimAPI_MakeBox(gp_Pnt(*lo), gp_Pnt(*hi)).Shape()).Shape())
    BRepMesh_IncrementalMesh(shapes.GetShape_s(free.Value(i)), 0.02, False, 0.1, True)  # mm, rad
if not RWGltf_CafWriter(TCollection_AsciiString(sys.argv[2]), True).Perform(doc, TColStd_IndexedDataMapOfStringString(), Message_ProgressRange()): sys.exit(1)
# OCP's writer can't be told the STEP is z up, so the scene goes under a node turned −90° about x
b = open(sys.argv[2], 'rb').read()
n = struct.unpack_from('<I', b, 12)[0]
j, rest = json.loads(b[20:20 + n]), b[20 + n:]
j['nodes'].append({'rotation': [-0.5 ** 0.5, 0, 0, 0.5 ** 0.5], 'children': j['scenes'][0]['nodes']})
j['scenes'][0]['nodes'] = [len(j['nodes']) - 1]
for name, (red, green, blue, metal, rough) in opt.get('paint', {}).items():
    j.setdefault('materials', []).append({'name': name, 'pbrMetallicRoughness': {'baseColorFactor': [red, green, blue, 1], 'metallicFactor': metal, 'roughnessFactor': rough}})
    for node in j['nodes']:
        if name in (node.get('name'), '*') and 'mesh' in node:
            for prim in j['meshes'][node['mesh']]['primitives']: prim['material'] = len(j['materials']) - 1
t = json.dumps(j).encode()
t += b' ' * (-len(t) % 4)
open(sys.argv[2], 'wb').write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(t) + len(rest)) + struct.pack('<II', len(t), 0x4E4F534A) + t + rest)
