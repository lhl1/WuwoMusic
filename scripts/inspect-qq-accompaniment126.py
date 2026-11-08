"""Read-only inspection. Needs pefile: python -m pip install pefile.
Never loads QQ DLLs, alters QQ state, or copies its models into this project.
"""
import hashlib,json,sys
from pathlib import Path
import xml.etree.ElementTree as ET
import pefile

root=Path(sys.argv[1] if len(sys.argv)>1 else r'D:\Program Files (x86)\Tencent\QQMusic')
names=['QQMediaPlayer.dll','qmcpcom.dll','OpenVino/TNET_HOST.exe','OpenVino/Split.xml','OpenVino/Split.bin']
report={'method':'read-only PE imports/exports and OpenVINO IR metadata','files':[]}
for name in names:
 p=root/name;b=p.read_bytes();item={'file':name,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
 if p.suffix.lower() in ['.dll','.exe']:
  pe=pefile.PE(data=b);item['machine']=hex(pe.FILE_HEADER.Machine)
  item['imports']={d.dll.decode():[s.name.decode() for s in d.imports if s.name and any(w in s.name for w in [b'vocal_accomp',b'OpenVino',b'rubber_band_set_pitch'])] for d in getattr(pe,'DIRECTORY_ENTRY_IMPORT',[]) if any(s.name and any(w in s.name for w in [b'vocal_accomp',b'OpenVino',b'rubber_band_set_pitch']) for s in d.imports)}
  item['exports']=[s.name.decode() for s in getattr(getattr(pe,'DIRECTORY_ENTRY_EXPORT',None),'symbols',[]) if s.name and s.name.startswith(b'vocal_accomp')]
 if p.suffix=='.xml':
  model=ET.fromstring(b);layers=model.find('layers');item.update({'irVersion':model.get('version'),'layers':len(layers),'ports':[{'name':l.get('name'),'type':l.get('type'),'shapes':[[int(d.text) for d in port.findall('dim')] for port in l.findall('./output/port')+l.findall('./input/port')]} for l in layers if l.get('type') in ['Parameter','Result']]})
 report['files'].append(item)
out=Path('docs/evidence/qq126-inspection.json');out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(out)
