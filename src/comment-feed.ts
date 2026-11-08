import type {Comment,CommentPage,CommentSource} from './shared';
export interface FeedState {items:Comment[];page:number;hasMore:boolean;loading:boolean;error:string;source?:CommentSource}
export const emptyFeed=():FeedState=>({items:[],page:0,hasMore:true,loading:false,error:''});
/** Serial page loading keeps duplicates out and ignores responses after a song or sort change. */
export class CommentFeed {
 state=emptyFeed();private disposed=false;
 constructor(private request:(page:number,force:boolean)=>Promise<CommentPage>,private change:(state:FeedState)=>void){}
 private emit(patch:Partial<FeedState>){this.state={...this.state,...patch};this.change(this.state);}
 dispose(){this.disposed=true;}
 async load(force=false){
  if(this.disposed||this.state.loading||!this.state.hasMore||this.state.error&&!force)return;
  this.emit({loading:true,error:''});const next=this.state.page+1;
  try{const data=await this.request(next,force);if(this.disposed)return;
   const ids=new Set(this.state.items.map(c=>c.id));const added=data.comments.filter(c=>{if(ids.has(c.id))return false;ids.add(c.id);return true;});
   this.emit({items:[...this.state.items,...added],page:next,hasMore:added.length>0&&next<data.pages,loading:false,source:data.source});
  }catch(e){if(!this.disposed)this.emit({loading:false,error:(e as Error).message});}
 }
}
export function canLoopFeed(state:FeedState){return state.items.length>0&&!state.hasMore&&!state.loading&&!state.error;}
export function commentScrollRunning(s:{enabled:boolean;playing:boolean;visible:boolean;hover:boolean;focus:boolean;expanded:boolean;offline:boolean;error:string}){
 return s.enabled&&s.playing&&s.visible&&!s.hover&&!s.focus&&!s.expanded&&!s.offline&&!s.error;
}
