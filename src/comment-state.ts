/** Request guards shared by comment integrations. */
export function canRequestComments(id:string|undefined,enabled:boolean,offline:boolean){return enabled&&!offline&&Boolean(id&&/^\d+$/.test(id));}
export class LatestRequest {
 private serial=0;
 next(){return ++this.serial;}
 valid(serial:number){return serial===this.serial;}
 invalidate(){this.serial++;}
}
