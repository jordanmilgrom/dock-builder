/**
 * Embeddable widget (§5.7, Phase 4). Pure helpers shared by the `/embed.js`
 * route and the embed iframe page. Framework-free, no build step; the loader
 * string is tiny (≤ 8 KB) and deterministic so it's cacheable + testable.
 *
 * The loader: finds its own <script data-tenant>, injects an iframe pointing at
 * the app's `/embed` page for that tenant, and listens for postMessage resize
 * events — strictly from the app origin. It never touches the host page cookies.
 *
 * Gated by entitlements.embed (Pro+) at the snippet-display + route boundary.
 */

export const EMBED_MESSAGE_RESIZE = "dock-embed:resize";
export const EMBED_MESSAGE_SCROLL = "dock-embed:scrollTop";

/** The iframe URL for a tenant, served by the app origin. */
export function embedIframeUrl(appOrigin: string, slug: string): string {
  return `${appOrigin}/embed?tenant=${encodeURIComponent(slug)}`;
}

/** postMessage origin allow-list: only the app origin is trusted. */
export function isAllowedOrigin(origin: string, appOrigin: string): boolean {
  return origin === appOrigin;
}

/** The `<script>` snippet a builder pastes into their site. */
export function embedSnippet(appOrigin: string, slug: string): string {
  return `<script src="${appOrigin}/embed.js" data-tenant="${slug}" async></script>`;
}

/**
 * The loader script body served at `/embed.js`. Deterministic for a given
 * appOrigin. Plain ES5-ish JS so it runs everywhere with no transpile.
 */
export function buildEmbedLoader(appOrigin: string): string {
  const ORIGIN = JSON.stringify(appOrigin);
  const RESIZE = JSON.stringify(EMBED_MESSAGE_RESIZE);
  const SCROLL = JSON.stringify(EMBED_MESSAGE_SCROLL);
  return `(function(){
  var ORIGIN=${ORIGIN};
  function findScript(){
    if(document.currentScript&&document.currentScript.getAttribute('data-tenant'))return document.currentScript;
    var a=document.getElementsByTagName('script');
    for(var i=a.length-1;i>=0;i--){if(a[i].getAttribute&&a[i].getAttribute('data-tenant'))return a[i];}
    return null;
  }
  var s=findScript();
  if(!s)return;
  var tenant=s.getAttribute('data-tenant');
  if(!tenant)return;
  var iframe=document.createElement('iframe');
  iframe.src=ORIGIN+'/embed?tenant='+encodeURIComponent(tenant);
  iframe.title='Dock Configurator';
  iframe.loading='lazy';
  iframe.style.width='100%';
  iframe.style.border='0';
  iframe.style.minHeight='640px';
  iframe.setAttribute('scrolling','no');
  s.parentNode.insertBefore(iframe,s.nextSibling);
  window.addEventListener('message',function(e){
    if(e.origin!==ORIGIN)return;
    var d=e.data||{};
    if(d.type===${RESIZE}&&typeof d.height==='number'){iframe.style.height=Math.ceil(d.height)+'px';}
    else if(d.type===${SCROLL}){try{iframe.scrollIntoView({behavior:'smooth',block:'start'});}catch(_){}}
  });
})();`;
}
