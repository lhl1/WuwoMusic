import type {Settings} from '../shared';
export function DownloadPreferences({settings,onChange}:{settings?:Settings;onChange:(patch:Partial<Settings>)=>void}){
 return <><div className="setting-row"><div><b>同时保存歌词</b><p>下载完成后保存同名 LRC，方便其他播放器离线使用</p></div><input type="checkbox" aria-label="同时保存歌词" checked={settings?.saveLyrics!==false} onChange={e=>onChange({saveLyrics:e.target.checked})}/></div><div className="setting-row"><div><b>同时保存封面</b><p>保存歌曲封面图片；已看过的封面也会自动缓存</p></div><input type="checkbox" aria-label="同时保存封面" checked={settings?.saveCover!==false} onChange={e=>onChange({saveCover:e.target.checked})}/></div></>;
}
