// This legacy CDN alias has a mismatched HTTPS certificate. The verified
// canonical host serves the same paths and keeps certificate validation on.
export function canonicalArtworkHost(url:URL):URL {
 if(url.hostname.toLowerCase()==='img1.kwcdn.kuwo.cn')url.hostname='img1.kuwo.cn';
 return url;
}
