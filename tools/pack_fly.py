# Packs NeuroMechFly v2 meshes + skeleton (Apache-2.0, NeLy-EPFL/flygym) into data/fly-body.js.
# Usage: python tools/pack_fly.py   (expects the Xenova Space clone path in A below)
import json,struct,base64,numpy as np,os
A='/mnt/user-data/uploads/xenova-reference/dist/body/assets/'
m=json.load(open(A+'model.json'))
keep={k:m[k] for k in ['root','meshScale','axisVector','segments','joints','rest','meshes','neutralDeg','reference']}
keep['dofs']=[{k:d[k] for k in ('name','parent','child','axis','limitDeg') if k in d} for d in m['dofs']]
keep['reference']={'neutralJointPositions':m['reference']['neutralJointPositions']}
meshes={}; total=0
for f in sorted(set(v['file'] for v in m['meshes'].values())):
    b=open(A+'meshes/'+f,'rb').read(); n=struct.unpack_from('<I',b,80)[0]
    a=np.frombuffer(b,dtype=np.uint8,offset=84,count=n*50).reshape(n,50)
    v=np.frombuffer(a[:,12:48].tobytes(),dtype='<f4').reshape(-1,3)*m['meshScale']
    key=np.round(v*1e5).astype(np.int64)
    uniq,inv=np.unique(key,axis=0,return_inverse=True)
    pos=uniq/1e5
    lo=pos.min(0); hi=pos.max(0); sc=(hi-lo)/65535
    q=np.round((pos-lo)/np.where(sc==0,1,sc)).astype('<u2')
    idx=inv.reshape(-1).astype('<u2' if len(uniq)<65536 else '<u4')
    meshes[f]={'lo':lo.tolist(),'sc':sc.tolist(),'p':base64.b64encode(q.tobytes()).decode(),'i':base64.b64encode(idx.tobytes()).decode(),'i32':idx.dtype.itemsize==4}
    total+=len(meshes[f]['p'])+len(meshes[f]['i'])
keep['meshData']=meshes
s='// NeuroMechFly v2 body (Apache-2.0, NeLy-EPFL/flygym), packed by tools/pack_fly.py.\nwindow.FLY_BODY='+json.dumps(keep,separators=(',',':'))+';\n'
open('/home/claude/can-a-fly-play-tetris-/data/fly-body.js','w').write(s)
print(len(meshes),'meshes', total, 'b64 bytes; file', len(s))
