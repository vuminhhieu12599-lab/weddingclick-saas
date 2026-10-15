# LAUNCH-P0-04 — generates the showroom demo mood images (abstract bokeh/silk
# textures, no people). Usage: python3 generate-demo-mood-images.py public/showroom/demo
# Fixed seeds: output is reproducible on the same Pillow version. See ASSETS.md.
import math, random, sys, os
from PIL import Image, ImageDraw, ImageFilter, ImageChops
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

def hexrgb(h): h=h.lstrip('#'); return tuple(int(h[i:i+2],16) for i in (0,2,4))

def gradient(w,h,top,bottom):
    top,bottom=hexrgb(top),hexrgb(bottom)
    g=Image.new('RGB',(1,h))
    for y in range(h):
        t=y/(h-1); g.putpixel((0,y),tuple(int(top[i]+(bottom[i]-top[i])*t) for i in range(3)))
    return g.resize((w,h))

def glow(img,cx,cy,r,color,alpha):
    w,h=img.size; layer=Image.new('RGB',(w,h),hexrgb(color)); m=Image.new('L',(w,h),0)
    d=ImageDraw.Draw(m); d.ellipse((cx-r,cy-r,cx+r,cy+r),fill=alpha)
    m=m.filter(ImageFilter.GaussianBlur(r*0.6))
    return Image.composite(layer,img,m)

def bokeh(img,rng,n,rmin,rmax,colors,amax,blur):
    w,h=img.size
    for pas in range(2):
        layer=Image.new('RGB',(w,h),(0,0,0)); m=Image.new('L',(w,h),0)
        dl=ImageDraw.Draw(layer); dm=ImageDraw.Draw(m)
        for _ in range(n//2):
            r=rng.uniform(rmin,rmax)*(1.6 if pas==0 else 1)
            x=rng.uniform(-r,w+r); y=rng.uniform(-r,h*0.85)
            c=hexrgb(rng.choice(colors)); a=int(rng.uniform(0.25,1)*amax)
            dl.ellipse((x-r,y-r,x+r,y+r),fill=c); dm.ellipse((x-r,y-r,x+r,y+r),fill=a)
            dm.ellipse((x-r,y-r,x+r,y+r),outline=min(255,a+40),width=max(2,int(r*0.06)))
        b=blur*(2.2 if pas==0 else 1)
        layer=layer.filter(ImageFilter.GaussianBlur(b)); m=m.filter(ImageFilter.GaussianBlur(b))
        img=Image.composite(ImageChops.screen(img,layer),img,m)
    return img

def branch(draw,rng,x,y,angle,length,leaf,steps,fill):
    for i in range(steps):
        t=i/steps
        px=x+math.cos(angle)*length*t; py=y+math.sin(angle)*length*t
        angle+=rng.uniform(-0.05,0.05)
        for side in (-1,1):
            a=angle+side*rng.uniform(0.6,1.0)
            L=leaf*(1-0.5*t)*rng.uniform(0.8,1.2); Wd=L*0.42
            pts=[]
            for k in range(24):
                u=k/23*2*math.pi
                lx=(math.cos(u)+1)/2*L; ly=math.sin(u)*Wd*(1-abs(math.cos(u))*0.3)
                pts.append((px+lx*math.cos(a)-ly*math.sin(a), py+lx*math.sin(a)+ly*math.cos(a)))
            draw.polygon(pts,fill=fill)
        draw.line([(px,py),(px+math.cos(angle)*length/steps,py+math.sin(angle)*length/steps)],fill=fill,width=max(2,int(leaf*0.08)))

def leaf_shadow(img,rng,color,alpha,blur,branches):
    w,h=img.size; m=Image.new('L',(w,h),0); d=ImageDraw.Draw(m)
    for (x,y,ang,ln,lf) in branches:
        branch(d,rng,x*w,y*h,ang,ln*w,lf*w,14,alpha)
    m=m.filter(ImageFilter.GaussianBlur(blur))
    return Image.composite(Image.new('RGB',(w,h),hexrgb(color)),img,m)

def silk(img,rng,light,dark,waves,amp,blur):
    w,h=img.size; m=Image.new('L',(w,h),0); d=ImageDraw.Draw(m)
    md=Image.new('L',(w,h),0); dd=ImageDraw.Draw(md)
    for i in range(waves):
        base=rng.uniform(-0.2,1.2)*w; ph=rng.uniform(0,6.28); width=rng.uniform(0.04,0.12)*w
        pts=[];pts2=[]
        for y in range(0,h+20,20):
            x=base+math.sin(y/h*math.pi*1.3+ph)*amp*w+y*0.35
            pts.append((x,y)); pts2.append((x+width,y))
        poly=pts+pts2[::-1]
        (d if i%2==0 else dd).polygon(poly,fill=int(rng.uniform(70,150)))
    m=m.filter(ImageFilter.GaussianBlur(blur)); md=md.filter(ImageFilter.GaussianBlur(blur*1.3))
    img=Image.composite(Image.new('RGB',(w,h),hexrgb(light)),img,m)
    return Image.composite(Image.new('RGB',(w,h),hexrgb(dark)),img,md)

def petals(img,rng,colors,n,size,blur):
    w,h=img.size
    for pas,(bl,sc) in enumerate(((blur*3,1.5),(blur,1.0))):
        layer=Image.new('RGB',(w,h)); m=Image.new('L',(w,h),0); dl=ImageDraw.Draw(layer); dm=ImageDraw.Draw(m)
        for _ in range(n):
            x=rng.uniform(0,w); y=rng.uniform(0,h); s=size*rng.uniform(0.5,1.2)*sc*w; a=rng.uniform(0,6.28)
            pts=[]
            for k in range(30):
                u=k/29*2*math.pi; r=s*(0.55+0.45*math.cos(u))**0.8
                pts.append((x+r*math.cos(u+a),y+r*0.75*math.sin(u+a)))
            c=hexrgb(rng.choice(colors)); dl.polygon(pts,fill=c); dm.polygon(pts,fill=int(rng.uniform(120,220)))
        layer=layer.filter(ImageFilter.GaussianBlur(bl)); m=m.filter(ImageFilter.GaussianBlur(bl))
        img=Image.composite(layer,img,m)
    return img

def finish(img,rng,grain=7,vignette=0.22):
    w,h=img.size
    noise=Image.effect_noise((w,h),grain*4).convert('RGB')
    img=Image.blend(img,ImageChops.overlay(img,noise),0.12)
    v=Image.new('L',(w,h),0); d=ImageDraw.Draw(v)
    d.ellipse((-w*0.25,-h*0.2,w*1.25,h*1.2),fill=255); v=v.filter(ImageFilter.GaussianBlur(min(w,h)*0.18))
    dark=Image.blend(img,Image.new('RGB',(w,h),(40,28,22)),vignette)
    return Image.composite(img,dark,v)

def save(img,name):
    img.save(os.path.join(OUT,name+'.webp'),'WEBP',quality=80,method=6)


R=random.Random
def leafbig(w,h,seed,bg1,bg2,glowc,shadow,branches,blur):
    r=R(seed); im=gradient(w,h,bg1,bg2); im=glow(im,int(w*0.7),int(h*0.2),int(max(w,h)*0.45),glowc,220)
    m=Image.new('L',(w,h),0); d=ImageDraw.Draw(m)
    for (x,y,ang,ln,lf) in branches:
        rr=R(seed+int(x*100)); px,py=x*w,y*h
        steps=6
        for i in range(steps):
            t=i/steps; cx=px+math.cos(ang)*ln*w*t; cy=py+math.sin(ang)*ln*w*t
            for side in (-1,1):
                a=ang+side*rr.uniform(0.7,1.0); L=lf*w*(1-0.35*t); Wd=L*0.45
                pts=[]
                for k in range(40):
                    u=k/39*2*math.pi; lx=(1-math.cos(u))/2*L; ly=math.sin(u)*Wd*math.sin(u/2)
                    pts.append((cx+lx*math.cos(a)-ly*math.sin(a), cy+lx*math.sin(a)+ly*math.cos(a)))
                d.polygon(pts,fill=110)
            d.line([(cx,cy),(cx+math.cos(ang)*ln*w/steps,cy+math.sin(ang)*ln*w/steps)],fill=110,width=int(w*0.008))
    m=m.filter(ImageFilter.GaussianBlur(blur))
    im=Image.composite(Image.new('RGB',(w,h),hexrgb(shadow)),im,m)
    return finish(im,r,6,0.15)
def bok(w,h,seed,bg1,bg2,glowxy,glowc,colors,amax):
    r=R(seed); im=gradient(w,h,bg1,bg2); im=glow(im,int(w*glowxy[0]),int(h*glowxy[1]),int(max(w,h)*0.45),glowc,230)
    im=bokeh(im,r,int(70*w*h/(900*1200)),w*0.02,w*0.075,colors,amax,5); return finish(im,r)
def silkimg(w,h,seed,bg1,bg2,glowc,light,dark):
    r=R(seed); im=gradient(w,h,bg1,bg2); im=glow(im,int(w*0.35),int(h*0.25),int(max(w,h)*0.5),glowc,200)
    im=silk(im,r,light,dark,10,0.14,28); im=silk(im,R(seed+1),light,dark,6,0.1,14); return finish(im,r)
G=['#fff3d6','#ffe2a8','#f7d9b0','#ffffff']; B=['#fff0ec','#f6cfc6','#f3b9ad','#ffffff']
save(bok(900,1200,11,'#f6e7cf','#d9b98d',(0.72,0.22),'#fff4dc',G,170),'mood-champagne-portrait')
save(bok(900,1200,12,'#f3d8d1','#d8a99e',(0.3,0.25),'#fff1ec',B,170),'mood-blush-bokeh-portrait')
save(bok(900,1200,44,'#6b4a45','#3a2a2c',(0.5,0.32),'#a8735f',['#f2c79a','#ffd9b0','#e8a98a','#fff0d8'],150),'mood-dusk-bokeh-portrait')
save(bok(900,1200,13,'#e3e6d6','#b9bf9f',(0.65,0.2),'#fbfbef',['#ffffff','#f4f1dc','#e9ecd0','#fff6dc'],150),'mood-sage-bokeh-portrait')
save(silkimg(900,1200,33,'#f1d6cf','#dcb2a8','#fff1ec','#fff6f2','#b98a80'),'mood-blush-silk-portrait')
save(bok(1200,900,77,'#f3e2c6','#d7b487',(0.28,0.28),'#fff3da',G,170),'mood-champagne-landscape')
save(bok(1000,1000,88,'#f6e1da','#e3bcb1',(0.5,0.4),'#fff3ef',B,170),'mood-blush-bokeh-square')
save(silkimg(1000,1000,99,'#efdcb9','#cfa974','#fff1d4','#fff3da','#a98250'),'mood-gold-silk-square')

save(bok(1200,900,15,'#f3d8d1','#d8a99e',(0.7,0.3),'#fff1ec',B,170),'mood-blush-bokeh-landscape')
