import {SoundTouchNode} from '@soundtouchjs/audio-worklet';
import processorUrl from '@soundtouchjs/audio-worklet/processor?url';
export async function createPitchNode(context:AudioContext){await SoundTouchNode.register(context,new URL(processorUrl,document.baseURI).href);return new SoundTouchNode({context});}
