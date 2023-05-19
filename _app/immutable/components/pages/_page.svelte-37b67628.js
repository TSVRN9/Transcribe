import{S as ne,i as re,s as se,k as T,a as w,e as ee,l as E,m as R,h as m,c as I,n as N,b as D,H as p,J as O,C as te,K as Te,L as be,M as de,B as Ee,N as De,q as L,r as P,O as he,o as Re,j as Ve,u as oe,t as ae,d as Oe,f as ue,g as Se,v as A,P as F,x as Ne,y as we,z as Ie,Q as M,A as Ue}from"../../chunks/index-5bcbde61.js";function ye(a){let t,u,d,i,f,n=!1,o,b=!0,_,h,s,r;function l(){cancelAnimationFrame(o),i.paused||(o=De(l),n=!0),a[10].call(i)}return{c(){t=T("div"),u=T("div"),d=w(),i=T("audio"),_=w(),h=T("div"),this.h()},l(e){t=E(e,"DIV",{class:!0});var c=R(t);u=E(c,"DIV",{}),R(u).forEach(m),d=I(c),i=E(c,"AUDIO",{src:!0}),R(i).forEach(m),_=I(c),h=E(c,"DIV",{}),R(h).forEach(m),c.forEach(m),this.h()},h(){i.controls=!0,be(i.src,f=URL.createObjectURL(a[6]))||N(i,"src",f),N(t,"class","grid")},m(e,c){D(e,t,c),p(t,u),p(t,d),p(t,i),isNaN(a[0])||(i.playbackRate=a[0]),isNaN(a[2])||(i.volume=a[2]),i.muted=a[3],p(t,_),p(t,h),s||(r=[O(i,"ratechange",a[9]),O(i,"timeupdate",l),O(i,"play",a[11]),O(i,"pause",a[11]),O(i,"volumechange",a[12])],s=!0)},p(e,c){c&64&&!be(i.src,f=URL.createObjectURL(e[6]))&&N(i,"src",f),c&1&&!isNaN(e[0])&&(i.playbackRate=e[0]),!n&&c&32&&!isNaN(e[5])&&(i.currentTime=e[5]),n=!1,c&2&&b!==(b=e[1])&&i[b?"pause":"play"](),c&4&&!isNaN(e[2])&&(i.volume=e[2]),c&8&&(i.muted=e[3])},d(e){e&&m(t),s=!1,de(r)}}}function Le(a){let t,u,d,i,f,n,o,b,_,h,s=a[6]&&ye(a);return{c(){t=T("div"),u=T("div"),d=w(),i=T("input"),f=w(),n=T("div"),o=w(),s&&s.c(),b=ee(),this.h()},l(r){t=E(r,"DIV",{class:!0});var l=R(t);u=E(l,"DIV",{}),R(u).forEach(m),d=I(l),i=E(l,"INPUT",{type:!0,accept:!0}),f=I(l),n=E(l,"DIV",{}),R(n).forEach(m),l.forEach(m),o=I(r),s&&s.l(r),b=ee(),this.h()},h(){N(i,"type","file"),N(i,"accept",".mp3, .ogg, .wav"),N(t,"class","grid")},m(r,l){D(r,t,l),p(t,u),p(t,d),p(t,i),p(t,f),p(t,n),D(r,o,l),s&&s.m(r,l),D(r,b,l),_||(h=O(i,"change",a[8]),_=!0)},p(r,[l]){r[6]?s?s.p(r,l):(s=ye(r),s.c(),s.m(b.parentNode,b)):s&&(s.d(1),s=null)},i:te,o:te,d(r){r&&m(t),r&&m(o),s&&s.d(r),r&&m(b),_=!1,h()}}}function Pe(a,t,u){let d;const i=Te();let f,n=0,{playbackRate:o=1,currentTime:b=0,paused:_=!0,volume:h=1,muted:s=!1}=t;async function r(g){await Ee(),u(5,n=g),u(1,_=!1)}function l(){f=this.files,u(4,f)}function e(){o=this.playbackRate,u(0,o)}function c(){n=this.currentTime,u(5,n)}function y(){_=this.paused,u(1,_)}function v(){h=this.volume,s=this.muted,u(2,h),u(3,s)}return a.$$set=g=>{"playbackRate"in g&&u(0,o=g.playbackRate),"currentTime"in g&&u(7,b=g.currentTime),"paused"in g&&u(1,_=g.paused),"volume"in g&&u(2,h=g.volume),"muted"in g&&u(3,s=g.muted)},a.$$.update=()=>{a.$$.dirty&16&&u(6,d=f==null?void 0:f[0]),a.$$.dirty&64&&i("ready",!!d),a.$$.dirty&32&&u(7,b=n),a.$$.dirty&128&&r(b)},[o,_,h,s,f,n,d,b,l,e,c,y,v]}class Be extends ne{constructor(t){super(),re(this,t,Pe,Le,se,{playbackRate:0,currentTime:7,paused:1,volume:2,muted:3})}}function ve(a){let t,u;return{c(){t=T("div"),u=L(a[1])},l(d){t=E(d,"DIV",{});var i=R(t);u=P(i,a[1]),i.forEach(m)},m(d,i){D(d,t,i),p(t,u)},p(d,i){i&2&&oe(u,d[1])},d(d){d&&m(t)}}}function Ce(a){let t,u,d,i,f,n,o,b,_,h,s,r=a[1]&&ve(a);return{c(){t=T("div"),u=T("input"),d=w(),i=T("button"),f=L("Load Video"),n=w(),o=T("div"),b=w(),r&&r.c(),_=ee(),this.h()},l(l){t=E(l,"DIV",{});var e=R(t);u=E(e,"INPUT",{type:!0,placeholder:!0}),d=I(e),i=E(e,"BUTTON",{});var c=R(i);f=P(c,"Load Video"),c.forEach(m),e.forEach(m),n=I(l),o=E(l,"DIV",{id:!0}),R(o).forEach(m),b=I(l),r&&r.l(l),_=ee(),this.h()},h(){N(u,"type","text"),N(u,"placeholder","Paste YouTube link"),N(o,"id","youtube-player")},m(l,e){D(l,t,e),p(t,u),he(u,a[0]),p(t,d),p(t,i),p(i,f),D(l,n,e),D(l,o,e),D(l,b,e),r&&r.m(l,e),D(l,_,e),h||(s=[O(u,"input",a[8]),O(i,"click",a[2])],h=!0)},p(l,[e]){e&1&&u.value!==l[0]&&he(u,l[0]),l[1]?r?r.p(l,e):(r=ve(l),r.c(),r.m(_.parentNode,_)):r&&(r.d(1),r=null)},i:te,o:te,d(l){l&&m(t),l&&m(n),l&&m(o),l&&m(b),r&&r.d(l),l&&m(_),h=!1,de(s)}}}function Ae(a,t,u){let{playbackRate:d}=t,{currentTime:i}=t,{paused:f}=t,{volume:n}=t,{muted:o}=t;const b=Te();let _="",h,s="";const r=()=>{if(!_)return;const e=new YT.Player("youtube-player",{videoId:_,playerVars:{autoplay:1,controls:0,disablekb:1,enablejsapi:1,iv_load_policy:3,modestbranding:1,playsinline:1,origin:window.location.origin},events:{onReady:()=>{h=e,b("ready",!0)},onError:c=>{u(1,s="Error: Unable to play the video."),console.error("YouTube Player Error:",c.data),b("ready",!1)}}})};Re(()=>{const e=document.createElement("script");e.src="https://www.youtube.com/iframe_api",(document.head||document.getElementsByTagName("head")[0]).appendChild(e)}),Ve(()=>{h&&(h.setPlaybackRate(d),h.seekTo(i,!0),f?h.pauseVideo():h.playVideo(),h.setVolume(n*100),o?h.mute():h.unmute())});function l(){_=this.value,u(0,_)}return a.$$set=e=>{"playbackRate"in e&&u(3,d=e.playbackRate),"currentTime"in e&&u(4,i=e.currentTime),"paused"in e&&u(5,f=e.paused),"volume"in e&&u(6,n=e.volume),"muted"in e&&u(7,o=e.muted)},u(1,s=""),[_,s,r,d,i,f,n,o,l]}class Fe extends ne{constructor(t){super(),re(this,t,Ae,Ce,se,{playbackRate:3,currentTime:4,paused:5,volume:6,muted:7})}}function Me(a){return Object.entries(a).reduce((t,[u,d])=>({...t,[d]:u}),{})}function ge(a){const t=Math.floor(a/3600).toString().padStart(2,"0"),u=Math.floor(a%3600/60).toString().padStart(2,"0"),d=Math.floor(a%60).toString().padStart(2,"0");return t+":"+u+":"+d}function je(a){let t,u,d,i,f,n,o;function b(e){a[22](e)}function _(e){a[23](e)}function h(e){a[24](e)}function s(e){a[25](e)}function r(e){a[26](e)}let l={};return a[2]!==void 0&&(l.playbackRate=a[2]),a[3]!==void 0&&(l.currentTime=a[3]),a[4]!==void 0&&(l.paused=a[4]),a[5]!==void 0&&(l.volume=a[5]),a[6]!==void 0&&(l.muted=a[6]),t=new Fe({props:l}),A.push(()=>F(t,"playbackRate",b,a[2])),A.push(()=>F(t,"currentTime",_,a[3])),A.push(()=>F(t,"paused",h,a[4])),A.push(()=>F(t,"volume",s,a[5])),A.push(()=>F(t,"muted",r,a[6])),t.$on("ready",a[27]),{c(){Ne(t.$$.fragment)},l(e){we(t.$$.fragment,e)},m(e,c){Ie(t,e,c),o=!0},p(e,c){const y={};!u&&c[0]&4&&(u=!0,y.playbackRate=e[2],M(()=>u=!1)),!d&&c[0]&8&&(d=!0,y.currentTime=e[3],M(()=>d=!1)),!i&&c[0]&16&&(i=!0,y.paused=e[4],M(()=>i=!1)),!f&&c[0]&32&&(f=!0,y.volume=e[5],M(()=>f=!1)),!n&&c[0]&64&&(n=!0,y.muted=e[6],M(()=>n=!1)),t.$set(y)},i(e){o||(ue(t.$$.fragment,e),o=!0)},o(e){ae(t.$$.fragment,e),o=!1},d(e){Ue(t,e)}}}function qe(a){let t,u,d,i,f,n,o;function b(e){a[16](e)}function _(e){a[17](e)}function h(e){a[18](e)}function s(e){a[19](e)}function r(e){a[20](e)}let l={};return a[2]!==void 0&&(l.playbackRate=a[2]),a[3]!==void 0&&(l.currentTime=a[3]),a[4]!==void 0&&(l.paused=a[4]),a[5]!==void 0&&(l.volume=a[5]),a[6]!==void 0&&(l.muted=a[6]),t=new Be({props:l}),A.push(()=>F(t,"playbackRate",b,a[2])),A.push(()=>F(t,"currentTime",_,a[3])),A.push(()=>F(t,"paused",h,a[4])),A.push(()=>F(t,"volume",s,a[5])),A.push(()=>F(t,"muted",r,a[6])),t.$on("ready",a[21]),{c(){Ne(t.$$.fragment)},l(e){we(t.$$.fragment,e)},m(e,c){Ie(t,e,c),o=!0},p(e,c){const y={};!u&&c[0]&4&&(u=!0,y.playbackRate=e[2],M(()=>u=!1)),!d&&c[0]&8&&(d=!0,y.currentTime=e[3],M(()=>d=!1)),!i&&c[0]&16&&(i=!0,y.paused=e[4],M(()=>i=!1)),!f&&c[0]&32&&(f=!0,y.volume=e[5],M(()=>f=!1)),!n&&c[0]&64&&(n=!0,y.muted=e[6],M(()=>n=!1)),t.$set(y)},i(e){o||(ue(t.$$.fragment,e),o=!0)},o(e){ae(t.$$.fragment,e),o=!1},d(e){Ue(t,e)}}}function ke(a){let t,u,d,i,f,n=ge(a[1])+"",o,b,_,h,s,r,l,e,c,y,v,g,S,Y,V,j,K,Q,z,G=Math.round(a[2]*10)*10+"",H,W,X,q,Z,$,x;return{c(){t=T("article"),u=T("section"),d=w(),i=T("div"),f=L("🚩: "),o=L(n),b=w(),_=T("section"),h=w(),s=T("div"),r=T("button"),l=L("⏮"),e=w(),c=T("button"),y=L("🚩"),v=w(),g=T("button"),S=L("❌"),Y=w(),V=T("div"),j=T("button"),K=L("🐢"),Q=w(),z=T("button"),H=L(G),W=L("%"),X=w(),q=T("button"),Z=L("🐇"),this.h()},l(C){t=E(C,"ARTICLE",{class:!0});var U=R(t);u=E(U,"SECTION",{}),R(u).forEach(m),d=I(U),i=E(U,"DIV",{class:!0});var k=R(i);f=P(k,"🚩: "),o=P(k,n),k.forEach(m),b=I(U),_=E(U,"SECTION",{}),R(_).forEach(m),h=I(U),s=E(U,"DIV",{class:!0});var B=R(s);r=E(B,"BUTTON",{"data-tooltip":!0});var fe=R(r);l=P(fe,"⏮"),fe.forEach(m),e=I(B),c=E(B,"BUTTON",{"data-tooltip":!0});var ce=R(c);y=P(ce,"🚩"),ce.forEach(m),v=I(B),g=E(B,"BUTTON",{"data-tooltip":!0});var _e=R(g);S=P(_e,"❌"),_e.forEach(m),B.forEach(m),Y=I(U),V=E(U,"DIV",{class:!0});var J=R(V);j=E(J,"BUTTON",{"data-tooltip":!0});var pe=R(j);K=P(pe,"🐢"),pe.forEach(m),Q=I(J),z=E(J,"BUTTON",{});var ie=R(z);H=P(ie,G),W=P(ie,"%"),ie.forEach(m),X=I(J),q=E(J,"BUTTON",{"data-tooltip":!0});var me=R(q);Z=P(me,"🐇"),me.forEach(m),J.forEach(m),U.forEach(m),this.h()},h(){N(i,"class","centered svelte-4xoqdr"),N(r,"data-tooltip","Go Back ("+a[14]("rewind")+")"),N(c,"data-tooltip","Flag ("+a[14]("flag")+")"),N(g,"data-tooltip","Reset Flag ("+a[14]("resetFlag")+")"),N(s,"class","grid"),N(j,"data-tooltip","Slow Down ("+a[14]("slowDown")+")"),N(q,"data-tooltip","Speed Up ("+a[14]("speedUp")+")"),N(V,"class","grid"),N(t,"class","container")},m(C,U){D(C,t,U),p(t,u),p(t,d),p(t,i),p(i,f),p(i,o),p(t,b),p(t,_),p(t,h),p(t,s),p(s,r),p(r,l),p(s,e),p(s,c),p(c,y),p(s,v),p(s,g),p(g,S),p(t,Y),p(t,V),p(V,j),p(j,K),p(V,Q),p(V,z),p(z,H),p(z,W),p(V,X),p(V,q),p(q,Z),$||(x=[O(r,"click",a[11]),O(c,"click",a[9]),O(g,"click",a[10]),O(j,"click",a[13]),O(q,"click",a[12])],$=!0)},p(C,U){U[0]&2&&n!==(n=ge(C[1])+"")&&oe(o,n),U[0]&4&&G!==(G=Math.round(C[2]*10)*10+"")&&oe(H,G)},d(C){C&&m(t),$=!1,de(x)}}}function Ye(a){let t,u,d,i,f,n,o,b,_,h,s,r;const l=[qe,je],e=[];function c(v,g){return v[0]==="local"?0:v[0]==="youtube"?1:-1}~(n=c(a))&&(o=e[n]=l[n](a));let y=a[7]&&ke(a);return{c(){t=T("article"),u=T("button"),d=L("Change Source"),i=w(),f=T("article"),o&&o.c(),b=w(),_=T("div"),y&&y.c(),this.h()},l(v){t=E(v,"ARTICLE",{class:!0});var g=R(t);u=E(g,"BUTTON",{});var S=R(u);d=P(S,"Change Source"),S.forEach(m),g.forEach(m),i=I(v),f=E(v,"ARTICLE",{class:!0});var Y=R(f);o&&o.l(Y),Y.forEach(m),b=I(v),_=E(v,"DIV",{});var V=R(_);y&&y.l(V),V.forEach(m),this.h()},h(){N(t,"class","container"),N(f,"class","container")},m(v,g){D(v,t,g),p(t,u),p(u,d),D(v,i,g),D(v,f,g),~n&&e[n].m(f,null),D(v,b,g),D(v,_,g),y&&y.m(_,null),h=!0,s||(r=O(u,"click",a[15]),s=!0)},p(v,g){let S=n;n=c(v),n===S?~n&&e[n].p(v,g):(o&&(Se(),ae(e[S],1,1,()=>{e[S]=null}),Oe()),~n?(o=e[n],o?o.p(v,g):(o=e[n]=l[n](v),o.c()),ue(o,1),o.m(f,null)):o=null),v[7]?y?y.p(v,g):(y=ke(v),y.c(),y.m(_,null)):y&&(y.d(1),y=null)},i(v){h||(ue(o),h=!0)},o(v){ae(o),h=!1},d(v){v&&m(t),v&&m(i),v&&m(f),~n&&e[n].d(),v&&m(b),v&&m(_),y&&y.d(),s=!1,r()}}}const le=.1;function ze(a,t,u){let d="local",i=0,f=1,n=0,o=!0,b=1,_=!1,h=!1;function s(k,B){d===k&&u(7,h=B.detail)}const r={flag:()=>u(1,i=n),resetFlag:()=>u(1,i=0),rewind:async()=>{await Ee(),u(3,n=i)},speedUp:()=>u(2,f+=le),slowDown:()=>{f-le>0&&u(2,f-=le)},togglePlayback:()=>u(4,o=!o)},{flag:l,resetFlag:e,rewind:c,speedUp:y,slowDown:v,togglePlayback:g}=r,S={v:"resetFlag",f:"flag",r:"rewind",">":"speedUp","<":"slowDown"," ":"togglePlayback"},Y=Me(S);function V(k){return Y[k]}function j(k){const B=S[k.key];B&&r[B]()}Re(()=>{document.addEventListener("keyup",j)});const K=()=>u(0,d=d=="local"?"youtube":"local");function Q(k){f=k,u(2,f)}function z(k){n=k,u(3,n)}function G(k){o=k,u(4,o)}function H(k){b=k,u(5,b)}function W(k){_=k,u(6,_)}const X=k=>s("local",k);function q(k){f=k,u(2,f)}function Z(k){n=k,u(3,n)}function $(k){o=k,u(4,o)}function x(k){b=k,u(5,b)}function C(k){_=k,u(6,_)}return[d,i,f,n,o,b,_,h,s,l,e,c,y,v,V,K,Q,z,G,H,W,X,q,Z,$,x,C,k=>s("youtube",k)]}class He extends ne{constructor(t){super(),re(this,t,ze,Ye,se,{},null,[-1,-1])}}export{He as default};