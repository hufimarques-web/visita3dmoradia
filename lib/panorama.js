export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const wrap=v=>Math.atan2(Math.sin(v),Math.cos(v));
export class Panorama {
  constructor(canvas,onFrame){
    this.canvas=canvas;this.onFrame=onFrame;this.view={yaw:0,pitch:0,fov:100};this.current=null;this.cache=new Map();this.pending=new Map();this.auto=false;this.dirty=true;this.raf=0;this.last=0;
    try{this.setupGL();}catch(e){console.warn('Panorama: a usar a alternativa 2D.',e);this.setupCPU();}
    this.events=new AbortController();
    this.canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.setupCPU();this.invalidate();},{signal:this.events.signal});
    this.observer=new ResizeObserver(()=>this.invalidate());this.observer.observe(this.canvas.parentElement);
    document.addEventListener('visibilitychange',()=>{this.last=0;if(!document.hidden)this.invalidate();},{signal:this.events.signal});
  }
  setupGL(){
    const gl=this.canvas.getContext('webgl',{alpha:false,antialias:false});if(!gl)throw Error('WebGL indisponível');this.gl=gl;
    const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
    const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'));
    gl.attachShader(program,shader(gl.FRAGMENT_SHADER,`precision highp float;
      uniform sampler2D image,detail0,detail1;uniform vec2 size,texSize,feathers;uniform vec3 camera;uniform vec4 detailCamera0,detailCamera1;uniform int detailCount;
      float cubic(float x){x=abs(x);return x<1.?1.5*x*x*x-2.5*x*x+1.:x<2.?-.5*x*x*x+2.5*x*x-4.*x+2.:0.;}
      vec4 sampleImage(vec2 uv){
        vec2 p=uv*texSize-.5,b=floor(p),f=p-b;vec4 c=vec4(0.);
        for(int j=-1;j<=2;j++)for(int i=-1;i<=2;i++){
          vec2 q=(b+vec2(float(i),float(j))+.5)/texSize;q.x=fract(q.x);q.y=clamp(q.y,.5/texSize.y,1.-.5/texSize.y);
          c+=texture2D(image,q)*cubic(float(i)-f.x)*cubic(float(j)-f.y);
        }
        vec2 step=1./texSize;
        vec3 nearby=(texture2D(image,vec2(fract(uv.x-step.x),uv.y)).rgb+texture2D(image,vec2(fract(uv.x+step.x),uv.y)).rgb+texture2D(image,vec2(uv.x,clamp(uv.y-step.y,0.,1.))).rgb+texture2D(image,vec2(uv.x,clamp(uv.y+step.y,0.,1.))).rgb)*.25;
        c.rgb+=clamp((c.rgb-nearby)*.32,vec3(-.035),vec3(.035));
        return clamp(c,0.,1.);
      }
      vec4 sampleDetail(sampler2D tex,vec3 ray,vec4 cam,float feather){
        float cx=cos(cam.x),sx=sin(cam.x),cp=cos(cam.y),sp=sin(cam.y);
        float x=cx*ray.x-sx*ray.z,z=sx*ray.x+cx*ray.z,y=cp*ray.y-sp*z;z=sp*ray.y+cp*z;
        if(z<=0.)return vec4(0.);vec2 uv=vec2(.5+.5*x/z/cam.z,.5-.5*y/z/(cam.z/cam.w));
        float edge=min(min(uv.x,1.-uv.x),min(uv.y,1.-uv.y));if(edge<=0.)return vec4(0.);
        return vec4(texture2D(tex,uv).rgb,smoothstep(0.,feather,edge));
      }
      void main(){float t=tan(camera.z*.5);vec2 uv=gl_FragCoord.xy/size;
        vec3 d=normalize(vec3((uv.x*2.-1.)*t,(uv.y*2.-1.)*t*size.y/size.x,1.));
        float cy=cos(camera.x),sy=sin(camera.x),cp=cos(camera.y),sp=sin(camera.y);
        float y=cp*d.y+sp*d.z,z=-sp*d.y+cp*d.z;
        vec3 r=vec3(cy*d.x+sy*z,y,-sy*d.x+cy*z);
        vec2 st=vec2(fract(.5+atan(r.x,r.z)/6.28318530718),.5-asin(clamp(r.y,-1.,1.))/3.14159265359);
        vec4 color=sampleImage(st);
        if(detailCount>0){vec4 d=sampleDetail(detail0,r,detailCamera0,feathers.x);color.rgb=mix(color.rgb,d.rgb,d.a);}
        if(detailCount>1){vec4 d=sampleDetail(detail1,r,detailCamera1,feathers.y);color.rgb=mix(color.rgb,d.rgb,d.a);}
        gl_FragColor=color;
      }`));
    gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);this.program=program;
    const buffer=gl.createBuffer();this.buffer=buffer;gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    const p=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(p);gl.vertexAttribPointer(p,2,gl.FLOAT,false,0,0);
    this.uniforms=Object.fromEntries(['image','size','texSize','camera','detail0','detail1','detailCount','detailCamera0','detailCamera1','feathers'].map(k=>[k,gl.getUniformLocation(program,k)]));
  }
  setupCPU(){
    this.gl=null;const replacement=document.createElement('canvas');replacement.id=this.canvas.id;replacement.tabIndex=0;replacement.setAttribute('aria-label',this.canvas.getAttribute('aria-label'));this.canvas.replaceWith(replacement);this.canvas=replacement;this.ctx=replacement.getContext('2d',{alpha:false});
    if(!this.ctx)throw Error('Não foi possível iniciar a visita neste dispositivo.');this.rayCache=null;
  }
  async load(scene){
    this.loadController?.abort();
    if(this.cache.has(scene.id))return this.cache.get(scene.id);
    const controller=new AbortController();this.loadController=controller;
    const {signal}=controller;
    const read=(src,priority='high')=>new Promise((resolve,reject)=>{
      const image=new Image();image.decoding='async';image.fetchPriority=priority;
      const cleanup=()=>{image.onload=null;image.onerror=null;signal.removeEventListener('abort',abort);};
      const abort=()=>{cleanup();image.src='';reject(new DOMException('Navigation cancelled','AbortError'));};
      if(signal.aborted){abort();return;}
      image.onload=()=>{cleanup();resolve(image);};
      image.onerror=()=>{cleanup();reject(Error('Não foi possível carregar esta vista.'));};
      signal.addEventListener('abort',abort,{once:true});image.src=src;
    });
    try {
      const img=await read(scene.optimizedImage||scene.image).catch(error=>{
        if(signal.aborted||!scene.optimizedImage)throw error;
        return read(scene.image);
      });
      const details=await Promise.all((scene.details||[]).map(async detail=>({...detail,img:await read(detail.image)})));
      if(signal.aborted)throw new DOMException('Navigation cancelled','AbortError');
      return {id:scene.id,img,details};
    } catch(error){controller.abort();throw error;}
  }
  transitionTo(item,view){
    this.transition?.cancel();this.transitionOverlay?.remove();
    let overlay;
    if(this.current&&!matchMedia('(prefers-reduced-motion:reduce)').matches){
      // Keep the previous frame intact while loading, then dissolve to the new view.
      this.draw();overlay=document.createElement('canvas');overlay.className='scene-transition';
      overlay.width=this.canvas.width;overlay.height=this.canvas.height;overlay.setAttribute('aria-hidden','true');
      overlay.getContext('2d').drawImage(this.canvas,0,0);this.canvas.parentElement.append(overlay);
      this.transitionOverlay=overlay;
    }
    this.use(item,view);this.draw();this.dirty=false;
    if(!this.firstFrame){this.firstFrame=true;this.canvas.dataset.readyMs=Math.round(performance.now());performance.mark('tour-first-panorama');}
    if(overlay){
      this.transition=overlay.animate([{opacity:1},{opacity:0}],{duration:420,easing:'cubic-bezier(.22,.61,.36,1)',fill:'forwards'});
      this.transition.finished.then(()=>overlay.remove()).catch(()=>overlay.remove());
    }
  }
  use(item,view){
    this.current=item;this.view={...view};this.auto=false;this.last=0;
    this.cache.delete(item.id);this.cache.set(item.id,item);
    if(this.gl&&!item.texture){const gl=this.gl,texture=gl.createTexture();item.texture=texture;gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,item.img);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);}
    if(this.gl)for(const d of item.details||[])if(!d.texture){const gl=this.gl;d.texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,d.texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,d.img);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);}
    const cacheLimit=1;
    while(this.cache.size>cacheLimit){const [key,old]=this.cache.entries().next().value;if(this.gl&&old.texture){this.gl.deleteTexture(old.texture);for(const d of old.details||[])if(d.texture)this.gl.deleteTexture(d.texture);}this.cache.delete(key);}
    this.invalidate();
  }
  dimensions(){const rect=this.canvas.getBoundingClientRect();return {width:Math.max(1,rect.width),height:Math.max(1,rect.height)};}
  tangent(){const {width,height}=this.dimensions();return Math.tan(this.view.fov*Math.PI/360)*Math.min(1,width/height/1.4473684210526316);}
  hfov(){return 2*Math.atan(this.tangent());}
  setView(values){Object.assign(this.view,values);this.view.yaw=wrap(this.view.yaw);this.view.pitch=clamp(this.view.pitch,-1.3,1.3);this.view.fov=clamp(this.view.fov,65,120);this.invalidate();}
  setAuto(value){this.auto=value;this.last=0;this.invalidate();}
  invalidate(){if(this.destroyed)return;this.dirty=true;if(!this.raf&&!document.hidden)this.raf=requestAnimationFrame(t=>this.tick(t));}
  destroy(){this.destroyed=true;this.auto=false;this.loadController?.abort();this.transition?.cancel();this.transitionOverlay?.remove();cancelAnimationFrame(this.raf);this.events?.abort();this.observer?.disconnect();if(this.gl){for(const item of this.cache.values()){if(item.texture)this.gl.deleteTexture(item.texture);for(const d of item.details||[])if(d.texture)this.gl.deleteTexture(d.texture);}this.gl.deleteProgram(this.program);this.gl.deleteBuffer(this.buffer);}this.cache.clear();this.current=null;this.onFrame=null;}
  tick(time){
    this.raf=0;if(document.hidden){this.last=0;return;}const dt=this.last?Math.min(.1,(time-this.last)/1000):0;this.last=time;
    if(this.auto){this.view.yaw=wrap(this.view.yaw+dt*.075);this.dirty=true;}
    if(this.dirty&&this.current){this.draw();this.dirty=false;}if(this.auto)this.raf=requestAnimationFrame(t=>this.tick(t));
  }
  draw(){
    const {width,height}=this.dimensions(),dpr=Math.min(window.devicePixelRatio||1,this.gl?2.5:1),w=Math.min(this.gl?4096:1200,Math.round(width*dpr)),h=Math.round(w*height/width),v=this.view;
    if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}
    if(this.gl){const gl=this.gl,ds=this.current.details||[];gl.viewport(0,0,w,h);gl.useProgram(this.program);gl.uniform2f(this.uniforms.size,w,h);gl.uniform2f(this.uniforms.texSize,this.current.img.naturalWidth,this.current.img.naturalHeight);gl.uniform3f(this.uniforms.camera,v.yaw,v.pitch,this.hfov());gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.current.texture);gl.uniform1i(this.uniforms.image,0);gl.uniform1i(this.uniforms.detailCount,ds.length);gl.uniform2f(this.uniforms.feathers,ds[0]?.feather||.1,ds[1]?.feather||.1);for(let i=0;i<2;i++){const d=ds[i];gl.activeTexture(gl.TEXTURE1+i);gl.bindTexture(gl.TEXTURE_2D,d?.texture||this.current.texture);gl.uniform1i(this.uniforms['detail'+i],i+1);gl.uniform4f(this.uniforms['detailCamera'+i],d?.yaw||0,d?.pitch||0,Math.tan((d?.fov||100)*Math.PI/360),d?.aspect||1.5);}gl.drawArrays(gl.TRIANGLES,0,6);}
    else this.drawCPU(w,h);
    this.canvas.dataset.scene=this.current.id;this.canvas.dataset.yaw=v.yaw;this.canvas.dataset.pitch=v.pitch;this.canvas.dataset.fov=v.fov;this.canvas.dataset.renderer=this.gl?'webgl':'canvas2d';this.onFrame?.();
  }
  drawCPU(w,h){
    const item=this.current;if(!item.pixels){const c=document.createElement('canvas');c.width=item.img.naturalWidth;c.height=item.img.naturalHeight;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(item.img,0,0);item.pixels=g.getImageData(0,0,c.width,c.height);}
    for(const d of item.details||[])if(!d.pixels){const c=document.createElement('canvas');c.width=d.img.naturalWidth;c.height=d.img.naturalHeight;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(d.img,0,0);d.pixels=ctx.getImageData(0,0,c.width,c.height);d.cy=Math.cos(d.yaw);d.sy=Math.sin(d.yaw);d.cp=Math.cos(d.pitch);d.sp=Math.sin(d.pitch);d.t=Math.tan(d.fov*Math.PI/360);}
    const {data:source,width:sw,height:sh}=item.pixels,t=this.tangent();
    if(!this.rayCache||this.rayCache.w!==w||this.rayCache.h!==h||this.rayCache.t!==t){const rays=new Float32Array(w*h*3);for(let y=0,k=0;y<h;y++)for(let x=0;x<w;x++){const a=(2*(x+.5)/w-1)*t,b=(1-2*(y+.5)/h)*t*h/w,n=Math.hypot(a,b,1);rays[k++]=a/n;rays[k++]=b/n;rays[k++]=1/n;}this.rayCache={w,h,t,rays,frame:this.ctx.createImageData(w,h)};}
    const {rays,frame}=this.rayCache,{yaw,pitch}=this.view,sy=Math.sin(yaw),cy=Math.cos(yaw),sp=Math.sin(pitch),cp=Math.cos(pitch);
    for(let k=0,i=0;k<rays.length;k+=3,i+=4){
      const yy=cp*rays[k+1]+sp*rays[k+2],zz=-sp*rays[k+1]+cp*rays[k+2],xx=cy*rays[k]+sy*zz,z=-sy*rays[k]+cy*zz;
      const u=((.5+Math.atan2(xx,z)/(2*Math.PI))%1+1)%1,v=.5-Math.asin(clamp(yy,-1,1))/Math.PI,x=u*sw-.5,y=clamp(v*sh-.5,0,sh-1),x0=Math.floor(x),y0=Math.floor(y),a=x-x0,b=y-y0;
      const j=(y0*sw+(x0+sw)%sw)*4,j1=(y0*sw+(x0+1+sw)%sw)*4,j2=(Math.min(sh-1,y0+1)*sw+(x0+sw)%sw)*4,j3=(Math.min(sh-1,y0+1)*sw+(x0+1+sw)%sw)*4;
      for(let c=0;c<3;c++)frame.data[i+c]=(source[j+c]*(1-a)+source[j1+c]*a)*(1-b)+(source[j2+c]*(1-a)+source[j3+c]*a)*b;frame.data[i+3]=255;
      for(const d of item.details||[]){const dx=d.cy*xx-d.sy*z,dz=d.sy*xx+d.cy*z,dy=d.cp*yy-d.sp*dz,zz=d.sp*yy+d.cp*dz;if(zz<=0)continue;const u=.5+.5*dx/zz/d.t,v=.5-.5*dy/zz/(d.t/d.aspect),edge=Math.min(u,1-u,v,1-v);if(edge<=0)continue;const alpha=clamp(edge/d.feather,0,1),weight=alpha*alpha*(3-2*alpha),p=d.pixels,px=clamp(u*p.width-.5,0,p.width-1),py=clamp(v*p.height-.5,0,p.height-1),x0=Math.floor(px),y0=Math.floor(py),fx=px-x0,fy=py-y0;for(let ch=0;ch<3;ch++){const at=(x,y)=>p.data[(Math.min(y,p.height-1)*p.width+Math.min(x,p.width-1))*4+ch],rgb=(at(x0,y0)*(1-fx)+at(x0+1,y0)*fx)*(1-fy)+(at(x0,y0+1)*(1-fx)+at(x0+1,y0+1)*fx)*fy;frame.data[i+ch]=frame.data[i+ch]*(1-weight)+rgb*weight;}}
    }
    this.ctx.putImageData(frame,0,0);
  }
  project(yaw,pitch){
    const dx=Math.sin(yaw)*Math.cos(pitch),dy=Math.sin(pitch),dz=Math.cos(yaw)*Math.cos(pitch),v=this.view;
    const x=Math.cos(v.yaw)*dx-Math.sin(v.yaw)*dz,z0=Math.sin(v.yaw)*dx+Math.cos(v.yaw)*dz,y=Math.cos(v.pitch)*dy-Math.sin(v.pitch)*z0,z=Math.sin(v.pitch)*dy+Math.cos(v.pitch)*z0;
    if(z<=0)return null;const {width,height}=this.dimensions(),t=this.tangent();return {x:(.5+.5*x/z/t)*width,y:(.5-.5*y/z/(t*height/width))*height};
  }
  floorRing(yaw,pitch,radius=.28){
    const distance=1.6/Math.tan(Math.max(.12,-pitch)),cx=Math.sin(yaw)*distance,cz=Math.cos(yaw)*distance,points=[];
    for(let i=0;i<40;i++){const a=i*Math.PI/20,x=cx+Math.cos(a)*radius,z=cz+Math.sin(a)*radius,p=this.project(Math.atan2(x,z),Math.atan2(-1.6,Math.hypot(x,z)));if(!p)return null;points.push(p);}
    const xs=points.map(p=>p.x),ys=points.map(p=>p.y),left=Math.min(...xs),top=Math.min(...ys),width=Math.max(...xs)-left,height=Math.max(...ys)-top;
    if(width>300||height>200||width<9)return null;
    return{left,top,width,height,path:points.map((p,i)=>(i?'L':'M')+(p.x-left).toFixed(1)+' '+(p.y-top).toFixed(1)).join(' ')+'Z'};
  }
}
