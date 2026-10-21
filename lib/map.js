import media from '../generated/media.json';
const ns='http://www.w3.org/2000/svg';
const plans={
  'Exterior':{box:[0,52,559,1292]},
  'R/C':{box:[0,575,550,652]},
  '1.º andar':{box:[584,523,595,707]},
  'Sótão':{box:[1195,574,622,638]}
};
// Indicative camera positions on the supplied perspective floor-plan sheet.
const planPoints={
  exterior_fachada:[364,1290],entrada_frontal:[430,1180],passagem_jardim:[476,871],corredor:[257,832],wc_social:[156,861],
  sala_jantar_posicao2:[250,982],sala_jantar:[70,1103],sala:[307,736],cozinha:[182,765],
  jardim_ponto_cozinha:[288,550],jardim_passagem:[458,586],jardim_fundo:[290,174],
  escadas_patamar:[767,877],corredor_piso1:[867,874],suite:[840,738],banho_suite:[1029,696],
  wc_f2:[1011,816],quarto_varanda_porta:[963,929],quarto_varanda_roupeiro:[1084,1088],
  quarto_secretaria:[833,1050],sotao_chegada:[1442,962],sotao_bilhar:[1563,811]
};
function svg(tag,attrs){const e=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);return e;}
export function drawMap(container,scenes,current,floor,onSelect,expanded=false){
  container.replaceChildren();const plan=plans[floor];if(!plan)return null;
  const [bx,by,bw,bh]=plan.box,activePoint=planPoints[current?.id];let crop=plan.box;
  if(!expanded){
    if(floor==='Exterior'){const mid=activePoint?.[1]||750;crop=[-45,Math.max(52,Math.min(740,mid-325)),650,650];}
    else{const side=Math.max(bw,bh)*1.12;crop=[bx+(bw-side)/2,by+(bh-side)/2,side,side];}
  }else{container.style.aspectRatio=bw+'/'+bh;container.style.width=`min(100%, calc(${100*bw/bh}dvh - ${240*bw/bh}px))`;}
  const[x,y,w,h]=crop,at=p=>({x:(p[0]-x)/w*100,y:(p[1]-y)/h*100});
  const image=svg('svg',{viewBox:crop.join(' '),'aria-hidden':'true',class:'map-drawing'});
  image.append(svg('rect',{x,y,width:w,height:h,fill:'#e8e4dd'}));
  const defs=svg('defs',{}),clip=svg('clipPath',{id:container.id+'-clip'});
  clip.append(svg('rect',{x:bx,y:by,width:bw,height:bh}));defs.append(clip);image.append(defs);
  image.append(svg('image',{href:media.floorPlan,x:0,y:0,width:1824,height:1344,'clip-path':'url(#'+container.id+'-clip)'}));
  const group=scenes.filter(s=>s.floor===floor&&planPoints[s.id]);let wedge=null;
  if(group.some(s=>s.id===current?.id)){
    const p=planPoints[current.id];wedge=svg('g',{transform:`translate(${p[0]},${p[1]})`});
    wedge.append(svg('path',{d:'M0 0L-25 -60Q0 -72 25 -60Z',fill:'#c18843','fill-opacity':'.55'}));image.append(wedge);
  }
  container.append(image);
  for(const scene of group){
    const p=at(planPoints[scene.id]);if(p.x<1||p.x>99||p.y<1||p.y>99)continue;
    const button=document.createElement('button');button.className='map-point';button.style.left=p.x+'%';button.style.top=p.y+'%';
    button.setAttribute('aria-label','Ir para '+scene.title+' — '+scene.detail);button.setAttribute('aria-current',String(scene.id===current?.id));
    button.title=scene.title+' · '+scene.detail;button.dataset.scene=scene.id;
    const label=document.createElement('span');label.textContent=scene.title;button.append(label);button.addEventListener('click',()=>onSelect(scene.id));container.append(button);
  }
  return wedge?angle=>{const p=planPoints[current.id];wedge.setAttribute('transform',`translate(${p[0]},${p[1]}) rotate(${angle*180/Math.PI})`);}:null;
}
