export type Quality = '128k' | '320k' | 'flac';
export type Purpose = 'play' | 'download';
export interface AudioInfo {format?:string;codec?:string;bitrate?:number;sampleRate?:number;bitsPerSample?:number;channels?:number;duration?:number}
export interface HifiState {active:boolean;playing:boolean;position:number;duration:number;info?:AudioInfo;output?:AudioInfo;device?:string;error?:string;ended?:boolean;generation:number}
export interface AudioDevice {id:string;name:string}
export interface PlaySource extends AudioInfo {url:string;trial:boolean;quality:Quality;cover?:string;engine?:'browser'|'hifi';generation?:number;track?:Track}
export interface Track {
  id: string; name: string; artist: string; album: string; duration: number;
  cover?: string; qualities: Quality[]; localPath?: string;
  hasMv?:boolean; artistId?:string; albumId?:string; onlineId?:string; audioInfo?:AudioInfo;
  availability?: 'unknown' | 'available' | 'restricted' | 'trial' | 'unavailable';
  payInfo?: { play?: string; download?: string; trial?: boolean; encrypted?: boolean };
}
export interface Collection { id: string; name: string; cover?: string; description?: string; count?: number; kind: 'playlist' | 'rank' | 'album' | 'artist'; artist?:string; group?:string; plays?:number }
export interface SearchSuggestion {text:string;description?:string}
export interface SearchHints {suggestions:SearchSuggestion[];hot:SearchSuggestion[];idle:SearchSuggestion[]}
export interface RankPeriod {id:string;rankId:string;year:string;name:string;cover?:string}
export type SearchKind='all'|'music'|'playlist'|'artist'|'album'|'lyrics';
export interface CatalogResult extends SearchResult {items:Collection[]; errors?:string[]}
export interface PlaylistTag {id:string;name:string;group:string}
export interface PlaylistPage {items:Collection[];total:number;page:number}
export interface MvSource {url:string;quality:string;bitrate:number;local?:boolean}
export interface LyricLine { time: number; text: string }
export interface ResolvedAudio { url: string; quality: Quality; format: string; trial: boolean; duration?: number; bitrate?: number; cover?: string; headers?: Record<string,string> }
export interface SearchResult { tracks: Track[]; total: number; page: number }
export interface QualityOption {quality:Quality;available:boolean;error?:string;format?:string;bitrate?:number}
export type DownloadStatus = 'queued' | 'resolving' | 'downloading' | 'paused' | 'completed' | 'failed' | 'cancelled';
export interface DownloadTask {
  id: string; track: Track; quality: Quality; status: DownloadStatus;
  received: number; total: number; speed: number; path?: string; partPath?: string;
  error?: string; created: number; format?: string; etag?: string; modified?: string;
  metadataSaved?: boolean;
  requestedQuality?:Quality; media?:'audio'|'mv'; videoQuality?:string; videoBitrate?:number;
}
export type Theme = 'system'|'light'|'dark';
export type TextSize = 'standard'|'large'|'larger';
export type ProxyMode = 'direct'|'system';
export interface Comment { id:string; author:string; avatar?:string; time:string; text:string; likes:number }
export interface CommentPage { comments:Comment[]; total:number; page:number; pageSize:number; pages:number }
export type CommentSort = 'hot'|'latest';
export interface Settings { downloadDir: string; concurrency: number; quality: Quality; qualityPolicyVersion?:number; playerLayoutVersion?:number; volume: number; muted?:boolean; zoom: number; offline?: boolean; proxyMode?:ProxyMode; playbackRate?:number; lyricOffset?:number; lyricFontSize?:number; coverMode?:'record'|'square'; saveLyrics?:boolean; saveCover?:boolean; theme?:Theme; textSize?:TextSize; autoHotComments?:boolean; audioOutput?:'normal'|'hifi'; audioDevice?:string }
export interface LocalPlaylist { id: string; name: string; tracks: Track[] }
export interface Library { favorites: Track[]; history: Track[]; local: Track[]; playlists: LocalPlaylist[] }
export interface Snapshot { settings: Settings; library: Library; tasks: DownloadTask[]; themeDark?:boolean }
export interface DesktopApi {
  snapshot(): Promise<Snapshot>;
  comments(id:string,sort:CommentSort,page:number,force?:boolean):Promise<CommentPage>;
  onTheme(callback:(dark:boolean)=>void):()=>void;
  onVisibility(callback:(visible:boolean)=>void):()=>void;
  search(query: string, page: number): Promise<SearchResult>;
  searchCatalog(query:string,kind:SearchKind,page:number):Promise<CatalogResult>;
  playlistTags():Promise<PlaylistTag[]>;
  discoverPlaylists(page:number,order:'hot'|'new',tag?:string):Promise<PlaylistPage>;
  mv(track:Track):Promise<MvSource>;
  home(page?:number): Promise<{ recommendations: Collection[]; ranks: Collection[]; editorial:Collection[];daily:Track[];nativeErrors:string[] }>;
  collection(id: string, kind: Collection['kind'], page?: number, period?:string): Promise<SearchResult>;
  rankPeriods(id:string):Promise<RankPeriod[]>;
  searchHints(query:string):Promise<SearchHints>;
  lyrics(id: string, force?:boolean): Promise<LyricLine[]>;
  importLyrics(id:string):Promise<LyricLine[]|null>;
  qualities(track:Track,purpose?:Purpose):Promise<QualityOption[]>;
  play(track: Track, quality: Quality): Promise<PlaySource>;
  cancelPlay():Promise<void>;
  playbackEvent(event:'started'|'startup-retry'|'stall-retry'|'failed'|'cancelled',id:string):Promise<void>;
  enrichLocal(track:Track):Promise<Track>;
  importDropped(files:File[]):Promise<Track[]>;
  hifiDevices():Promise<AudioDevice[]>;
  hifiControl(action:'pause'|'resume'|'seek'|'stop',position?:number):Promise<void>;
  onHifi(callback:(state:HifiState)=>void):()=>void;
  download(tracks: Track[], quality: Quality): Promise<DownloadTask[]>;
  downloadMv(track:Track):Promise<DownloadTask[]>;
  downloadAction(id: string, action: 'pause'|'resume'|'cancel'|'retry'|'reveal'): Promise<void>;
  updateSettings(settings: Partial<Settings>): Promise<Settings>;
  chooseDirectory(): Promise<string | null>;
  importMusic(): Promise<Track[]>;
  favorite(track: Track): Promise<Library>;
  history(track: Track): Promise<Library>;
  playlist(action:'create'|'add'|'remove'|'delete', nameOrId:string, track?:Track): Promise<Library>;
  openDirectory(): Promise<void>;
  window(action: 'minimize'|'maximize'|'close'): Promise<void>;
  onTasks(callback:(tasks:DownloadTask[])=>void): ()=>void;
  onLibrary(callback:(library:Library)=>void):()=>void;
}
declare global { interface Window { desktop: DesktopApi } }
