if(!self.define){let e,s={};const l=(l,i)=>(l=new URL(l+".js",i).href,s[l]||new Promise((s=>{if("document"in self){const e=document.createElement("script");e.src=l,e.onload=s,document.head.appendChild(e)}else e=l,importScripts(l),s()})).then((()=>{let e=s[l];if(!e)throw new Error(`Module ${l} didn’t register its module`);return e})));self.define=(i,n)=>{const r=e||("document"in self?document.currentScript.src:"")||location.href;if(s[r])return;let u={};const a=e=>l(e,r),t={module:{uri:r},exports:u,require:a};s[r]=Promise.all(i.map((e=>t[e]||a(e)))).then((e=>(n(...e),u)))}}define(["./workbox-e0782b83"],(function(e){"use strict";self.addEventListener("message",(e=>{e.data&&"SKIP_WAITING"===e.data.type&&self.skipWaiting()})),e.precacheAndRoute([{url:"_app/immutable/assets/_page-d75f51ba.css",revision:null},{url:"_app/immutable/chunks/_layout-79cb23d1.js",revision:null},{url:"_app/immutable/chunks/0-ab384157.js",revision:null},{url:"_app/immutable/chunks/1-fd497d6b.js",revision:null},{url:"_app/immutable/chunks/2-075c87ff.js",revision:null},{url:"_app/immutable/chunks/index-81fe78fb.js",revision:null},{url:"_app/immutable/chunks/singletons-a6aaafc7.js",revision:null},{url:"_app/immutable/components/error.svelte-33a98830.js",revision:null},{url:"_app/immutable/components/layout.svelte-b53a269f.js",revision:null},{url:"_app/immutable/components/pages/_page.svelte-27eebb89.js",revision:null},{url:"_app/immutable/modules/pages/_layout.ts-5612100c.js",revision:null},{url:"_app/immutable/start-69592493.js",revision:null},{url:"400x400.png",revision:"b402bb9f0f264e2282c9b5a1a9b8545d"},{url:"favicon.png",revision:"b402bb9f0f264e2282c9b5a1a9b8545d"},{url:"registerSW.js",revision:"a2fbd7055d5b948db30510ee78129114"},{url:"/Transcribe/",revision:"43faa93bedaf2ebe2fe7c0860b9bd5db"},{url:"manifest.webmanifest",revision:"69cbb1a906b719557d8607aef1bee876"}],{}),e.cleanupOutdatedCaches(),e.registerRoute(new e.NavigationRoute(e.createHandlerBoundToURL("/Transcribe/")))}));
