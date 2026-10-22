'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {RITUAL_CLOSE} from './journey-link.mjs';
const labels:Record<string,string>={arrival:'一封信，打开画中世界',developers:'自由创作',screens:'城市里的光',studio:'心意工坊',community:'旅人的作品',creators:'我的创作',account:'我的旅程',orders:'我的约定',events:'发起一场相聚',gather:'一起见证',showcase:'世界里的故事',festival:'地域仪式',guide:'旅程指南'};
export default function RitualPortal({src,onClose,returnLabel='回到画境'}:{src:string;onClose:()=>void;returnLabel?:string}){
 const frame=useRef<HTMLIFrameElement>(null),close=useRef<HTMLButtonElement>(null),trail=useRef<string[]>([]);
 const [ready,setReady]=useState(false),[slow,setSlow]=useState(false),[title,setTitle]=useState(''),[depth,setDepth]=useState(0);
 const leave=useCallback(()=>{
  const child=frame.current?.contentWindow;
  if(child){try{const event=new Event('beforeunload',{cancelable:true});child.dispatchEvent(event);if(event.defaultPrevented&&!window.confirm('还有未保存的修改。确定回到画境吗？'))return;}catch{}}
  onClose();
 },[onClose]);
 useEffect(()=>{setReady(false);setSlow(false);trail.current=[];setDepth(0);const timer=setTimeout(()=>setSlow(true),12000);return()=>clearTimeout(timer);},[src]);
 useEffect(()=>{
  const focused=document.activeElement as HTMLElement|null,main=document.querySelector('main.world-app, main.kc-showcase, main.event-hub') as HTMLElement|null,old=document.body.style.overflow;
  document.body.style.overflow='hidden';if(main)main.inert=true;close.current?.focus();
  const message=(e:MessageEvent)=>{if(e.origin===location.origin&&e.source===frame.current?.contentWindow&&e.data?.type===RITUAL_CLOSE)leave();};
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!document.querySelector('dialog[open]'))leave();};
  window.addEventListener('message',message);window.addEventListener('keydown',key);
  return()=>{document.body.style.overflow=old;if(main)main.inert=false;window.removeEventListener('message',message);window.removeEventListener('keydown',key);focused?.focus();};
 },[leave]);
 function loaded(){
  setReady(true);
  try{
   const child=frame.current?.contentWindow,doc=frame.current?.contentDocument;if(!child||!doc)return;
   const url=new URL(child.location.href),path=url.pathname+url.search;
   doc.documentElement.classList.add('kindchain-embedded');
   setTitle(labels[url.pathname.split('/')[1]]||'我的旅程');
   const index=trail.current.lastIndexOf(path);
   trail.current=index>=0?trail.current.slice(0,index+1):[...trail.current,path];setDepth(trail.current.length);
   doc.addEventListener('keydown',e=>{if(e.key==='Escape'&&!doc.querySelector('dialog[open]'))leave();});
   doc.addEventListener('click',e=>{
    if(e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||e.defaultPrevented)return;
    const a=(e.target as Element)?.closest?.('a[href]') as HTMLAnchorElement|null;if(!a||a.download)return;
    const to=new URL(a.href,child.location.href);
    if(to.origin!==location.origin)return;
    // Authentication owns the top-level page, including independent email login.
    if(to.pathname.startsWith('/signin-')||to.pathname.startsWith('/signout-')||to.pathname.startsWith('/auth/')){a.target='_top';return;}
    if(a.target==='_blank')return;
    if(to.pathname==='/'||to.pathname==='/start'){e.preventDefault();e.stopPropagation();leave();return;}
    // Product navigation stays within this workspace, including older _top links.
    if(a.target==='_top')a.target='_self';
   },true);
  }catch{/* External checkout is allowed to own its navigation. */}
 }
 return createPortal(<section className="ritual-portal" role="dialog" aria-modal="true" aria-label="KindChain 世界内工作区"><header><div className="world-workspace-heading">{depth>1&&<button aria-label="返回上一步" onClick={()=>{const previous=trail.current[trail.current.length-2];if(previous)frame.current?.contentWindow?.location.assign(previous);}}>←</button>}<span>KindChain <small> / {title||'正在展开'}</small></span></div><button ref={close} onClick={leave}>× {returnLabel}</button></header>{!ready&&<p role="status">{slow?<>加载较慢，<button onClick={()=>{if(frame.current)frame.current.src=src;}}>重新加载</button>，或返回画境稍后再试。</>:"正在展开…"}</p>}<iframe ref={frame} allowFullScreen src={src} title="KindChain 画境、创作与社区" onLoad={loaded}/></section>,document.body);
}
