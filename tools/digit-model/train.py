# Trains the handwritten digit reader of the AvilonX loading form.
#   cd tools/digit-model && npm install && python3 train.py . 12 && python3 export.py .
# Writes model.npz; export.py turns it into pages/admin/entries/digit-model.js.
import numpy as np, json, sys, time
from PIL import Image
D=sys.argv[1]; rng=np.random.default_rng(7)
X=[];Y=[]
# The files hold one flat list per digit (784 values per sample).
for d in range(10):
    raw=open(f'{D}/node_modules/mnist/src/digits/{d}.json').read()
    arr=np.array(json.loads(raw)['data'],dtype=np.float32).reshape(-1,28,28)
    X.append(arr);Y+= [d]*len(arr)
X=np.concatenate(X);Y=np.array(Y);print('samples',X.shape)
idx=rng.permutation(len(X));X=X[idx];Y=Y[idx];Xt,Yt=X[:1000],Y[:1000];X,Y=X[1000:],Y[1000:]
import os
# Optional check: boxes cut from a real photo (real.npy: N×28×28 made with prep.py, real.txt: their digits).
real=np.load(f'{D}/real.npy').astype(np.float32) if os.path.exists(f'{D}/real.npy') else None
realY=np.array([int(c) for c in open(f'{D}/real.txt').read().strip()]) if real is not None else None
def maxf(a):
    p=np.pad(a,1);return np.max([p[i:i+28,j:j+28] for i in range(3) for j in range(3)],0)
def minf(a):
    p=np.pad(a,1);return np.min([p[i:i+28,j:j+28] for i in range(3) for j in range(3)],0)
def aug(img):
    a=rng.uniform(-14,14)*np.pi/180;sc=rng.uniform(.8,1.12);sh=rng.uniform(-.25,.25);sx=rng.uniform(.8,1.15)
    c,s=np.cos(a),np.sin(a);M=np.array([[c*sx,-s+sh],[s,c]])/sc;Mi=M
    t=np.array([13.5,13.5])-Mi@np.array([13.5+rng.uniform(-2,2),13.5+rng.uniform(-2,2)])
    im=Image.fromarray((img*255).astype(np.uint8)).transform((28,28),Image.AFFINE,(Mi[0,0],Mi[0,1],t[0],Mi[1,0],Mi[1,1],t[1]),resample=Image.BILINEAR)
    o=np.asarray(im,dtype=np.float32)/255;r=rng.random()
    if r<.35:o=np.clip((o-.45)*2.2,0,1)            # thin pen
    elif r<.5:o=np.clip(o*.6+minf(o)*.4,0,1)
    elif r<.62:o=maxf(o)                           # thick pen
    if rng.random()<.3:o=np.clip(o+rng.normal(0,.05,o.shape)*(rng.random()<.5),0,1)
    return o
def im2col(x,k,pad):
    n,c,h,w=x.shape;xp=np.pad(x,((0,0),(0,0),(pad,pad),(pad,pad)))
    cols=np.empty((n,c,k,k,h,w),dtype=x.dtype)
    for i in range(k):
        for j in range(k):cols[:,:,i,j]=xp[:,:,i:i+h,j:j+w]
    return cols.transpose(0,4,5,1,2,3).reshape(n*h*w,c*k*k)
def col2im(cols,shape,k,pad):
    n,c,h,w=shape;cols=cols.reshape(n,h,w,c,k,k).transpose(0,3,4,5,1,2);xp=np.zeros((n,c,h+2*pad,w+2*pad),dtype=cols.dtype)
    for i in range(k):
        for j in range(k):xp[:,:,i:i+h,j:j+w]+=cols[:,:,i,j]
    return xp[:,:,pad:pad+h,pad:pad+w]
C1,C2=12,24
P={'w1':rng.normal(0,np.sqrt(2/25),(C1,1*25)).astype(np.float32),'b1':np.zeros(C1,np.float32),
   'w2':rng.normal(0,np.sqrt(2/(C1*9)),(C2,C1*9)).astype(np.float32),'b2':np.zeros(C2,np.float32),
   'w3':rng.normal(0,np.sqrt(1/(C2*49)),(10,C2*49)).astype(np.float32),'b3':np.zeros(10,np.float32)}
def forward(x,cache=False):
    n=x.shape[0];c1=im2col(x,5,2);z1=(c1@P['w1'].T+P['b1']).reshape(n,28,28,C1).transpose(0,3,1,2);a1=np.maximum(z1,0)
    p1=a1.reshape(n,C1,14,2,14,2).max((3,5))
    c2=im2col(p1,3,1);z2=(c2@P['w2'].T+P['b2']).reshape(n,14,14,C2).transpose(0,3,1,2);a2=np.maximum(z2,0)
    p2=a2.reshape(n,C2,7,2,7,2).max((3,5));f=p2.reshape(n,-1);out=f@P['w3'].T+P['b3']
    return (out,(x,c1,a1,p1,c2,a2,p2,f)) if cache else out
def pool_back(dp,a):
    n,c,h,w=a.shape;r=a.reshape(n,c,h//2,2,w//2,2);m=r.max((3,5),keepdims=True);mask=(r==m)
    return (mask*dp[:,:,:,None,:,None]).reshape(a.shape)
def step(x,y):
    out,(x,c1,a1,p1,c2,a2,p2,f)=forward(x,True);n=len(y)
    e=np.exp(out-out.max(1,keepdims=True));pr=e/e.sum(1,keepdims=True);loss=-np.log(pr[np.arange(n),y]+1e-9).mean()
    d=pr;d[np.arange(n),y]-=1;d/=n;G={}
    G['w3']=d.T@f;G['b3']=d.sum(0);df=d@P['w3'];dp2=df.reshape(p2.shape)
    da2=pool_back(dp2,a2)*(a2>0);dz2=da2.transpose(0,2,3,1).reshape(-1,C2)
    G['w2']=dz2.T@c2;G['b2']=dz2.sum(0);dc2=dz2@P['w2'];dp1=col2im(dc2,p1.shape,3,1)
    da1=pool_back(dp1,a1)*(a1>0);dz1=da1.transpose(0,2,3,1).reshape(-1,C1)
    G['w1']=dz1.T@c1;G['b1']=dz1.sum(0);return loss,G
M={k:np.zeros_like(v) for k,v in P.items()};V={k:np.zeros_like(v) for k,v in P.items()};t=0
def acc(x,y):return (np.concatenate([forward(x[i:i+500,None]).argmax(1) for i in range(0,len(x),500)])==y).mean()
EP=int(sys.argv[2]) if len(sys.argv)>2 else 12
for ep in range(EP):
    t0=time.time();lr=2e-3*(.5**(ep//4));order=rng.permutation(len(X));L=0
    for b in range(0,len(X),64):
        ids=order[b:b+64];xb=np.stack([aug(X[i]) for i in ids])[:,None].astype(np.float32)
        loss,G=step(xb,Y[ids]);L+=loss;t+=1
        for k in P:
            M[k]=.9*M[k]+.1*G[k];V[k]=.999*V[k]+.001*G[k]**2
            P[k]-=lr*(M[k]/(1-.9**t))/(np.sqrt(V[k]/(1-.999**t))+1e-8)
    check=''
    if real is not None:pr=forward(real[:,None]).argmax(1);check=f' real {"".join(map(str,pr))} ({(pr==realY).sum()}/{len(realY)})'
    print(f'epoch {ep} loss {L/(len(X)/64):.3f} test {acc(Xt,Yt):.3f}{check} {time.time()-t0:.0f}s',flush=True)
np.savez(f'{D}/model.npz',**P)
