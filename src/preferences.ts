import type {Settings,Theme} from './shared';
export const appearanceDefaults = {theme:'system',textSize:'standard',autoHotComments:false,coverMode:'record',playerLayoutVersion:2} as const;
export function themeSource(value:unknown):Theme {
  if(value==='light'||value==='dark'||value==='system')return value;
  throw Error('无效的主题');
}
export function applyAppearance(settings:Settings,dark:boolean,root=document.documentElement){
  root.dataset.theme=dark?'dark':'light';
  root.dataset.textSize=settings.textSize??'standard';
}
