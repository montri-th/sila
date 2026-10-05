/* Sila adapter. Registered SVG and motion rules remain exact; pin/wordmark never animate. */
import { svg } from './citychat-motif-motion.js';

const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
const stages = [...document.querySelectorAll('[data-citychat-header-logo]')];
const dotStarts = [[380,500,620],[530,650,770]];

const suppress = (stage) => {
  stage.setAttribute('data-logo-suppressed','');
  stage.removeAttribute('data-logo-ready');
  stage.querySelectorAll('.cc-header-logo__motion').forEach((layer)=>layer.remove());
  stage.dataset.logoState='static';
};

const settle = (stage) => {
  stage.querySelectorAll('.cc-header-logo__motion').forEach((layer)=>{
    layer.getAnimations?.({subtree:true}).forEach((animation)=>{try{animation.finish();}catch(_){}});
  });
  stage.dataset.logoState='complete';
};

const decodeImage = async (image) => {
  if(typeof image.decode==='function')await image.decode();
  else if(!image.complete)await new Promise((resolve,reject)=>{image.addEventListener('load',resolve,{once:true});image.addEventListener('error',reject,{once:true});});
  if(!image.complete||image.naturalWidth<=0)throw new Error('Logo image unavailable');
};

const layerFor = (rendition) => {
  const layer=document.createElement('span');
  layer.className='cc-header-logo__rendition';
  layer.dataset.logoRendition=rendition;
  const base=document.createElement('img');
  base.src=new URL(`./lockup-without-bubbles-${rendition}.png`,import.meta.url).href;
  base.alt='';base.width=494;base.height=106;base.decoding='async';
  const bubbles=document.createElement('span');
  bubbles.innerHTML=svg.logo[rendition];
  bubbles.setAttribute('aria-hidden','true');
  const inline=bubbles.querySelector('svg');
  inline?.setAttribute('focusable','false');
  inline?.querySelectorAll('.mm-logo').forEach((bubble,i)=>bubble.querySelectorAll('.mm-dot').forEach((dot,j)=>{dot.style.animationDelay=`${dotStarts[i][j]}ms`;}));
  layer.append(base,bubbles);
  return layer;
};

const playOnce = async (stage) => {
  if(preference?.matches||document.hidden){suppress(stage);return;}
  try{
    const motion=document.createElement('span');
    motion.className='cc-header-logo__motion';motion.setAttribute('aria-hidden','true');
    motion.append(layerFor('light'),layerFor('dark'));
    await Promise.all([...motion.querySelectorAll('img')].map(decodeImage));
    if(preference?.matches||document.hidden||stage.hasAttribute('data-logo-suppressed')){suppress(stage);return;}
    stage.append(motion);stage.setAttribute('data-logo-ready','');stage.dataset.logoState='animating';
    window.setTimeout(()=>settle(stage),1400);
  }catch(_){suppress(stage);}
};

stages.forEach(playOnce);
preference?.addEventListener?.('change',(event)=>{if(event.matches)stages.forEach(suppress);});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stages.forEach(settle);});
window.addEventListener('pagehide',()=>stages.forEach(settle));
