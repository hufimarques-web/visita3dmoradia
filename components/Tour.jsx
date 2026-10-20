'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import scenes from '../generated/scenes.json';
import { Panorama, clamp } from '../lib/panorama';
import { drawMap } from '../lib/map';

const byId = new Map(scenes.map(scene => [scene.id, scene]));
const floors = ['Exterior', 'Rés do chão', '2.º piso', '3.º piso'];
const compactQuery = '(max-width:800px), (max-height:500px) and (orientation:landscape)';

function Icon({ name }) {
  const paths = {
    close: 'm6 6 12 12M18 6 6 18', arrow: 'M4 12h16m-6-6 6 6-6 6',
    minus: 'M5 12h14', plus: 'M5 12h14M12 5v14',
    play: 'm9 5 10 7-10 7Z', pause: 'M8 5v14M16 5v14',
    fullscreen: 'M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6',
    drag: 'm6 8-4 4 4 4m12-8 4 4-4 4M2 12h20',
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{name === 'grid' ? <><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></> : <path d={paths[name]}/>}</svg>;
}

export default function Tour() {
  const root = useRef(null), host = useRef(null), stage = useRef(null), engine = useRef(null);
  const roomsDialog = useRef(null), mapDialog = useRef(null), mapBody = useRef(null);
  const miniMap = useRef(null), fullMap = useRef(null), roomList = useRef(null);
  const pins = useRef(new Map()), sceneRef = useRef(scenes[0]), frame = useRef(null);
  const directions = useRef({}), navigateRef = useRef(null), mapPreference = useRef(null);
  const [current, setCurrent] = useState(scenes[0]);
  const [loading, setLoading] = useState('Fachada'), [error, setError] = useState('');
  const [floor, setFloor] = useState('Todas'), [mapFloor, setMapFloor] = useState('Exterior');
  const [compact, setCompact] = useState(false), [collapsed, setCollapsed] = useState(false);
  const [rotating, setRotating] = useState(false), [hint, setHint] = useState(true);
  const [fullscreen, setFullscreen] = useState(false), [canFullscreen, setCanFullscreen] = useState(false);
  const index = scenes.findIndex(scene => scene.id === current.id);
  const next = scenes[(index + 1) % scenes.length];
  const go = useCallback(id => navigateRef.current?.(id), []);
  const stopRotation = useCallback(() => { engine.current?.setAuto(false); setRotating(false); }, []);
  const dismissHint = useCallback(() => setHint(false), []);

  // Camera updates stay in the canvas and SVG layers, without re-rendering the room menu on every frame.
  frame.current = () => {
    const renderer = engine.current;
    if (!renderer || !root.current) return;
    const { width, height } = renderer.dimensions(), rect = renderer.canvas.getBoundingClientRect();
    const touchSize = matchMedia(compactQuery).matches || matchMedia('(pointer:coarse)').matches ? 48 : 44;
    const obstacles = [...root.current.querySelectorAll('.topbar,.bottom-bar,.mini-map,.direction-dial')]
      .map(e => e.getBoundingClientRect()).filter(r => r.width && r.height);
    for (const point of sceneRef.current.hotspots) {
      const element = pins.current.get(point.target); if (!element) continue;
      const p = renderer.floorRing(point.yaw, point.pitch, point.radius || .28);
      if (!p) { element.hidden = true; continue; }
      const w = Math.max(touchSize, p.width + 16), h = Math.max(touchSize, p.height + 16);
      const x = p.left + p.width / 2, y = p.top + p.height / 2;
      element.hidden = x-w/2<4 || x+w/2>width-4 || y-h/2<4 || y+h/2>height-4 ||
        obstacles.some(r => x+w/2>r.left-rect.left && x-w/2<r.right-rect.left && y+h/2>r.top-rect.top && y-h/2<r.bottom-rect.top);
      if (!element.hidden) {
        Object.assign(element.style, { left:x+'px', top:y+'px', width:w+'px', height:h+'px' });
        const graphic=element.querySelector('svg'); graphic.style.width=p.width+'px'; graphic.style.height=p.height+'px';
        graphic.setAttribute('viewBox', `0 0 ${p.width} ${p.height}`); graphic.querySelector('path').setAttribute('d',p.path);
      }
    }
    const angle = renderer.view.yaw - (sceneRef.current.rotation || 0);
    directions.current.mini?.(angle); directions.current.full?.(angle);
    const degrees = ((renderer.view.yaw * 180 / Math.PI) % 360 + 360) % 360;
    root.current.querySelector('#direction-angle').textContent = Math.round(degrees)+'°';
    root.current.querySelector('#dial-ticks').style.transform = `rotate(${-degrees}deg)`;
    root.current.querySelector('#zoom-value').textContent = Math.round(100*Math.tan(sceneRef.current.view.fov*Math.PI/360)/Math.tan(renderer.view.fov*Math.PI/360))+'%';
  };

  useEffect(() => {
    const controller = new AbortController(), { signal } = controller;
    const listen = (target,type,callback,options={}) => target.addEventListener(type,callback,{...options,signal});
    const canvas = document.createElement('canvas'); canvas.id='view'; canvas.tabIndex=0;
    canvas.setAttribute('aria-label','Panorama de 360 graus. Arraste para olhar em redor.'); host.current.append(canvas);
    let renderer, token=0, requested=scenes[0], hintTimer, dragStart=null, pinchStart=null;
    const pointers = new Map(), surface=stage.current, canvasHost=host.current;
    try { renderer=new Panorama(canvas,()=>frame.current?.()); engine.current=renderer; }
    catch { setError('Não foi possível iniciar a visita neste dispositivo.'); setLoading(''); return () => canvasHost.replaceChildren(); }
    const compactMedia=matchMedia(compactQuery);
    const syncScreen=()=>{setCompact(compactMedia.matches);setCollapsed(mapPreference.current??compactMedia.matches);};
    listen(compactMedia,'change',syncScreen); syncScreen();
    setCanFullscreen(Boolean(root.current.requestFullscreen));
    listen(document,'fullscreenchange',()=>{setFullscreen(Boolean(document.fullscreenElement));renderer.invalidate();});
    const navigate = async (id,historyMode='push') => {
      const scene=byId.get(id); if(!scene) return; requested=scene; const request=++token;
      stopRotation(); pointers.clear(); dragStart=null; pinchStart=null; surface.classList.remove('dragging');
      setLoading(scene.title); setError('');
      try {
        const item=await renderer.load(scene); if(signal.aborted||request!==token)return;
        sceneRef.current=scene; renderer.use(item,scene.view); setCurrent(scene); setMapFloor(scene.floor); setLoading('');
        document.title=scene.title+' — Moradia · Visita virtual';
        renderer.canvas.setAttribute('aria-label',scene.title+'. Panorama de 360 graus. Arraste ou use as teclas de direção.');
        if(historyMode==='replace')history.replaceState({scene:id},'','#'+id);
        else if(historyMode==='push'&&location.hash!=='#'+id)history.pushState({scene:id},'','#'+id);
        roomsDialog.current?.close(); mapDialog.current?.close();
        clearTimeout(hintTimer); hintTimer=setTimeout(()=>setHint(false),6500);
      } catch {
        if(signal.aborted||request!==token)return;
        setError('Não foi possível abrir '+scene.title.toLocaleLowerCase('pt-PT')+'. Verifique a ligação e tente novamente.');setLoading('');
      }
    };
    navigateRef.current=id=>navigate(id||requested.id);
    const historyChange=()=>{const id=location.hash.slice(1);if(byId.has(id)&&id!==sceneRef.current.id)navigate(id,'none');};
    listen(window,'hashchange',historyChange); listen(window,'popstate',historyChange);
    const capture=()=>{
      if(pointers.size===1){dragStart={...[...pointers.values()][0],...renderer.view};pinchStart=null;}
      else if(pointers.size===2){const[a,b]=[...pointers.values()];pinchStart={distance:Math.hypot(a.x-b.x,a.y-b.y),fov:renderer.view.fov};dragStart=null;}
    };
    listen(surface,'pointerdown',e=>{
      if(!renderer.current||e.target.closest('button')||(e.button!==undefined&&e.button!==0))return;
      e.preventDefault();stopRotation();dismissHint();pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});capture();surface.classList.add('dragging');
      try{surface.setPointerCapture(e.pointerId);}catch{}
    });
    listen(surface,'pointermove',e=>{
      if(!pointers.has(e.pointerId))return;e.preventDefault();pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(pointers.size===2&&pinchStart){const[a,b]=[...pointers.values()],distance=Math.hypot(a.x-b.x,a.y-b.y);if(distance>1)renderer.setView({fov:pinchStart.fov*pinchStart.distance/distance});}
      else if(dragStart){const k=renderer.hfov()/renderer.dimensions().width;renderer.setView({yaw:dragStart.yaw-(e.clientX-dragStart.x)*k,pitch:dragStart.pitch+(e.clientY-dragStart.y)*k});}
    });
    const release=e=>{pointers.delete(e.pointerId);if(!pointers.size){dragStart=null;pinchStart=null;surface.classList.remove('dragging');}else capture();};
    for(const event of ['pointerup','pointercancel','lostpointercapture'])listen(surface,event,release);
    listen(surface,'wheel',e=>{if(!renderer.current)return;e.preventDefault();stopRotation();dismissHint();renderer.setView({fov:renderer.view.fov+clamp(e.deltaY,-150,150)*.05});},{passive:false});
    listen(surface,'keydown',e=>{
      if(e.target.tagName!=='CANVAS'||!renderer.current)return;
      const moves={ArrowLeft:{yaw:renderer.view.yaw-.12},ArrowRight:{yaw:renderer.view.yaw+.12},ArrowUp:{pitch:renderer.view.pitch+.1},ArrowDown:{pitch:renderer.view.pitch-.1},'+':{fov:renderer.view.fov-10},'-':{fov:renderer.view.fov+10}};
      if(moves[e.key]){e.preventDefault();stopRotation();dismissHint();renderer.setView(moves[e.key]);}
    });
    navigate(byId.has(location.hash.slice(1))?location.hash.slice(1):scenes[0].id,'replace');
    return()=>{controller.abort();++token;clearTimeout(hintTimer);renderer.destroy();canvasHost.replaceChildren();engine.current=null;navigateRef.current=null;};
  }, [stopRotation,dismissHint]);

  useEffect(()=>{
    directions.current.mini=drawMap(miniMap.current,scenes,current,current.floor,go);
    directions.current.full=drawMap(fullMap.current,scenes,current,mapFloor,go,true);
    if(mapBody.current)mapBody.current.scrollTop=0;
    engine.current?.invalidate();
  },[current,mapFloor,go]);
  useEffect(()=>{engine.current?.invalidate();},[collapsed,compact,loading]);

  const openRooms=()=>{stopRotation();setFloor('Todas');roomsDialog.current.showModal();};
  const openMap=()=>{stopRotation();setMapFloor(current.floor);mapDialog.current.showModal();};
  const reset=()=>{stopRotation();dismissHint();engine.current?.setView(current.view);};
  const zoom=delta=>{stopRotation();dismissHint();if(engine.current)engine.current.setView({fov:engine.current.view.fov+delta});};
  const rotate=()=>{if(!engine.current?.current)return;const value=!engine.current.auto;engine.current.setAuto(value);setRotating(value);dismissHint();};
  const toggleMap=()=>{mapPreference.current=!collapsed;setCollapsed(!collapsed);};
  const toggleFullscreen=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await root.current.requestFullscreen();}catch{setCanFullscreen(false);}};

  return <>
    <main id="tour" ref={root} aria-label="Visita virtual à moradia">
      <div className={'panorama'+(loading?' changing':'')} id="panorama" ref={stage}>
        <div className="canvas-host" ref={host}/>
        <div className="hotspots" id="hotspots" aria-label="Ligações para outras vistas" style={{visibility:loading?'hidden':undefined}}>
          {current.hotspots.filter(point=>byId.has(point.target)).map(point=><button key={current.id+point.target} type="button" className="hotspot" data-target={point.target} aria-label={point.label} ref={element=>{if(element)pins.current.set(point.target,element);else pins.current.delete(point.target);}} onClick={()=>go(point.target)}>
            <svg className="floor-ring" aria-hidden="true"><path/></svg><span className="hotspot-label">{point.label}</span>
          </button>)}
        </div>
      </div>
      <div className="shade" aria-hidden="true"/>
      <header className="topbar">
        <a className="brand" href="#exterior_fachada" aria-label="Moradia, voltar ao exterior" onClick={e=>{e.preventDefault();go('exterior_fachada');}}>
          <svg viewBox="0 0 32 36" fill="none" aria-hidden="true"><path d="M3 33V14L16 3l13 11v19H3Z"/><path d="M12 33V22h8v11M16 3v10"/></svg><span>MORADIA<small>VISITA VIRTUAL</small></span>
        </a>
        <div className="top-actions"><span className="view-badge">360°</span><button className="explore-button" id="open-menu" aria-haspopup="dialog" onClick={openRooms}><span>Explorar a casa</span><Icon name="grid"/></button></div>
      </header>
      <div className="direction-dial" aria-label="Orientação da vista"><div className="dial-ticks" id="dial-ticks"/><span className="dial-pointer" aria-hidden="true">▲</span><strong id="direction-angle">0°</strong><small>ORIENTAÇÃO</small></div>
      <aside className={'mini-map'+(collapsed?' collapsed':'')} aria-label="Planta 3D com pontos de visita">
        <div className="mini-map-image" id="mini-map-image" ref={miniMap}/>
        <button className="map-collapse" id="map-collapse" aria-label={collapsed?'Expandir mapa':'Recolher mapa'} aria-expanded={!collapsed} onClick={toggleMap}>⌄</button>
        <button className="map-caption" id="open-map" onClick={openMap}><span id="map-floor">{current.floor}</span><small>Planta 3D ↗</small></button>
      </aside>
      <div className="loading" id="loading" role="status" hidden={!loading}><span className="spinner" aria-hidden="true"/><span>A abrir {loading.toLocaleLowerCase('pt-PT')}…</span></div>
      <div className="error-box" id="error" role="alert" hidden={!error}><p>{error}</p><button id="retry" onClick={()=>go()}>Tentar novamente</button></div>
      <p className={'hint'+(!hint?' dismissed':'')} id="hint"><Icon name="drag"/><span id="hint-text">{compact?'Deslize para olhar · toque nos círculos':'Arraste para olhar em redor'}</span></p>
      <footer className="bottom-bar">
        <div className="scene-caption" aria-live="polite" aria-atomic="true"><p className="eyebrow" id="floor-label">{current.floor}</p><h1 id="scene-title">{current.title}</h1><div className="scene-meta"><span className="scene-counter" id="scene-count">{String(index+1).padStart(2,'0')} / {scenes.length}</span><span className="separator" aria-hidden="true"/><span id="scene-detail">{current.detail}</span></div></div>
        <div className="navigation">
          <div className="toolbar" aria-label="Controlos do panorama">
            <button id="reset-view" aria-label="Repor enquadramento normal a 100%" title="Repor enquadramento normal" onClick={reset}><span id="zoom-value">100%</span></button><span className="toolbar-divider" aria-hidden="true"/>
            <button id="zoom-out" aria-label="Afastar" title="Afastar" onClick={()=>zoom(10)}><Icon name="minus"/></button><button id="zoom-in" aria-label="Aproximar" title="Aproximar" onClick={()=>zoom(-10)}><Icon name="plus"/></button><span className="toolbar-divider" aria-hidden="true"/>
            <button id="rotate" aria-label={rotating?'Parar rotação':'Rodar automaticamente'} aria-pressed={rotating} onClick={rotate}><Icon name={rotating?'pause':'play'}/></button>
            <button id="fullscreen" aria-label={fullscreen?'Sair de ecrã inteiro':'Ecrã inteiro'} onClick={toggleFullscreen} hidden={!canFullscreen}><Icon name="fullscreen"/></button>
          </div>
          <button className="next-view" id="next-view" data-target={next.id} aria-label={'Continuar visita: '+next.title} onClick={()=>go(next.id)} disabled={Boolean(loading)}><span><small>CONTINUAR VISITA</small><strong id="next-title">{next.id==='exterior_fachada'?'Voltar ao exterior':next.title}</strong></span><Icon name="arrow"/></button>
        </div>
      </footer>
      <p className="sr-only" id="announcement" role="status">{current.floor} — {current.title}</p>
    </main>
    <dialog id="rooms" aria-labelledby="rooms-title" ref={roomsDialog}>
      <div className="panel-heading"><div><p className="eyebrow">ESCOLHA O SEU PERCURSO</p><h2 id="rooms-title">Explore a casa</h2></div><button id="close-menu" className="close-button" aria-label="Fechar divisões" onClick={()=>roomsDialog.current.close()}><Icon name="close"/></button></div>
      <div className="floor-tabs" id="floor-tabs" aria-label="Filtrar por piso">{['Todas',...floors].map(value=><button key={value} aria-pressed={floor===value} onClick={()=>{setFloor(value);roomList.current.scrollTop=0;}}>{value}</button>)}</div>
      <div className="room-list" id="room-list" ref={roomList}>{scenes.filter(scene=>floor==='Todas'||scene.floor===floor).map(scene=><button key={scene.id} className="room-card" data-scene={scene.id} aria-current={current.id===scene.id} onClick={()=>go(scene.id)}><img src={scene.thumb} alt="" width="100" height="70" loading="lazy"/><span className="room-info"><small>{scene.floor}</small><strong>{scene.title}</strong><span>{scene.detail}</span></span></button>)}</div>
      <p className="panel-note">Escolha uma vista e explore em 360°.</p>
    </dialog>
    <dialog id="map-dialog" aria-labelledby="map-title" ref={mapDialog}>
      <div className="panel-heading"><div><p className="eyebrow">ORIENTE-SE NA VISITA</p><h2 id="map-title">Planta 3D</h2></div><button id="close-map" className="close-button" aria-label="Fechar mapa" onClick={()=>mapDialog.current.close()}><Icon name="close"/></button></div>
      <div className="floor-tabs" id="map-floors" aria-label="Piso do mapa">{floors.map(value=><button key={value} aria-pressed={mapFloor===value} onClick={()=>setMapFloor(value)}>{value}</button>)}</div>
      <div className="map-body" ref={mapBody}><div className="full-map-image" id="full-map-image" ref={fullMap}/><nav className="map-locations" id="map-locations" aria-label="Posições neste piso">{scenes.filter(scene=>scene.floor===mapFloor).map(scene=><button className="map-location" data-scene={scene.id} key={scene.id} aria-current={current.id===scene.id} onClick={()=>go(scene.id)}><strong>{scene.title}</strong><small>{scene.detail}</small></button>)}</nav></div>
      <p className="panel-note">Toque num ponto para mudar de posição. Localização indicativa sobre a planta de referência.</p>
    </dialog>
    <noscript><div className="no-script">Ative o JavaScript para explorar a visita virtual.</div></noscript>
  </>;
}
