import{A as ne,s as Re,f as g,a as N,e as fe,g as y,h as T,d as m,c as U,j as R,i as F,w as c,C as S,D as pe,E as Ae,F as Xe,G as we,t as De,I as Ge,J as Me,o as Je,K as Ze,b as $e,l as B,m as C,n as ue,p as K,L as z}from"../chunks/scheduler.782c3151.js";import{S as Ie,i as Ne,t as _e,c as xe,a as me,g as et,f as H,b as Ke,d as ze,m as He,e as Qe}from"../chunks/index.549c4d75.js";const tt=typeof window<"u";let at=tt?a=>requestAnimationFrame(a):ne;function je(a){let e,l,f,o,p,n=!1,r,h=!0,_,v,s,t;function i(){cancelAnimationFrame(r),o.paused||(r=at(i),n=!0),a[11].call(o)}return{c(){e=g("div"),l=g("div"),f=N(),o=g("audio"),_=N(),v=g("div"),this.h()},l(u){e=y(u,"DIV",{class:!0});var E=T(e);l=y(E,"DIV",{}),T(l).forEach(m),f=U(E),o=y(E,"AUDIO",{src:!0}),T(o).forEach(m),_=U(E),v=y(E,"DIV",{}),T(v).forEach(m),E.forEach(m),this.h()},h(){o.controls=!0,Ae(o.src,p=URL.createObjectURL(a[7]))||R(o,"src",p),a[6]===void 0&&Xe(()=>a[14].call(o)),R(e,"class","grid")},m(u,E){F(u,e,E),c(e,l),c(e,f),c(e,o),isNaN(a[0])||(o.playbackRate=a[0]),isNaN(a[2])||(o.volume=a[2]),o.muted=a[3],c(e,_),c(e,v),s||(t=[S(o,"ratechange",a[10]),S(o,"timeupdate",i),S(o,"play",a[12]),S(o,"pause",a[12]),S(o,"volumechange",a[13]),S(o,"durationchange",a[14])],s=!0)},p(u,E){E&128&&!Ae(o.src,p=URL.createObjectURL(u[7]))&&R(o,"src",p),E&1&&!isNaN(u[0])&&(o.playbackRate=u[0]),!n&&E&32&&!isNaN(u[5])&&(o.currentTime=u[5]),n=!1,E&2&&h!==(h=u[1])&&o[h?"pause":"play"](),E&4&&!isNaN(u[2])&&(o.volume=u[2]),E&8&&(o.muted=u[3])},d(u){u&&m(e),s=!1,we(t)}}}function lt(a){let e,l,f,o,p,n,r,h,_,v,s=a[7]&&je(a);return{c(){e=g("div"),l=g("div"),f=N(),o=g("input"),p=N(),n=g("div"),r=N(),s&&s.c(),h=fe(),this.h()},l(t){e=y(t,"DIV",{class:!0});var i=T(e);l=y(i,"DIV",{}),T(l).forEach(m),f=U(i),o=y(i,"INPUT",{type:!0,accept:!0}),p=U(i),n=y(i,"DIV",{}),T(n).forEach(m),i.forEach(m),r=U(t),s&&s.l(t),h=fe(),this.h()},h(){R(o,"type","file"),R(o,"accept",".mp3, .ogg, .wav"),R(e,"class","grid")},m(t,i){F(t,e,i),c(e,l),c(e,f),c(e,o),c(e,p),c(e,n),F(t,r,i),s&&s.m(t,i),F(t,h,i),_||(v=S(o,"change",a[9]),_=!0)},p(t,[i]){t[7]?s?s.p(t,i):(s=je(t),s.c(),s.m(h.parentNode,h)):s&&(s.d(1),s=null)},i:ne,o:ne,d(t){t&&(m(e),m(r),m(h)),s&&s.d(t),_=!1,v()}}}function ot(a,e,l){let f;const o=pe(),p=pe();let n,r=0,h=0,_=0,{playbackRate:v=1,paused:s=!0,volume:t=1,muted:i=!1}=e;async function u(V){await De(),l(5,h=V),p("currentTime",{currentTime:r})}function E(){n=this.files,l(4,n)}function k(){v=this.playbackRate,l(0,v)}function d(){h=this.currentTime,l(5,h)}function w(){s=this.paused,l(1,s)}function D(){t=this.volume,i=this.muted,l(2,t),l(3,i)}function P(){_=this.duration,l(6,_)}return a.$$set=V=>{"playbackRate"in V&&l(0,v=V.playbackRate),"paused"in V&&l(1,s=V.paused),"volume"in V&&l(2,t=V.volume),"muted"in V&&l(3,i=V.muted)},a.$$.update=()=>{a.$$.dirty&16&&l(7,f=n==null?void 0:n[0]),a.$$.dirty&192&&o("ready",{isReady:!!f,audioLength:f?_:0,seek:V=>{u(V)}}),a.$$.dirty&32&&l(8,r=h),a.$$.dirty&256&&u(r)},[v,s,t,i,n,h,_,f,r,E,k,d,w,D,P]}class it extends Ie{constructor(e){super(),Ne(this,e,ot,lt,Re,{playbackRate:0,paused:1,volume:2,muted:3})}}const We=()=>{};function qe(a){let e,l;return{c(){e=g("div"),l=B(a[1])},l(f){e=y(f,"DIV",{});var o=T(e);l=C(o,a[1]),o.forEach(m)},m(f,o){F(f,e,o),c(e,l)},p(f,o){o&2&&ue(l,f[1])},d(f){f&&m(e)}}}function ut(a){let e,l,f,o,p="Load Video",n,r,h,_,v,s,t=a[1]&&qe(a);return{c(){e=g("div"),l=g("input"),f=N(),o=g("button"),o.textContent=p,n=N(),r=g("div"),h=N(),t&&t.c(),_=fe(),this.h()},l(i){e=y(i,"DIV",{});var u=T(e);l=y(u,"INPUT",{type:!0,placeholder:!0}),f=U(u),o=y(u,"BUTTON",{["data-svelte-h"]:!0}),Ge(o)!=="svelte-10jhki2"&&(o.textContent=p),u.forEach(m),n=U(i),r=y(i,"DIV",{id:!0}),T(r).forEach(m),h=U(i),t&&t.l(i),_=fe(),this.h()},h(){R(l,"type","text"),R(l,"placeholder","Paste YouTube link"),R(r,"id","youtube-player")},m(i,u){F(i,e,u),c(e,l),Me(l,a[0]),c(e,f),c(e,o),F(i,n,u),F(i,r,u),F(i,h,u),t&&t.m(i,u),F(i,_,u),v||(s=[S(l,"input",a[7]),S(o,"click",a[2])],v=!0)},p(i,[u]){u&1&&l.value!==i[0]&&Me(l,i[0]),i[1]?t?t.p(i,u):(t=qe(i),t.c(),t.m(_.parentNode,_)):t&&(t.d(1),t=null)},i:ne,o:ne,d(i){i&&(m(e),m(n),m(r),m(h),m(_)),t&&t.d(i),v=!1,we(s)}}}function nt(a,e,l){let f,{playbackRate:o}=e,{paused:p}=e,{volume:n}=e,{muted:r}=e;const h=pe(),_=pe();let v,s="",t,i="",u;const E=()=>{if(console.log(f),!f)return;const d=new YT.Player("youtube-player",{width:1,height:1,videoId:f,playerVars:{autoplay:1,controls:0,disablekb:1,enablejsapi:1,iv_load_policy:3,modestbranding:1,playsinline:1,origin:window.location.origin},events:{onReady:()=>{t=d,h("ready",{isReady:!0,audioLength:d.getDuration(),seek:w=>{t.seekTo(w)}})},onError:w=>{l(1,i="Error: Unable to play the video."),console.error("YouTube Player Error:",w.data),h("ready",{isReady:!1,audioLength:0,seek:We})},onStateChange:w=>{l(3,p=w.data==YT.PlayerState.PAUSED)}}})};Je(()=>{v=document.createElement("script"),v.src="https://www.youtube.com/iframe_api",(document.head||document.getElementsByTagName("head")[0]).appendChild(v),u=setInterval(()=>{t&&_("currentTime",{currentTime:t.getCurrentTime()})},50)}),Ze(()=>{(document.head||document.getElementsByTagName("head")[0]).removeChild(v),clearInterval(u)}),$e(async()=>{t&&(await De(),t.getPlaybackRate()!=o&&t.setPlaybackRate(o),p?t.pauseVideo():t.playVideo(),t.setVolume(n*100),r?t.mute():t.unMute())});function k(){s=this.value,l(0,s)}return a.$$set=d=>{"playbackRate"in d&&l(4,o=d.playbackRate),"paused"in d&&l(3,p=d.paused),"volume"in d&&l(5,n=d.volume),"muted"in d&&l(6,r=d.muted)},a.$$.update=()=>{a.$$.dirty&1&&(f=(()=>{try{return s?new URLSearchParams(new URL(s).search).get("v"):void 0}catch{}})())},l(1,i=""),[s,i,E,p,o,n,r,k]}class st extends Ie{constructor(e){super(),Ne(this,e,nt,ut,Re,{playbackRate:4,paused:3,volume:5,muted:6})}}function rt(a){return Object.entries(a).reduce((e,[l,f])=>({...e,[f]:l}),{})}function ce(a){const e=Math.floor(a/3600).toString().padStart(2,"0"),l=Math.floor(a%3600/60).toString().padStart(2,"0"),f=Math.floor(a%60).toString().padStart(2,"0");return e+":"+l+":"+f}function dt(a){let e,l,f,o,p,n;function r(t){a[26](t)}function h(t){a[27](t)}function _(t){a[28](t)}function v(t){a[29](t)}let s={};return a[2]!==void 0&&(s.playbackRate=a[2]),a[4]!==void 0&&(s.paused=a[4]),a[5]!==void 0&&(s.volume=a[5]),a[6]!==void 0&&(s.muted=a[6]),e=new st({props:s}),K.push(()=>H(e,"playbackRate",r)),K.push(()=>H(e,"paused",h)),K.push(()=>H(e,"volume",_)),K.push(()=>H(e,"muted",v)),e.$on("ready",a[30]),e.$on("currentTime",a[31]),{c(){Ke(e.$$.fragment)},l(t){ze(e.$$.fragment,t)},m(t,i){He(e,t,i),n=!0},p(t,i){const u={};!l&&i[0]&4&&(l=!0,u.playbackRate=t[2],z(()=>l=!1)),!f&&i[0]&16&&(f=!0,u.paused=t[4],z(()=>f=!1)),!o&&i[0]&32&&(o=!0,u.volume=t[5],z(()=>o=!1)),!p&&i[0]&64&&(p=!0,u.muted=t[6],z(()=>p=!1)),e.$set(u)},i(t){n||(me(e.$$.fragment,t),n=!0)},o(t){_e(e.$$.fragment,t),n=!1},d(t){Qe(e,t)}}}function ct(a){let e,l,f,o,p,n;function r(t){a[20](t)}function h(t){a[21](t)}function _(t){a[22](t)}function v(t){a[23](t)}let s={};return a[2]!==void 0&&(s.playbackRate=a[2]),a[4]!==void 0&&(s.paused=a[4]),a[5]!==void 0&&(s.volume=a[5]),a[6]!==void 0&&(s.muted=a[6]),e=new it({props:s}),K.push(()=>H(e,"playbackRate",r)),K.push(()=>H(e,"paused",h)),K.push(()=>H(e,"volume",_)),K.push(()=>H(e,"muted",v)),e.$on("ready",a[24]),e.$on("currentTime",a[25]),{c(){Ke(e.$$.fragment)},l(t){ze(e.$$.fragment,t)},m(t,i){He(e,t,i),n=!0},p(t,i){const u={};!l&&i[0]&4&&(l=!0,u.playbackRate=t[2],z(()=>l=!1)),!f&&i[0]&16&&(f=!0,u.paused=t[4],z(()=>f=!1)),!o&&i[0]&32&&(o=!0,u.volume=t[5],z(()=>o=!1)),!p&&i[0]&64&&(p=!0,u.muted=t[6],z(()=>p=!1)),e.$set(u)},i(t){n||(me(e.$$.fragment,t),n=!0)},o(t){_e(e.$$.fragment,t),n=!1},d(t){Qe(e,t)}}}function Ye(a){let e,l,f,o,p,n=ce(a[3])+"",r,h,_,v,s=ce(a[1])+"",t,i,u,E,k,d,w,D,P,V,X,j,x,ee,q,te,ae,Y,Q=a[4]?"▶️":"⏸",Z,le,G,oe,ie,L,J,se,re,b,O=Math.round(a[2]*10)*10+"",de,he,be,W,ve,ge,Ue;return{c(){e=g("article"),l=g("section"),f=N(),o=g("div"),p=B("⏱️: "),r=B(n),h=N(),_=g("div"),v=B("🚩: "),t=B(s),i=N(),u=g("section"),E=N(),k=g("div"),d=g("input"),w=N(),D=g("div"),P=g("button"),V=B("⏮"),X=N(),j=g("button"),x=B("◀️"),ee=N(),q=g("button"),te=B("🚩"),ae=N(),Y=g("button"),Z=B(Q),le=N(),G=g("button"),oe=B("❌"),ie=N(),L=g("div"),J=g("button"),se=B("🐢"),re=N(),b=g("button"),de=B(O),he=B("%"),be=N(),W=g("button"),ve=B("🐇"),this.h()},l(A){e=y(A,"ARTICLE",{class:!0});var I=T(e);l=y(I,"SECTION",{}),T(l).forEach(m),f=U(I),o=y(I,"DIV",{class:!0});var ye=T(o);p=C(ye,"⏱️: "),r=C(ye,n),ye.forEach(m),h=U(I),_=y(I,"DIV",{class:!0});var ke=T(_);v=C(ke,"🚩: "),t=C(ke,s),ke.forEach(m),i=U(I),u=y(I,"SECTION",{}),T(u).forEach(m),E=U(I),k=y(I,"DIV",{class:!0});var Ve=T(k);d=y(Ve,"INPUT",{type:!0,min:!0,max:!0}),Ve.forEach(m),w=U(I),D=y(I,"DIV",{class:!0});var M=T(D);P=y(M,"BUTTON",{"data-tooltip":!0});var Se=T(P);V=C(Se,"⏮"),Se.forEach(m),X=U(M),j=y(M,"BUTTON",{"data-tooltip":!0});var Fe=T(j);x=C(Fe,"◀️"),Fe.forEach(m),ee=U(M),q=y(M,"BUTTON",{"data-tooltip":!0});var Pe=T(q);te=C(Pe,"🚩"),Pe.forEach(m),ae=U(M),Y=y(M,"BUTTON",{"data-tooltip":!0});var Be=T(Y);Z=C(Be,Q),Be.forEach(m),le=U(M),G=y(M,"BUTTON",{"data-tooltip":!0});var Ce=T(G);oe=C(Ce,"❌"),Ce.forEach(m),M.forEach(m),ie=U(I),L=y(I,"DIV",{class:!0});var $=T(L);J=y($,"BUTTON",{"data-tooltip":!0});var Le=T(J);se=C(Le,"🐢"),Le.forEach(m),re=U($),b=y($,"BUTTON",{});var Te=T(b);de=C(Te,O),he=C(Te,"%"),Te.forEach(m),be=U($),W=y($,"BUTTON",{"data-tooltip":!0});var Oe=T(W);ve=C(Oe,"🐇"),Oe.forEach(m),$.forEach(m),I.forEach(m),this.h()},h(){R(o,"class","centered svelte-4xoqdr"),R(_,"class","centered svelte-4xoqdr"),R(d,"type","range"),d.value=a[3],R(d,"min","0"),R(d,"max",a[8]),R(k,"class","grid"),R(P,"data-tooltip","Go Back ("+a[18]("rewind")+")"),R(j,"data-tooltip","Push Flag Back ("+a[18]("pushFlagBack")+")"),R(q,"data-tooltip","Flag ("+a[18]("placeFlag")+")"),R(Y,"data-tooltip","Pause/Unpause ("+a[18]("togglePlayback")+")"),R(G,"data-tooltip","Reset Flag ("+a[18]("resetFlag")+")"),R(D,"class","grid"),R(J,"data-tooltip","Slow Down ("+a[18]("slowDown")+")"),R(W,"data-tooltip","Speed Up ("+a[18]("speedUp")+")"),R(L,"class","grid"),R(e,"class","container")},m(A,I){F(A,e,I),c(e,l),c(e,f),c(e,o),c(o,p),c(o,r),c(e,h),c(e,_),c(_,v),c(_,t),c(e,i),c(e,u),c(e,E),c(e,k),c(k,d),c(e,w),c(e,D),c(D,P),c(P,V),c(D,X),c(D,j),c(j,x),c(D,ee),c(D,q),c(q,te),c(D,ae),c(D,Y),c(Y,Z),c(D,le),c(D,G),c(G,oe),c(e,ie),c(e,L),c(L,J),c(J,se),c(L,re),c(L,b),c(b,de),c(b,he),c(L,be),c(L,W),c(W,ve),ge||(Ue=[S(d,"input",a[32]),S(P,"click",a[13]),S(j,"click",a[17]),S(q,"click",a[11]),S(Y,"click",a[16]),S(G,"click",a[12]),S(J,"click",a[15]),S(W,"click",a[14])],ge=!0)},p(A,I){I[0]&8&&n!==(n=ce(A[3])+"")&&ue(r,n),I[0]&2&&s!==(s=ce(A[1])+"")&&ue(t,s),I[0]&8&&(d.value=A[3]),I[0]&256&&R(d,"max",A[8]),I[0]&16&&Q!==(Q=A[4]?"▶️":"⏸")&&ue(Z,Q),I[0]&4&&O!==(O=Math.round(A[2]*10)*10+"")&&ue(de,O)},d(A){A&&m(e),ge=!1,we(Ue)}}}function ft(a){let e,l,f="Change Source",o,p,n,r,h,_,v,s,t;const i=[ct,dt],u=[];function E(d,w){return d[0]==="local"?0:d[0]==="youtube"?1:-1}~(n=E(a))&&(r=u[n]=i[n](a));let k=a[7]&&Ye(a);return{c(){e=g("article"),l=g("button"),l.textContent=f,o=N(),p=g("article"),r&&r.c(),h=N(),_=g("div"),k&&k.c(),this.h()},l(d){e=y(d,"ARTICLE",{class:!0});var w=T(e);l=y(w,"BUTTON",{["data-svelte-h"]:!0}),Ge(l)!=="svelte-svyboe"&&(l.textContent=f),w.forEach(m),o=U(d),p=y(d,"ARTICLE",{class:!0});var D=T(p);r&&r.l(D),D.forEach(m),h=U(d),_=y(d,"DIV",{});var P=T(_);k&&k.l(P),P.forEach(m),this.h()},h(){R(e,"class","container"),R(p,"class","container")},m(d,w){F(d,e,w),c(e,l),F(d,o,w),F(d,p,w),~n&&u[n].m(p,null),F(d,h,w),F(d,_,w),k&&k.m(_,null),v=!0,s||(t=S(l,"click",a[19]),s=!0)},p(d,w){let D=n;n=E(d),n===D?~n&&u[n].p(d,w):(r&&(et(),_e(u[D],1,1,()=>{u[D]=null}),xe()),~n?(r=u[n],r?r.p(d,w):(r=u[n]=i[n](d),r.c()),me(r,1),r.m(p,null)):r=null),d[7]?k?k.p(d,w):(k=Ye(d),k.c(),k.m(_,null)):k&&(k.d(1),k=null)},i(d){v||(me(r),v=!0)},o(d){_e(r),v=!1},d(d){d&&(m(e),m(o),m(p),m(h),m(_)),~n&&u[n].d(),k&&k.d(),s=!1,t()}}}const Ee=.1;function pt(a,e,l){let f="local",o=0,p=1,n=0,r=!0,h=1,_=!1,v=!1,s=0,t=We;function i(b,O){f===b&&(l(7,v=O.detail.isReady),l(8,s=O.detail.audioLength),l(9,t=O.detail.seek))}const u={placeFlag:()=>l(1,o=n),pushFlagBack:()=>l(1,o=Math.max(0,o-1)),resetFlag:()=>l(1,o=0),rewind:async()=>{await De(),t(o)},speedUp:()=>l(2,p+=Ee),slowDown:()=>{p-Ee>0&&l(2,p-=Ee)},togglePlayback:()=>l(4,r=!r)},{placeFlag:E,resetFlag:k,rewind:d,speedUp:w,slowDown:D,togglePlayback:P,pushFlagBack:V}=u,X={v:"resetFlag",s:"pushFlagBack",f:"placeFlag",r:"rewind",">":"speedUp","<":"slowDown"," ":"togglePlayback"},j=rt(X);function x(b){return j[b]}function ee(b){const O=X[b.key];O&&u[O]()}Je(()=>{document.addEventListener("keyup",ee)});const q=()=>l(0,f=f=="local"?"youtube":"local");function te(b){p=b,l(2,p)}function ae(b){r=b,l(4,r)}function Y(b){h=b,l(5,h)}function Q(b){_=b,l(6,_)}const Z=b=>i("local",b),le=b=>l(3,n=b.detail.currentTime);function G(b){p=b,l(2,p)}function oe(b){r=b,l(4,r)}function ie(b){h=b,l(5,h)}function L(b){_=b,l(6,_)}return[f,o,p,n,r,h,_,v,s,t,i,E,k,d,w,D,P,V,x,q,te,ae,Y,Q,Z,le,G,oe,ie,L,b=>i("youtube",b),b=>l(3,n=b.detail.currentTime),b=>{t(b.target.value)}]}class ht extends Ie{constructor(e){super(),Ne(this,e,pt,ft,Re,{},null,[-1,-1])}}export{ht as component};
